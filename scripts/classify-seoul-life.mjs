import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { consumerCategories, classifyIndustry, brandCandidateFor, taxonomyVersion } from './seoul-life-taxonomy.mjs';

const root=resolve('data/exports/seoul-life-2026-10-14');
const out=resolve(root,'classification');
await mkdir(out,{recursive:true});
const file=name=>{
  const path=resolve(out,name);
  if(!path.startsWith(out+sep)) throw new Error('Classification output outside owned directory');
  return path;
};
const load=name=>readFile(resolve(root,name),'utf8').then(JSON.parse);
const save=(name,value)=>writeFile(file(name),JSON.stringify(value,null,2)+'\n');
const hashFile=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
const coverage=await load('coverage.json');
const verified=await load('verification.json');
const input=resolve(root,'seoul-places.jsonl.gz');
assert.equal(await hashFile(input),coverage.normalizedSha256,'Original input changed; verify before classifying');
assert.equal(coverage.retainedRows,verified.rows);
const dbName=`index-${taxonomyVersion}-${Date.now()}.sqlite`;
const db=new DatabaseSync(file(dbName));
const registry=new Map();
let rows=0;
try {
  db.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA cache_size=-32768;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE taxonomy (leaf_code TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES categories(id), section_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE places (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, name TEXT NOT NULL, branch TEXT,
      district_code TEXT, district TEXT NOT NULL,
      admin_code TEXT, admin_name TEXT, legal_code TEXT, legal_name TEXT,
      leaf_code TEXT NOT NULL REFERENCES taxonomy(leaf_code), category_id TEXT NOT NULL REFERENCES categories(id),
      road_address TEXT, lot_address TEXT, longitude REAL, latitude REAL,
      brand_candidate TEXT, brand_payload TEXT, raw_payload TEXT NOT NULL
    );
    CREATE TABLE chain_stores (id TEXT PRIMARY KEY, brand TEXT NOT NULL, district TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL, raw_payload TEXT NOT NULL);
    BEGIN;
  `);
  const categoryInsert=db.prepare('INSERT INTO categories VALUES (?,?,?)');
  for(const category of consumerCategories) categoryInsert.run(category.id,category.label,JSON.stringify(category));
  const taxonomyInsert=db.prepare('INSERT INTO taxonomy VALUES (?,?,?,?)');
  const placeInsert=db.prepare('INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const stream=createInterface({input:createReadStream(input).pipe(createGunzip()),crlfDelay:Infinity});
  for await(const line of stream) {
    const place=JSON.parse(line);
    const industry=place.industry;
    if(!registry.has(industry.smallCode)) {
      const classification=classifyIndustry(industry);
      const entry={...classification,sourceIndustry:industry};
      registry.set(industry.smallCode,entry);
      taxonomyInsert.run(industry.smallCode,classification.categoryId,classification.sectionId,JSON.stringify(entry));
    }
    const classification=registry.get(industry.smallCode);
    assert.equal(classification.sourceIndustry.small,industry.small,'Conflicting source industry title');
    const brand=brandCandidateFor(place);
    placeInsert.run(place.id,place.sourceId,place.name,place.branch||null,place.districtCode||null,place.district,place.administrativeDongCode||null,place.administrativeDong||null,place.legalDongCode||null,place.legalDong||null,industry.smallCode,classification.categoryId,place.roadAddress||null,place.lotAddress||null,place.longitude,place.latitude,brand?.id||null,brand?JSON.stringify(brand):null,JSON.stringify(place));
    rows++;
    if(rows%10000===0) db.exec('COMMIT; BEGIN;');
    if(rows%100000===0) console.log(JSON.stringify({stage:'classify',rows}));
  }
  db.exec('COMMIT;');
  assert.equal(rows,coverage.retainedRows);
  assert.equal(registry.size,Object.keys(coverage.byIndustry).length);
  const stores=await load('daiso-stores.json');
  const chainInsert=db.prepare('INSERT INTO chain_stores VALUES (?,?,?,?,?,?)');
  db.exec('BEGIN;');
  for(const store of stores) chainInsert.run(store.id,store.brand,store.district,store.name,store.address,JSON.stringify(store));
  db.exec('COMMIT;');
  db.exec(`
    CREATE INDEX places_district_category ON places(district,category_id,leaf_code);
    CREATE INDEX places_admin_category ON places(district,admin_name,category_id,leaf_code);
    CREATE INDEX places_legal_category ON places(district,legal_name,category_id,leaf_code);
    CREATE INDEX places_brand_district ON places(brand_candidate,district,category_id);
    CREATE INDEX places_source_leaf ON places(leaf_code,district);
    CREATE INDEX chain_district ON chain_stores(district,brand);
    ANALYZE;
  `);
  const sourceCounts=db.prepare('SELECT leaf_code,COUNT(*) AS count FROM places GROUP BY leaf_code').all();
  const counts=new Map(sourceCounts.map(value=>[value.leaf_code,value.count]));
  const entries=[...registry.values()].map(entry=>({...entry,count:counts.get(entry.leafCode)})).sort((a,b)=>a.categoryId.localeCompare(b.categoryId)||a.sectionId.localeCompare(b.sectionId)||a.leafCode.localeCompare(b.leafCode));
  const categoryCounts=db.prepare('SELECT category_id,COUNT(*) AS count FROM places GROUP BY category_id ORDER BY category_id').all().map(row=>({...row,label:consumerCategories.find(value=>value.id===row.category_id).label}));
  const brandCounts=db.prepare('SELECT brand_candidate,category_id,COUNT(*) AS count FROM places WHERE brand_candidate IS NOT NULL GROUP BY brand_candidate,category_id ORDER BY count DESC').all();
  const districtCounts=db.prepare('SELECT district,category_id,COUNT(*) AS count FROM places GROUP BY district,category_id ORDER BY district,category_id').all();
  const administrativeAreas=db.prepare('SELECT district_code,district,admin_code AS code,admin_name AS name,category_id,COUNT(*) AS count FROM places GROUP BY district_code,district,admin_code,admin_name,category_id ORDER BY district,admin_name,category_id').all();
  const legalAreas=db.prepare('SELECT district_code,district,legal_code AS code,legal_name AS name,category_id,COUNT(*) AS count FROM places GROUP BY district_code,district,legal_code,legal_name,category_id ORDER BY district,legal_name,category_id').all();
  const unknownAreas=db.prepare('SELECT COUNT(*) AS count FROM places WHERE admin_code IS NULL OR admin_name IS NULL OR legal_code IS NULL OR legal_name IS NULL').get().count;
  const purposes=consumerCategories.map(category=>({id:category.id,label:category.purpose,state:'taxonomy_navigation_intent_not_availability',membershipBasis:'consumer category proposal; not proof of services or stock'}));
  const helpful=await load('helpful-sites.json');
  const helperMap={'복지·돌봄':['public-support'],'일자리·청년':['work-support'],'주거':['housing'],'건강·의료':['health'],'교육·도서관':['learning'],'문화·여가·체육':['leisure','exercise'],'교통·이동':['mobility'],'안전·공공시설':['public-support'],'환경·자원순환':['laundry-clean','public-support'],'소비·법률·금융':['professional','public-support'],'먹거리·생활비':['groceries','shopping','dining'],'민원·행정':['public-support']};
  const siteTaxonomy=helpful.map(site=>({...site,consumerCategoryCandidates:helperMap[site.field]||['review'],classificationState:'field_based_proposal',verificationState:site.verificationState}));
  const attributes={baseline:{records:rows,sourceVerified:{coordinates:rows-coverage.invalidCoordinates,sourceIndustry:rows},unknown:{openingHours:rows,currentOpeningStatus:rows,parking:rows,accessibility:rows,price:rows,reviewScore:rows,individualWebsite:rows,availability:rows},brandCandidates:brandCounts.reduce((sum,value)=>sum+value.count,0),withoutBrandNameCandidate:rows-brandCounts.reduce((sum,value)=>sum+value.count,0)},officialDaiso:{records:stores.length,hoursProvided:stores.filter(store=>store.hours?.opens&&store.hours?.closes).length,facilities:Object.fromEntries(['parking','entranceRamp','elevator','pickup','cashless'].map(key=>[key,{yes:stores.filter(store=>store.facilities?.[key]===true).length,no:stores.filter(store=>store.facilities?.[key]===false).length,unknown:stores.filter(store=>store.facilities?.[key]!==true&&store.facilities?.[key]!==false).length}])),openNowVerified:0,sourceMembership:'official directory only; base source reconciliation not completed'},noGeneratedFacts:['24 hours from brand name','current prices or reviews','open now','business closure','store size','walking distance','stock','brand membership from name']};
  await save('taxonomy.json',{version:taxonomyVersion,state:'proposed',categories:consumerCategories,purposes,entries});
  await save('area-index.json',{version:taxonomyVersion,districtCounts,administrativeAreas,legalAreas,unknownAreas,administrativeAndLegalSeparated:true});
  await save('brand-candidates.json',{version:taxonomyVersion,state:'unverified_name_candidates',counts:brandCounts,officialDaisoSeparate:stores.length,mergedSources:false});
  await save('attribute-coverage.json',attributes);
  await save('helpful-sites-classified.json',siteTaxonomy);
  const corrections={basis:'Replace broad regex inventory with exact official leaf codes; raw inventory retained as historical observation',foodCafe:{oldBroad:25467,exact:entries.filter(entry=>entry.sourceIndustry.large==='음식'&&entry.leafLabel==='카페').reduce((sum,value)=>sum+value.count,0)},studySpace:{separate:entries.filter(entry=>entry.leafLabel==='독서실/스터디 카페').reduce((sum,value)=>sum+value.count,0)},humanHealth:{sourceLarge:'보건의료',count:entries.filter(entry=>entry.sourceIndustry.large==='보건의료').reduce((sum,value)=>sum+value.count,0)},veterinary:{separate:entries.filter(entry=>entry.leafLabel==='동물병원').reduce((sum,value)=>sum+value.count,0)},clinicalHumanFacilities:{oldBroad:18991,exact:entries.filter(entry=>entry.sourceIndustry.large==='보건의료'&&['병원','의원'].includes(entry.sourceIndustry.middle.trim())).reduce((sum,value)=>sum+value.count,0)}};
  await save('inventory-corrections.json',corrections);
  const metadataInsert=db.prepare('INSERT INTO metadata VALUES (?,?)');
  for(const [key,value] of Object.entries({state:'complete',version:taxonomyVersion,rawInputSha256:coverage.normalizedSha256,snapshotDate:coverage.snapshotDate,rawRows:rows,chainRows:stores.length,taxonomyState:'proposed',brandMembership:'unverified_name_candidates',sourcesMerged:false})) metadataInsert.run(key,JSON.stringify(value));
  db.close();
  const report={createdOn:'2026-10-14',version:taxonomyVersion,state:'complete_data_classification_proposal',database:dbName,databaseBytes:(await stat(file(dbName))).size,inputSha256:coverage.normalizedSha256,rows,chainRows:stores.length,sourceIndustries:entries.length,consumerCategoryCount:categoryCounts.length,sourceMiddleGroups:new Set(entries.map(entry=>entry.sourceIndustry.middleCode)).size,consumerSections:new Set(entries.map(entry=>entry.sectionId)).size,districts:new Set(districtCounts.map(value=>value.district)).size,administrativeDongCount:new Set(administrativeAreas.map(value=>`${value.district_code}:${value.code}:${value.name}`)).size,legalDongCount:new Set(legalAreas.map(value=>`${value.district_code}:${value.code}:${value.name}`)).size,unknownAreas,categoryCounts,reviewRows:categoryCounts.find(value=>value.category_id==='review')?.count||0,wholeRealWorldCoverage:false,brandCandidatesConfirmed:false,sourcesMerged:false,sites:siteTaxonomy.length,corrections};
  await save('classification-report.json',report);
  const markdownCell=value=>String(value).replace(/[|\r\n]/g,' ');
  const table=entries.map(entry=>`| ${entry.leafCode} | ${entry.categoryLabel} | ${markdownCell(entry.sectionLabel)} | ${markdownCell(entry.leafLabel)} | ${entry.count.toLocaleString('ko-KR')} |`).join('\n');
  await writeFile(file('taxonomy.md'),`# 서울 생활정보 전체 분류표\n\n원본 ${rows.toLocaleString('ko-KR')}건/공식 업종 ${entries.length}개를 모두 유지합니다. 사용자용 분류는 규칙 기반 제안이며 원본 분류·속성을 대체하지 않습니다. 기준일 ${coverage.snapshotDate}.\n\n| 원본 코드 | 사용자용 대분류 제안 | 원본 중분류 | 세부 업종 | 원본 건수 |\n|---|---|---|---|---:|\n${table}\n`);
  const overview=categoryCounts.map(value=>`| ${value.label} | ${value.count.toLocaleString('ko-KR')} |`).join('\n');
  await writeFile(file('summary.md'),`# 서울 생활정보 2차 분류\n\n기존 원본 ${rows.toLocaleString('ko-KR')}건, 별도 다이소 ${stores.length}지점, 도움 사이트 ${siteTaxonomy.length}개를 보존했습니다. 두 점포 소스를 합산/병합하지 않았습니다.\n\n- 구: ${report.districts}개\n- 행정동: ${report.administrativeDongCount}개; 법정동: ${report.legalDongCount}개. 서로 다른 구역 체계이므로 섞지 않습니다.\n- 원본 중분류 ${report.sourceMiddleGroups}개, 세부 업종 ${entries.length}개\n- 사용자용 대분류 ${categoryCounts.length}개/중분류 ${report.consumerSections}개 제안\n- 대용량 원본을 다시 읽지 않고 구/동/분류/브랜드 후보를 조회하는 로컬 SQLite 인덱스를 만들었습니다. 화면·운영 API가 아닙니다.\n\n| 사용자용 대분류 | 기본 원본 건수 |\n|---|---:|\n${overview}\n\n## 앞선 집계 정정\n\n카페의 광범위 명칭/업종 일치 ${corrections.foodCafe.oldBroad.toLocaleString('ko-KR')}건을 일반 카페 ${corrections.foodCafe.exact.toLocaleString('ko-KR')}건과 독서실/스터디카페 ${corrections.studySpace.separate.toLocaleString('ko-KR')}건으로 분리했습니다. 병원/의원 광범위 집계 ${corrections.clinicalHumanFacilities.oldBroad.toLocaleString('ko-KR')}건도 사람 병원/의원 ${corrections.clinicalHumanFacilities.exact.toLocaleString('ko-KR')}건과 동물병원 ${corrections.veterinary.separate.toLocaleString('ko-KR')}건으로 구분했습니다. 약국과 기타 보건 업종은 별도입니다.\n\n## 검토 파일\n\n- taxonomy.md/json: 세부 업종 전체 매핑\n- area-index.json: 구/행정동/법정동별 건수\n- brand-candidates.json: 이름 기반 후보; 공식 가맹/브랜드 확인과 다름\n- helpful-sites-classified.json: 32개 사이트의 분야 기반 분류 제안; 기존 검증 제한 유지\n- attribute-coverage.json: 알고 있는 값과 아직 없는 상세 속성\n- inventory-corrections.json: 앞선 광범위 집계 정정\n- classification-report.json: 사용 인덱스 파일·출처 SHA·수량\n\n## 아직 하지 않은 것\n\n브랜드 공식 전 지점 대조, 원본 이후 개점/폐업, 가격/휴무/영업 중/24시간/시설/리뷰 보완, 서로 다른 출처의 점포 병합은 미완료입니다. 이름에 24가 있어도 24시간으로 판정하지 않습니다. SQLite 파일과 원본은 Git/공개 서버/운영 배포에서 제외합니다.\n`);
  console.log(JSON.stringify({rows,chainRows:stores.length,sourceIndustries:entries.length,categories:categoryCounts.length,administrativeDongs:report.administrativeDongCount,legalDongs:report.legalDongCount,reviewRows:report.reviewRows,database:dbName,corrections}));
} catch(error) {
  try { db.exec('ROLLBACK;'); } catch {}
  try { db.close(); } catch {}
  await save(`failure-${Date.now()}.json`,{database:dbName,rows,state:'incomplete',message:error.message});
  throw error;
}
