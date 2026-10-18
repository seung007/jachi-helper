import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rename, open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { createGzip } from 'node:zlib';
import { parse } from 'csv-parse';
import yauzl from 'yauzl';

const out = resolve('data/exports/seoul-life-2026-10-14');
const sourceUrl = 'https://www.data.go.kr/data/15083033/fileData.do';
const snapshotDate = '2026-06-30';
const districts = ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'];
const file = name => {
  const path = resolve(out, name);
  if (!path.startsWith(out + sep)) throw new Error('Output outside collection directory');
  return path;
};
const exists = async path => { try { return await stat(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } };
const save = (name, data) => writeFile(file(name), JSON.stringify(data, null, 2) + '\n');
const hashFile = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
let cookie = '';
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers }, signal: options.signal || AbortSignal.timeout(60000) });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}; no access-control bypass`);
  return response;
}
async function download() {
  const archive = file('raw/commercial-20260630.zip');
  const manifestPath = file('download.json');
  if (await exists(archive) && await exists(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.sha256 !== await hashFile(archive)) throw new Error('Cached archive checksum mismatch');
    console.log(JSON.stringify({stage:'archive-cache', bytes:(await stat(archive)).size}));
    return archive;
  }
  const source = await request(sourceUrl);
  const html = await source.text();
  await writeFile(file('raw/source-main.html'), html);
  const match = html.match(/fn_fileDataDown\('15083033',\s*'([^']+)',\s*'([^']*)',\s*'(\d+)'/);
  if (!match) throw new Error('Official download button schema changed');
  const endpoint = 'https://www.data.go.kr/tcs/dss/selectFileDataDownload.do';
  const body = new URLSearchParams({publicDataDetailPk:match[1],publicDataPk:'15083033',atchFileId:match[2],fileDetailSn:match[3],publicDataTyCode:'PR0051',url:'/tcs/dss/selectFileDataDownload.do'});
  const metadata = await (await request(endpoint, {method:'POST',body})).json();
  if (!metadata.status || !metadata.atchFileId || !metadata.fileDetailSn) throw new Error('Download not provided by official source');
  const info = metadata.dataSetFileDetailInfo;
  if (!String(info.dataNm).includes('20260630')) throw new Error('Snapshot changed; review metadata/date before collecting');
  await save('source.json', {id:'sbiz-15083033-20260630',sourceUrl,title:info.dataNm,provider:'소상공인시장진흥공단',snapshotDate,updateCycle:'quarterly',registeredAt:info.registDt,nextRegistration:info.nextRegistPrarnde,license:{label:'이용허락범위 제한 없음',sourceUrl},scope:'서울 CSV only; national archive retained as source',fieldsUnavailable:['current opening status','opening hours','reviews','prices','individual website','phone'],collectedAt:new Date().toISOString()});
  const limit = await (await request('https://www.data.go.kr/cmm/cmm/check-limit.json', {method:'POST',body:new URLSearchParams({atchFileId:metadata.atchFileId,fileDetailSn:metadata.fileDetailSn})})).json();
  if (limit.needCaptcha) throw new Error('Official site requires user CAPTCHA; stop without bypass');
  const params = new URLSearchParams({atchFileId:metadata.atchFileId,fileDetailSn:metadata.fileDetailSn,dataNm:info.dataNm});
  const url = `https://www.data.go.kr/cmm/cmm/fileDownload.do?${params}`;
  const response = await request(url, {signal:AbortSignal.timeout(1200000)});
  if (/text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('Not a downloadable archive; stop');
  const expected = Number(response.headers.get('content-length')) || null;
  let bytes = 0, last = Date.now();
  const input = Readable.fromWeb(response.body);
  input.on('data', chunk => {
    bytes += chunk.length;
    if (Date.now() - last >= 15000) { console.log(JSON.stringify({stage:'download',bytes,totalBytes:expected})); last = Date.now(); }
  });
  await pipeline(input, createWriteStream(file('raw/commercial-20260630.zip.part')));
  if (expected && expected !== bytes) throw new Error('Truncated download');
  const handle = await open(file('raw/commercial-20260630.zip.part'), 'r');
  const first = Buffer.alloc(4);
  try { await handle.read(first,0,4,0); } finally { await handle.close(); }
  if (first.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid ZIP signature');
  await rename(file('raw/commercial-20260630.zip.part'), archive);
  await save('download.json', {url,sourceUrl,bytes,sha256:await hashFile(archive),collectedAt:new Date().toISOString()});
  console.log(JSON.stringify({stage:'download-complete',bytes}));
  return archive;
}
async function extractSeoul(archive) {
  const target = file('raw/seoul-commercial-20260630.csv');
  const zip = await new Promise((accept,reject) => yauzl.open(archive,{lazyEntries:true,decodeStrings:false},(error,value)=>error?reject(error):accept(value)));
  const entries = [], extracted = [];
  await new Promise((accept,reject) => {
    zip.on('error',reject);
    zip.on('end',accept);
    zip.on('entry', async entry => {
      try {
        let name = entry.fileName.toString('utf8');
        if (name.includes('\ufffd')) name = new TextDecoder('euc-kr').decode(entry.fileName);
        entries.push({name,bytes:entry.uncompressedSize});
        if (/서울/.test(name) && /\.csv$/i.test(name)) {
          if (extracted.length) throw new Error('Multiple Seoul CSVs: choose explicit snapshot before merging');
          const stream = await new Promise((accept,reject) => zip.openReadStream(entry,(error,value)=>error?reject(error):accept(value)));
          await pipeline(stream,createWriteStream(target));
          extracted.push({name,bytes:entry.uncompressedSize,sha256:await hashFile(target)});
        }
        zip.readEntry();
      } catch (error) { zip.close(); reject(error); }
    });
    zip.readEntry();
  });
  await save('archive-index.json',{entries,extracted});
  if (extracted.length !== 1) throw new Error('No unique Seoul CSV found');
  console.log(JSON.stringify({stage:'seoul-extracted',...extracted[0]}));
  return target;
}
async function normalize(csv) {
  const report = {snapshotDate,sourceUrl,rawRows:0,retainedRows:0,outsideSeoul:0,duplicateIds:0,duplicateNameAddress:0,missingId:0,missingDistrict:0,invalidCoordinates:0,byDistrict:Object.fromEntries(districts.map(name=>[name,0])),byIndustry:{},missingDistricts:[],fields:[],completeAgainstSource:false,completeAgainstRealWorld:false};
  const ids = new Set(), nameAddresses = new Set();
  const gzip = createGzip();
  const output = pipeline(gzip,createWriteStream(file('seoul-places.jsonl.gz')));
  const csvStream = createReadStream(csv).pipe(parse({columns:headers=>{
    const missing = ['상가업소번호','상호명','시도명','시군구명','상권업종소분류코드','상권업종소분류명','도로명주소','경도','위도'].filter(key=>!headers.includes(key));
    if (missing.length) throw new Error(`Source CSV schema changed: ${missing.join(', ')}`);
    report.fields=headers;return headers;
  },bom:true,skip_empty_lines:true}));
  try {
    for await (const row of csvStream) {
      report.rawRows++;
      if (!String(row['시도명']).includes('서울')) {report.outsideSeoul++;continue;}
      const id = row['상가업소번호'];
      if (!id) report.missingId++;
      if (id && ids.has(id)) {report.duplicateIds++;continue;}
      if (id) ids.add(id);
      const district = row['시군구명'];
      if (!districts.includes(district)) report.missingDistrict++;
      else report.byDistrict[district]++;
      const nameAddress = `${row['상호명']}\u0000${row['지점명']}\u0000${row['도로명주소'] || row['지번주소']}\u0000${row['층정보']}\u0000${row['호정보']}`;
      if (nameAddresses.has(nameAddress)) report.duplicateNameAddress++;
      nameAddresses.add(nameAddress);
      const longitude = Number(row['경도']), latitude = Number(row['위도']);
      const valid = row['경도'] && row['위도'] && Number.isFinite(longitude) && Number.isFinite(latitude) && longitude > 126 && longitude < 128 && latitude > 37 && latitude < 38;
      if (!valid) report.invalidCoordinates++;
      const code = row['상권업종소분류코드'];
      if (!report.byIndustry[code]) report.byIndustry[code]={large:row['상권업종대분류명'],middle:row['상권업종중분류명'],small:row['상권업종소분류명'],count:0};
      report.byIndustry[code].count++;
      const normalized = {id,name:row['상호명'],branch:row['지점명'],industry:{largeCode:row['상권업종대분류코드'],large:row['상권업종대분류명'],middleCode:row['상권업종중분류코드'],middle:row['상권업종중분류명'],smallCode:code,small:row['상권업종소분류명'],standardCode:row['표준산업분류코드'],standard:row['표준산업분류명']},districtCode:row['시군구코드'],district,administrativeDongCode:row['행정동코드'],administrativeDong:row['행정동명'],legalDongCode:row['법정동코드'],legalDong:row['법정동명'],roadAddress:row['도로명주소'],lotAddress:row['지번주소'],building:row['건물명'],floor:row['층정보'],unit:row['호정보'],postalCode:row['신우편번호'],longitude:valid?longitude:null,latitude:valid?latitude:null,sourceId:'sbiz-15083033-20260630',snapshotDate,currentOpeningStatus:null};
      if (!gzip.write(JSON.stringify(normalized)+'\n')) await once(gzip,'drain');
      report.retainedRows++;
      if (report.retainedRows % 50000 === 0) console.log(JSON.stringify({stage:'normalize',rows:report.retainedRows}));
    }
    gzip.end();
    await output;
  } catch (error) {gzip.destroy(error);await output.catch(()=>{});throw error;}
  report.missingDistricts=districts.filter(name=>!report.byDistrict[name]);
  report.completeAgainstSource=report.retainedRows > 0 && report.outsideSeoul === 0 && report.retainedRows + report.duplicateIds === report.rawRows;
  report.normalizedSha256=await hashFile(file('seoul-places.jsonl.gz'));
  await save('coverage.json',report);
  console.log(JSON.stringify({stage:'normalized',rows:report.retainedRows,districts:25-report.missingDistricts.length,industries:Object.keys(report.byIndustry).length,invalidCoordinates:report.invalidCoordinates,duplicateIds:report.duplicateIds,missingDistricts:report.missingDistricts}));
}

await mkdir(file('raw'),{recursive:true});
try {
  const archive=await download();
  const csv=await extractSeoul(archive);
  await normalize(csv);
} catch (error) {
  await save('collection-failure.json',{at:new Date().toISOString(),message:error.message,complete:false});
  console.error(JSON.stringify({stage:'failed',message:error.message}));
  process.exitCode=1;
}
