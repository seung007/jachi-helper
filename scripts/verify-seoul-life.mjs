import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse';

const root = resolve('data/exports/seoul-life-2026-10-14');
const path = name => resolve(root,name);
const coverage = JSON.parse(await readFile(path('coverage.json'),'utf8'));
const source = JSON.parse(await readFile(path('source.json'),'utf8'));
assert.equal(source.snapshotDate,'2026-06-30');
assert.equal(coverage.completeAgainstRealWorld,false);
assert.ok(coverage.retainedRows > 0);
let rows = 0, missingId = 0, invalidCoordinates = 0;
const ids = new Set(), districts = {}, industries = {}, rawIds = new Set();
const input = createInterface({input:createReadStream(path('seoul-places.jsonl.gz')).pipe(createGunzip()),crlfDelay:Infinity});
const requested = Object.fromEntries(['다이소 이름 후보','대형마트 이름 후보','편의점 업종','주유소 업종','카페 업종','음식점 업종','세탁소 업종','약국 업종','병원·의원 업종','체육시설 업종','미용·목욕 업종','숙박 업종'].map(name=>[name,{count:0,byDistrict:{},status:name.includes('후보')?'name_match_candidate':'source_industry_match',finalClassification:false}]));
for await (const line of input) {
  const place=JSON.parse(line);
  rows++;
  assert.equal(place.sourceId,'sbiz-15083033-20260630');
  assert.equal(place.snapshotDate,source.snapshotDate);
  assert.equal(place.currentOpeningStatus,null);
  assert.ok(place.name?.trim());
  assert.ok(Object.hasOwn(coverage.byDistrict,place.district),`Unexpected district ${place.district}`);
  if (place.id) {assert.ok(!ids.has(place.id),`Duplicate ID ${place.id}`);ids.add(place.id);} else missingId++;
  if (place.longitude === null || place.latitude === null) invalidCoordinates++;
  else {assert.ok(Number.isFinite(place.longitude)&&Number.isFinite(place.latitude));assert.ok(place.longitude>126&&place.longitude<128&&place.latitude>37&&place.latitude<38);}
  districts[place.district]=(districts[place.district]||0)+1;
  industries[place.industry.smallCode]=(industries[place.industry.smallCode]||0)+1;
  const name=place.name.replace(/\s+/g,''), small=place.industry.small || '', large=place.industry.large || '';
  const matches={
    '다이소 이름 후보':name.includes('다이소'),
    '대형마트 이름 후보':/^(이마트(?!24)|홈플러스|롯데마트|코스트코|트레이더스|하나로마트)/.test(name),
    '편의점 업종':/편의점/.test(small),
    '주유소 업종':/주유소/.test(small),
    '카페 업종':/커피|카페/.test(small),
    '음식점 업종':/음식/.test(large)&&!/커피|카페/.test(small),
    '세탁소 업종':/세탁/.test(small),
    '약국 업종':/약국/.test(small),
    '병원·의원 업종':/병원|의원/.test(small),
    '체육시설 업종':/체육|헬스|수영|요가|필라테스|운동|볼링|골프|당구/.test(small),
    '미용·목욕 업종':/미용|목욕|네일|피부/.test(small),
    '숙박 업종':/숙박/.test(large),
  };
  for (const [category,match] of Object.entries(matches)) if(match) {requested[category].count++;requested[category].byDistrict[place.district]=(requested[category].byDistrict[place.district]||0)+1;}
}
assert.equal(rows,coverage.retainedRows);
assert.equal(missingId,coverage.missingId);
assert.equal(invalidCoordinates,coverage.invalidCoordinates);
assert.equal(Object.keys(districts).length,25);
assert.deepEqual(districts,Object.fromEntries(Object.entries(coverage.byDistrict).filter(([,count])=>count)));
for (const [code,value] of Object.entries(coverage.byIndustry)) assert.equal(industries[code],value.count);
let rawRows=0;
for await(const row of createReadStream(path('raw/seoul-commercial-20260630.csv')).pipe(parse({columns:true,bom:true,skip_empty_lines:true}))) {
  rawRows++;
  assert.equal(row['시도명'],'서울특별시');
  if(row['상가업소번호']) rawIds.add(row['상가업소번호']);
}
assert.equal(rawRows,coverage.rawRows);
assert.deepEqual(rawIds,ids);
const hash=createHash('sha256');
for await(const chunk of createReadStream(path('seoul-places.jsonl.gz'))) hash.update(chunk);
assert.equal(hash.digest('hex'),coverage.normalizedSha256);
const result={verifiedAt:new Date().toISOString(),rows,rawRows,districts:Object.keys(districts).length,industries:Object.keys(industries).length,sourceRowsAccountedFor:true,missingId,invalidCoordinates,completeAgainstRealWorld:false};
await writeFile(path('verification.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(path('requested-category-inventory.json'),JSON.stringify({method:'Name/official-industry matches for inventory only; not final subcategory or verified brand membership',requested},null,2)+'\n');
console.log(JSON.stringify({...result,requestedCounts:Object.fromEntries(Object.entries(requested).map(([key,value])=>[key,value.count]))}));
