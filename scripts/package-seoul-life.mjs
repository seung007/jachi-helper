import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { helpfulSites, supplementalSources, districts } from './seoul-life-sources.mjs';

const root=resolve('data/exports/seoul-life-2026-10-14');
const load=name=>readFile(resolve(root,name),'utf8').then(JSON.parse);
const save=(name,data)=>writeFile(resolve(root,name),JSON.stringify(data,null,2)+'\n');
const coverage=await load('coverage.json'),verification=await load('verification.json');
const category=await load('requested-category-inventory.json');
let classification=null;
try {
  classification=await load('classification/classification-report.json');
  const proof=await load('classification/verification.json');
  assert.equal(classification.rows,proof.rows);
  assert.equal(classification.inputSha256,coverage.normalizedSha256);
  assert.equal(proof.originalPayloadsUnchanged,true);
} catch(error) {if(error.code!=='ENOENT')throw error;classification=null;}
assert.equal(coverage.retainedRows,verification.rows);
assert.equal(verification.districts,25);
assert.equal(new Set(districts.map(value=>value.name)).size,25);
assert.deepEqual(new Set(districts.map(value=>value.name)),new Set(Object.keys(coverage.byDistrict)));
assert.equal(new Set(helpfulSites.map(value=>value.id)).size,helpfulSites.length);
for(const site of helpfulSites) {assert.equal(new URL(site.officialUrl).protocol,'https:');assert.ok(site.evidence&&site.sources.length&&site.fullCoverageVerified===false);}
const storeCoverage=await load('daiso-coverage.json');
const stores=await load('daiso-stores.json');
assert.equal(new Set(stores.map(value=>value.id)).size,stores.length);
for(const store of stores) {assert.equal(store.brand,'다이소');assert.ok(districts.some(district=>district.name===store.district));assert.ok(store.name&&store.address&&store.sourceUrl);}
await save('helpful-sites.json',helpfulSites);
await save('supplemental-source-queue.json',supplementalSources);
await save('districts.json',districts);
const files=[];
for(const name of ['raw/commercial-20260630.zip','raw/seoul-commercial-20260630.csv','seoul-places.jsonl.gz','coverage.json','verification.json','requested-category-inventory.json','daiso-stores.json','daiso-coverage.json','helpful-sites.json','supplemental-source-queue.json','districts.json','source.json','download.json','archive-index.json']) {
  files.push({path:name,bytes:(await stat(resolve(root,name))).size});
}
const states=Object.fromEntries([...new Set(helpfulSites.map(site=>site.verificationState))].map(state=>[state,helpfulSites.filter(site=>site.verificationState===state).length]));
if(classification) {
  assert.match(classification.database,/^index-[\w.-]+\.sqlite$/);
  for(const name of ['summary.md','taxonomy.md','taxonomy.json','area-index.json','brand-candidates.json','attribute-coverage.json','helpful-sites-classified.json','inventory-corrections.json','classification-report.json','verification.json',classification.database]) {
    const path=`classification/${name}`;
    files.push({path,bytes:(await stat(resolve(root,path))).size});
  }
}
const manifest={collectedOn:'2026-10-14',stage:'first-source-collection',normalizedSeoulOnly:true,rawArchiveScope:'national archive preserved as source; non-Seoul rows not processed',mainSourceUrl:coverage.sourceUrl,snapshotDate:coverage.snapshotDate,commercialRecords:verification.rows,districts:verification.districts,sourceIndustries:verification.industries,daisoOfficialStores:stores.length,daisoSourceCoverage:storeCoverage.completeAgainstQueriedSource||false,daisoUnresolvedCaps:storeCoverage.leafCaps,helpfulSites:helpfulSites.length,helpfulSiteVerificationStates:states,supplementalSources:supplementalSources.length,completeAgainstWholeSeoulMarket:false,finalClassificationDone:false,sourceIdsMerged:false,deployed:false,limitations:['공식 상가 원본 기준일 이후 개점/폐업 미반영','상가업소 자료의 브랜드/점포 누락 가능; 다이소 별도 보완','기관/공공시설은 보완 출처 큐만 조사했고 시설별 원본은 아직 미수집','전화/영업시간/가격/후기/개별 홈페이지는 기본 원본에 없으며 임의 생성하지 않음','다이소 공식 정보의 공개 재사용 조건은 미확인; 연구용 로컬 파일만','소스 간 유사 이름/주소가 있어도 같은 업소라고 임의 합치지 않음'],files};
manifest.classificationProposal=classification?{version:classification.version,rows:classification.rows,consumerCategories:classification.consumerCategoryCount,sourceIndustries:classification.sourceIndustries,administrativeDongs:classification.administrativeDongCount,legalDongs:classification.legalDongCount,rawPayloadsVerifiedUnchanged:true,acceptedFinalTaxonomy:false,database:`classification/${classification.database}`,summary:'classification/summary.md'}:null;
await save('collection-manifest.json',manifest);
let rows=Object.entries(category.requested).filter(([name])=>!classification||!['카페 업종','병원·의원 업종'].includes(name)).map(([name,value])=>`| ${name} | ${value.count.toLocaleString('ko-KR')} | ${value.status==='name_match_candidate'?'명칭 일치 후보; 공식 브랜드 지점 수 아님':'원본 범위 일치; 상세 분류와 다름'} |`).join('\n');
if(classification) {
  const c=classification.corrections;
  rows+=`\n| 일반 카페 | ${c.foodCafe.exact.toLocaleString('ko-KR')} | 공식 음식 업종 카페; 스터디카페 분리 |\n| 독서실/스터디카페 | ${c.studySpace.separate.toLocaleString('ko-KR')} | 공식 별도 업종 |\n| 사람 병원/의원 | ${c.clinicalHumanFacilities.exact.toLocaleString('ko-KR')} | 동물병원·기타 보건 업종 분리 |\n| 동물병원 | ${c.veterinary.separate.toLocaleString('ko-KR')} | 반려동물 업종 |`;
}
const districtRows=Object.entries(coverage.byDistrict).map(([name,count])=>`| ${name} | ${count.toLocaleString('ko-KR')} | ${storeCoverage.byDistrict?.[name]??'미확인'} |`).join('\n');
const markdown=`# 서울 생활정보 1차 수집\n\n수집일: 2026-10-14. 서울 한정이며 현재 사이트 UI/운영 배포에는 반영하지 않았습니다.\n\n## 확보한 파일\n\n- 서울 업소 원본 CSV: raw/seoul-commercial-20260630.csv\n- 정규화 전량: seoul-places.jsonl.gz (gzip 압축 JSON Lines)\n- 원본 건수/구/업종 검증: coverage.json, verification.json\n- 다이소 공식 지점: daiso-stores.json, daiso-coverage.json\n- 생활 도움 공식 사이트: helpful-sites.json\n- 아직 원본 수집하지 않은 보완 출처: supplemental-source-queue.json\n- 전체 파일/제한사항: collection-manifest.json\n\n## 기본 원본\n\n[소상공인시장진흥공단 공식 자료](${coverage.sourceUrl}), 기준일 ${coverage.snapshotDate}. 원본 ${verification.rawRows.toLocaleString('ko-KR')}건과 정규화 ${verification.rows.toLocaleString('ko-KR')}건의 ID/건수가 일치합니다. 25개 구, 원본 업종 247개를 보존했습니다. **현재 현실의 모든 서울 업소가 빠짐없다는 뜻은 아닙니다.**\n\n| 요청/추가 범위 | 원본 일치 건수 | 해석 |\n|---|---:|---|\n${rows}\n\n다이소는 [공식 매장검색](https://www.daiso.co.kr/cs/shop)으로 ${stores.length}개 지점을 별도 보완했습니다. 원본의 다이소 이름 후보와 합산하지 않습니다. 구/동 조회 ${storeCoverage.queries.length}회, 미해결 결과 상한 ${storeCoverage.leafCaps.length}개. 공식 현재 목록의 전수 보장/재사용 권한은 미확인입니다.\n\n## 구별 기본 자료\n\n| 구 | 기본 원본 업소 | 별도 다이소 공식 지점 |\n|---|---:|---:|\n${districtRows}\n\n## 다음 순서\n\n1. 원본 업종 247개를 유지하며 소비자용 대분류/소분류/이용목적 후보표를 만든다.\n2. 이름이 아니라 출처 ID·주소·지점 정보를 함께 확인해 중복 후보를 검토한다.\n3. 편의점/대형마트 등 브랜드 공식 지점 자료와 대조하고 최신 개점·폐업을 보완한다.\n4. 공공시설·교통·병원·약국·주유소 보완 큐를 실제 파일/API로 수집하고 소스별 완전성을 확인한다.\n5. 상세 속성(24시간·주차·픽업·시설·가격 등)은 실제 출처가 있는 것만 추가한다.\n\n일반 업소 원본에는 대표자/개인 연락처를 가공하지 않았고, 다이소는 사업장 필드만 선택 보존했습니다. 모든 수집 파일은 data/exports/에 있으며 Git/운영 배포에서 제외됩니다.\n`;
const note=classification?`\n\n## 2차 분류와 집계 정정\n\n[최신 분류 요약](classification/summary.md), [247개 전체 분류표](classification/taxonomy.md). 원본 ${classification.rows.toLocaleString('ko-KR')}건을 보존한 규칙 기반 제안입니다. 앞선 광범위 카페/병원 집계는 스터디카페/동물병원과 섞여 있어 아래 표에서 공식 세부 업종으로 분리·정정했습니다. 세부 정보와 브랜드 확정은 아직 별도 검증이 필요합니다.\n`:'';
await writeFile(resolve(root,'summary.md'),markdown.replace('# 서울 생활정보 1차 수집\n','# 서울 생활정보 1차 수집\n'+note));
console.log(JSON.stringify({records:manifest.commercialRecords,districts:manifest.districts,industries:manifest.sourceIndustries,daisoStores:stores.length,helpfulSites:helpfulSites.length,siteStates:states,pendingSources:supplementalSources.length,files:files.length}));
