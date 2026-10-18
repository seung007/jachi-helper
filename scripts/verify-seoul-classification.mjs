import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root=resolve('data/exports/seoul-life-2026-10-14');
const out=resolve(root,'classification');
const load=name=>readFile(resolve(root,name),'utf8').then(JSON.parse);
const report=await load('classification/classification-report.json');
const coverage=await load('coverage.json');
const originalSites=await load('helpful-sites.json');
const classifiedSites=await load('classification/helpful-sites-classified.json');
assert.equal(report.inputSha256,coverage.normalizedSha256);
assert.equal(report.rows,coverage.retainedRows);
assert.equal(report.sourceIndustries,247);
assert.equal(report.reviewRows,0);
assert.equal(report.sourcesMerged,false);
assert.equal(classifiedSites.length,originalSites.length);
for(const original of originalSites){const classified=classifiedSites.find(value=>value.id===original.id);assert.ok(classified);assert.equal(classified.verificationState,original.verificationState);assert.equal(classified.fullCoverageVerified,false);assert.ok(classified.consumerCategoryCandidates.length>0);}
const sourceHash=createHash('sha256');
let sourceRows=0;
for await(const line of createInterface({input:createReadStream(resolve(root,'seoul-places.jsonl.gz')).pipe(createGunzip()),crlfDelay:Infinity})) {sourceHash.update(line+'\n');sourceRows++;}
const database=resolve(out,report.database);
assert.ok(database.startsWith(out+sep)&&/^index-[\w.-]+\.sqlite$/.test(report.database));
const db=new DatabaseSync(database,{readOnly:true});
try {
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const rows=db.prepare('SELECT COUNT(*) AS count FROM places').get().count;
  assert.equal(rows,sourceRows);
  const storedHash=createHash('sha256');
  for(const row of db.prepare('SELECT raw_payload FROM places ORDER BY rowid').iterate())storedHash.update(row.raw_payload+'\n');
  assert.equal(storedHash.digest('hex'),sourceHash.digest('hex'),'Every original record payload must be preserved byte-for-byte in input order');
  const changed=db.prepare(`SELECT COUNT(*) AS count FROM places WHERE
    id IS NOT json_extract(raw_payload,'$.id') OR source_id IS NOT json_extract(raw_payload,'$.sourceId') OR
    name IS NOT json_extract(raw_payload,'$.name') OR district IS NOT json_extract(raw_payload,'$.district') OR
    district_code IS NOT json_extract(raw_payload,'$.districtCode') OR admin_code IS NOT json_extract(raw_payload,'$.administrativeDongCode') OR
    admin_name IS NOT json_extract(raw_payload,'$.administrativeDong') OR legal_code IS NOT json_extract(raw_payload,'$.legalDongCode') OR
    legal_name IS NOT json_extract(raw_payload,'$.legalDong') OR leaf_code IS NOT json_extract(raw_payload,'$.industry.smallCode') OR
    road_address IS NOT json_extract(raw_payload,'$.roadAddress') OR lot_address IS NOT json_extract(raw_payload,'$.lotAddress') OR
    longitude IS NOT json_extract(raw_payload,'$.longitude') OR latitude IS NOT json_extract(raw_payload,'$.latitude')`).get().count;
  assert.equal(changed,0,'SQL columns must exactly mirror original source fields');
  for(const row of db.prepare('SELECT leaf_code,COUNT(*) AS count FROM places GROUP BY leaf_code').all())assert.equal(row.count,coverage.byIndustry[row.leaf_code]?.count);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM taxonomy').get().count,247);
  for(const row of db.prepare('SELECT district,COUNT(*) AS count FROM places GROUP BY district').all())assert.equal(row.count,coverage.byDistrict[row.district]);
  const cases=db.prepare(`SELECT p.category_id,p.brand_candidate,t.payload,COUNT(*) AS count FROM places p JOIN taxonomy t ON t.leaf_code=p.leaf_code GROUP BY p.category_id,p.brand_candidate,p.leaf_code`).all();
  for(const row of cases){const entry=JSON.parse(row.payload);assert.equal(entry.state,'rule_based_proposal');assert.equal(entry.categoryId,row.category_id);if(entry.leafLabel==='동물병원')assert.equal(row.category_id,'pets');if(entry.leafLabel==='카페')assert.equal(entry.sourceIndustry.large,'음식');if(entry.leafLabel==='독서실/스터디 카페')assert.notEqual(entry.sourceIndustry.large,'음식');}
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM places WHERE brand_payload IS NOT NULL AND (json_extract(brand_payload,'$.officialMembershipVerified') IS NOT 0 OR json_extract(brand_payload,'$.state') IS NOT 'unverified_name_candidate')`).get().count,0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM places WHERE json_extract(raw_payload,'$.currentOpeningStatus') IS NOT NULL`).get().count,0);
  const originalChains=await load('daiso-stores.json');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM chain_stores').get().count,originalChains.length);
  const chainStatement=db.prepare('SELECT raw_payload FROM chain_stores WHERE id=?');
  for(const chain of originalChains)assert.deepEqual(JSON.parse(chainStatement.get(chain.id).raw_payload),chain);
  const areas=await load('classification/area-index.json');
  for(const list of [areas.districtCounts,areas.administrativeAreas,areas.legalAreas])assert.equal(list.reduce((sum,value)=>sum+value.count,0),rows);
  assert.equal(areas.administrativeAndLegalSeparated,true);
  const result={verifiedAt:new Date().toISOString(),rows,originalPayloadsUnchanged:true,sourceIndustries:247,districts:25,chainRows:originalChains.length,sites:classifiedSites.length,sqlColumnsChanged:0,reviewRows:0,sourceMembershipNotInferred:true,adminLegalSeparated:true,wholeRealWorldCoverage:false};
  await writeFile(resolve(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {db.close();}
