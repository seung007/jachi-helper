import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { load } from 'cheerio';
import { districts } from './seoul-life-sources.mjs';

const host='https://www.daiso.co.kr';
const root=resolve('data/exports/seoul-life-2026-10-14');
const dir=resolve(root,'raw/daiso');
await mkdir(dir,{recursive:true});
const expected=districts.map(district=>district.name);
const facilityFields={parking:{code:'shp_pak',label:'주차'},entranceRamp:{code:'entrramp',label:'출입구 경사로'},elevator:{code:'elvtor',label:'엘리베이터'},cashless:{code:'ptcard',label:'현금없는매장'},photoSticker:{code:'ptstk',label:'포토 스티커'},nameSticker:{code:'nmstk',label:'네임 스티커'},simCard:{code:'usim_yn',label:'심카드'},taxRefund:{code:'tax_free',label:'택스리펀드'},groupOrder:{code:'ext.group_yn',label:'단체주문'},pickup:{code:'online_yn',label:'매장픽업'}};
const report={sourceUrl:`${host}/cs/shop`,collectedOn:'2026-10-14',scope:'Seoul only',reusePermission:'unconfirmed; research files only, not public publication',facilityFields,fieldMappingVerifiedOn:'2026-10-14',queries:[],failures:[],leafCaps:[],futureOpening:[],fullCoverageVerified:false};
const stores=new Map();
const save=(name,data)=>writeFile(resolve(root,name),JSON.stringify(data,null,2)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function get(path,params={},format='json') {
  const url=new URL(path,host);url.search=new URLSearchParams(params).toString();
  const cache=resolve(dir,`${hash(url.href)}.json`);
  if(!cache.startsWith(dir+sep)) throw new Error('Unsafe cache path');
  try {const saved=JSON.parse(await readFile(cache,'utf8'));report.queries.push({url:url.href,cached:true,count:format==='stores'?saved.data.length:null});return saved.data;} catch(error) {if(error.code!=='ENOENT')throw error;}
  await pause(800);
  const response=await fetch(url,{headers:{'X-Requested-With':'XMLHttpRequest'},signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error(`HTTP ${response.status}: stop, no access-control bypass`);
  const text=await response.text();
  let data;
  if(format==='json') {
    data=JSON.parse(text);
    if(!Array.isArray(data)||!data.every(value=>typeof value.value==='string')) throw new Error('Region response schema changed');
    data=data.map(value=>({value:value.value}));
  } else {
    const $=load(text);
    if(!$('#searchResultArea').length) throw new Error('Store result schema changed');
    data=$('#searchResultArea .bx-store').toArray().map(node=>{
      const element=$(node),info=JSON.parse(element.attr('data-info')||'{}');
      const address=element.find('.addr').text().trim(),name=element.find('.place').text().trim();
      const district=address.match(/^서울(?:특별시)?\s+([^\s]+구)/)?.[1];
      if(!expected.includes(district)||!name) throw new Error('Non-Seoul or unnamed store returned');
      const phone=element.find('.phone').text().replace(/^T\./,'').trim();
      return {id:`daiso-${hash(name+'\0'+address).slice(0,24)}`,brand:'다이소',name,address,district,latitude:Number(element.attr('data-lat')),longitude:Number(element.attr('data-lng')),businessPhone:/^(02[-\s]?\d|1[568]\d{2}[-\s]?\d)/.test(phone)?phone:null,openingDate:element.attr('data-opnday')||null,hours:{opens:element.attr('data-start')||null,closes:element.attr('data-end')||null},facilities:Object.fromEntries(Object.entries(facilityFields).map(([label,{code}])=>[label,info[code]==='Y'?true:info[code]==='N'?false:null])),sourceUrl:report.sourceUrl,queryUrl:url.href,collectedOn:report.collectedOn};
    });
  }
  await writeFile(cache,JSON.stringify({url:url.href,collectedAt:new Date().toISOString(),responseSha256:hash(text),preservation:'business and region fields only; owner/person details intentionally excluded',data},null,2)+'\n');
  report.queries.push({url:url.href,cached:false,count:format==='stores'?data.length:null});
  return data;
}
function retain(rows) {
  for(const store of rows) {
    if(store.openingDate&&store.openingDate>'20261014') {if(!report.futureOpening.some(value=>value.id===store.id))report.futureOpening.push(store);continue;}
    if(!Number.isFinite(store.longitude)||!Number.isFinite(store.latitude)||store.latitude<37||store.latitude>38||store.longitude<126||store.longitude>128) throw new Error('Invalid official store coordinates');
    stores.set(store.id,store);
  }
}
try {
  const robots=await (await fetch(`${host}/robots.txt`)).text();
  if(/Disallow:\s*\/cs\/?(?:\s|$)/m.test(robots)) throw new Error('Store collection disallowed by robots');
  const regions=await get('/cs/ajax/sido_search',{sido:'서울'});
  if(expected.some(name=>!regions.some(region=>region.value===name))) throw new Error('Official store source missing Seoul district');
  for(const district of expected) {
    const rows=await get('/cs/ajax/shop_search',{sido:'서울',gugun:district},'stores');
    retain(rows);
    if(rows.length>=10) {
      const neighborhoods=await get('/cs/ajax/gugun_search',{sido:'서울',gugun:district});
      for(const neighborhood of neighborhoods) {
        const rows=await get('/cs/ajax/shop_search',{sido:'서울',gugun:district,dong:neighborhood.value},'stores');
        if(rows.some(store=>store.district!==district)) throw new Error('District filter ignored by official source');
        retain(rows);
        if(rows.length>=10) report.leafCaps.push({district,dong:neighborhood.value,count:rows.length});
      }
    }
    await save('daiso-stores.json',[...stores.values()]);
    await save('daiso-coverage.json',report);
    console.log(JSON.stringify({stage:'daiso-district',district,stores:stores.size,queries:report.queries.length}));
  }
  report.stores=stores.size;
  report.byDistrict=Object.fromEntries(expected.map(name=>[name,[...stores.values()].filter(store=>store.district===name).length]));
  report.districtsQueried=expected.length;
  report.completeAgainstQueriedSource=report.leafCaps.length===0&&report.failures.length===0;
  await save('daiso-coverage.json',report);
  console.log(JSON.stringify({stage:'daiso-complete',stores:stores.size,districtsQueried:expected.length,leafCaps:report.leafCaps,fullCoverageVerified:false}));
} catch(error) {
  report.failures.push({message:error.message,at:new Date().toISOString()});
  await save('daiso-stores.json',[...stores.values()]);
  await save('daiso-coverage.json',report);
  console.error(JSON.stringify({stage:'daiso-incomplete',stores:stores.size,error:error.message}));
  process.exitCode=1;
}
