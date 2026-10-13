import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { taxonomyFor, purposeGroup, attributeLabels } from './comparison-taxonomy.mjs';
import C from '../comparison-core.js';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'data/exports/comparison-planning-2026-10-11');
export function safeUrl(value, local = false) {
  if (local && typeof value === 'string' && /^\/assets\/[\w./%-]+$/.test(value) && !value.includes('..')) return value;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
const aliases = {
  '제품 유형':'type','제형':'type','원재료':'ingredients','알레르기 표시':'allergens','보관 방법':'storage','조리 방법':'preparation',
  '내용량':'amount','개당 내용량':'amount','총내용량':'totalAmount','순중량':'amount','내용량(g)':'amount','내용량(kg)':'amount',
  '수량':'count','묶음 수량':'count','소재':'material','원단':'material','충전재':'filling','크기':'dimensions','치수':'dimensions','규격':'size',
  '용량':'capacity','용량(L)':'capacity','용량(mL)':'capacity','크기(cm)':'dimensions','크기(mm)':'dimensions',
  '무게(kg)':'weight','표시 무게(g)':'weight','관리 방법':'care','향':'fragrance','구성':'contents',
  '정격 소비전력(W)':'power','정격 전압':'voltage','코드 길이(m)':'cableLength',
  productType:'type',productCategory:'type',form:'type',amountGrams:'amount',amountMl:'amount',volumeMl:'capacity',
  materialLabel:'material',materials:'material',fabric:'material',preparation:'preparation',cooking:'preparation',
  weightKg:'weight',netWeight:'amount',packCount:'count',quantity:'count',configuration:'contents',
  dimensionsCm:'dimensions',dimensionsMm:'dimensions',sizeCm:'dimensions',ratedPowerW:'power',scent:'fragrance',
  widthCm:'width',heightCm:'height',depthCm:'depth',lengthCm:'length',diameterCm:'diameter',
};
const identityKeys = /^(productCode|article|model|sku|manufacturer|brand|title|productName|상품 코드|상품 번호|모델명)$/;
const excludedKeys = /price|popular|rank|sales|stock|authorization|internal|availability|offerCondition/i;
const unknownText = /미확인|확인 필요|unknown|not verified|not confirmed/i;
const validTime = value => Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() ? value : undefined;
const unitFor = key => /Kg$/.test(key) ? 'kg' : /Grams$|WeightG$/.test(key) ? 'g' : /Ml$/.test(key) ? 'mL' : /L$|Litres$|Liters$/.test(key) ? 'L' : /Cm$/.test(key) ? 'cm' : /Mm$/.test(key) ? 'mm' : /PowerW$/.test(key) ? 'W' : undefined;
const numericKeys = new Set(['amount','count','capacity','weight','power','width','height','depth','length','diameter','cableLength']);
export function numericValue(key, value, unit) {
  if (!numericKeys.has(key)) return {value:typeof value==='boolean' ? String(value):value,unit};
  if (typeof value==='number') return {value,unit};
  const match=String(value).trim().match(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(kg|g|mL|ml|L|l|W|w|cm|mm|m|개|팩|포|병|매|장)?$/);
  if (!match) return {value,unit};
  const supplied=match[2];
  const normalized=supplied?.toLowerCase()==='ml' ? 'mL' : supplied?.toLowerCase()==='l' ? 'L' : supplied?.toLowerCase()==='w' ? 'W' : supplied;
  if (unit && normalized && unit!==normalized) return {value,unit};
  return {value:Number(match[1].replaceAll(',','')),unit:unit || normalized};
}
export function modelKey(product) {
  const url=safeUrl(product.url);
  const host=url ? new URL(url).hostname : '';
  if (/philips/.test(host)) {
    const code=new URL(url).pathname.match(/\/c-p\/([A-Z]{2,4}\d{3,4})[_/]/i)?.[1];
    if(code)return `philips:${code.toLowerCase()}`;
  }
  if(host.endsWith('lgcaremall.com')){
    const name=String(product.name || '').normalize('NFKC');
    if(/샤프란.*꽃담초.*섬유탈취제/.test(name))return 'lgcare:샤프란꽃담초섬유탈취제';
    if(/샤프란케어.*스타일러.*섬유탈취제/.test(name))return 'lgcare:샤프란케어스타일러섬유탈취제';
    if(/샤프란케어.*향기뿜.*섬유탈취제|샤프란케어.*섬유탈취제.*향기뿜/.test(name))return 'lgcare:샤프란케어향기뿜섬유탈취제';
    if(/샤프란케어.*섬유탈취제/.test(name))return 'lgcare:샤프란케어섬유탈취제';
    if(/테크.*실내건조.*액체/.test(name)){
      const formula=/베이킹소다|구연산/.test(name) ? '베이킹소다구연산':'';
      const machine=/일반.*드럼.*겸용/.test(name) ? '겸용':/드럼/.test(name) ? '드럼':'일반';
      return `lgcare:테크${formula}실내건조액체:${machine}`;
    }
  }
  if (url && new URL(url).hostname.endsWith('ikea.com')) {
    const slug=new URL(url).pathname.split('/p/')[1]?.replace(/\/?$/, '');
    const kind=slug?.match(/^(.*?)(pot-with-lid|frying-pan|hand-towel|bath-towel|tea-towel|bath-mat|mug|multifunctional-dish-rack|dish-drainer|food-container-with-lid|food-container|drying-rack|laundry-basket|toilet-brush)(?:-|$)/);
    if (kind) return `ikea:${kind[1]}${kind[2]}`;
  }
  const code=C.namedModelCode(product.name);
  if(code)return `model:${code.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}`;
  const named = String(product.modelKey || product.name || '').normalize('NFKC').toLowerCase().trim();
  // Remove only explicit quantity/pack suffixes. Unresolved options stay pending.
  return named.replace(/\s*\(?\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\)?/gi,'').replace(/\s*\d+\s*(?:개입|입|개|팩|포|세트|병|매)(?:\s*[x×]\s*\d+)?/g,'').replace(/\s+/g,'').trim();
}
function sourceIdentity(value) {
  const url=new URL(value);
  if (url.hostname.endsWith('ikea.com')) return url.origin+url.pathname;
  return url.href;
}
export function eligibilityFor(itemId, product) {
  if (product.eligibilityStatus!=='verified' || !product.imageUrl || /택1|옵션 선택|색상 옵션/.test(product.name)) return 'pending';
  if (itemId==='P016' && /피자/.test(product.name) && /피자맛|만두|버거|피자소스|피자용|도우/.test(product.name)) return 'pending';
  if (itemId==='P032' && /버섯/.test(product.name) && /버섯칩|스낵|과자/.test(product.name)) return 'pending';
  if (itemId==='P114' && /식기|dish|drain/i.test(product.name+' '+product.url)) return 'pending';
  if (itemId==='P066' && /ikea\.com/.test(product.url) && !/뚜껑|with-lid/i.test(product.name+' '+product.url)) return 'pending';
  if (['P096','P164','P166'].includes(itemId) && !(product.facts || []).some(f=>
    /compatibility|호환|적용\s*모델/.test(f.key+' '+f.label) &&
    f.value != null && String(f.value).trim() && !unknownText.test(String(f.value)) && safeUrl(f.sourceUrl || product.url)
  )) return 'pending';
  return 'verified';
}
function cleanFact(fact, product, checkedAt) {
  const raw = fact?.value && typeof fact.value === 'object' ? fact.value.value : fact?.value;
  if (!fact || !['string','number','boolean'].includes(typeof raw) || !String(raw).trim() || unknownText.test(String(raw))) return null;
  if (/탭 참조|제품명 또는 이미지 참조|품질보증IKEA 품질 보증 기준/.test(String(raw))) return null;
  const originalKey = fact.key || fact.label;
  if (!originalKey || identityKeys.test(originalKey) || excludedKeys.test(originalKey)) return null;
  let key = aliases[originalKey] || originalKey;
  if(key==='dimensions'){
    const coordinate=Object.entries({width:/너비|폭|width/i,height:/높이|height/i,depth:/깊이|depth/i,length:/길이|length/i,diameter:/지름|직경|diameter/i}).find(([,pattern])=>pattern.test(fact.label || ''));
    if(coordinate)key=coordinate[0];
  }
  const sourceUrl = safeUrl(fact.sourceUrl || product.url);
  if (!sourceUrl) return null;
  return { key, label: fact.label || attributeLabels[key] || originalKey, ...numericValue(key,raw,fact.unit || unitFor(originalKey)), sourceUrl,
    evidenceType: fact.evidenceType || 'retailer_listing', checkedAt: validTime(fact.checkedAt || checkedAt),
    ...(typeof fact.scope === 'string' ? {scope:fact.scope} : {}) };
}
export function mergeProducts(products) {
  const bySource = new Map();
  for (const product of products) {
    const key = safeUrl(product.url) ? sourceIdentity(safeUrl(product.url)):product.id;
    if (!key) continue;
    const previous = bySource.get(key);
    if (!previous)bySource.set(key,product);
    else if (previous.eligibilityStatus !== 'verified' && product.eligibilityStatus === 'verified')bySource.set(key,{...product,id:previous.id});
    else if (previous.eligibilityStatus === product.eligibilityStatus && product.facts.length > previous.facts.length) {
      bySource.set(key, { ...product, id: previous.id });
    }
  }
  return [...bySource.values()];
}
export function withModelOptions(records) {
  return records.flatMap(record=>[record,...(record.modelOptions || []).filter(option=>safeUrl(option.url) && option.url!==record.url).map(option=>({
    ...option,id:record.id+'-opt-'+createHash('sha256').update(safeUrl(option.url)).digest('hex').slice(0,12),
    itemId:record.itemId,modelKey:modelKey(record),sourceLabel:record.sourceLabel,
  }))]);
}
export function buildCatalog(catalog, rawRecords, legacyRecords = [], recoveries = {}, imageObservations = []) {
  const latestImages=new Map();
  for(const observation of imageObservations)if(validTime(observation.checkedAt) && (!latestImages.has(observation.url) || Date.parse(observation.checkedAt)>=Date.parse(latestImages.get(observation.url).checkedAt)))latestImages.set(observation.url,observation);
  const unavailableImages=new Set([...latestImages.values()].filter(o=>o.status==='broken').map(o=>o.url));
  const legacyByItem = new Map();
  for (const record of legacyRecords.filter(r => r.usableCandidate === true)) {
    if (!legacyByItem.has(record.rowId)) legacyByItem.set(record.rowId,[]);
    legacyByItem.get(record.rowId).push(record);
  }
  const taxonomy = catalog.items.map(taxonomyFor);
  const items = taxonomy.map(item => {
    if (item.kind === 'guidance') return { id:item.id,title:item.title,category:item.category,kind:item.kind,groups:[],unassignedProducts:[] };
    const existing = catalog.items.find(i => i.id === item.id);
    const legacy = existing.products.map((product,position) => {
      const record = legacyByItem.get(item.id)?.[position];
      const recovery = recoveries[product.id];
      const sameSource = record && safeUrl(record.sourceUrl) === safeUrl(product.url);
      const fields = sameSource && !recovery?.facts ? Object.entries(record.verifiedFields || {}).map(([key,value]) => ({ key,value,unit:key === 'amount' ? record.verifiedFields.unit : undefined })) : [];
      return { ...product,itemId:item.id,modelKey:modelKey(product),checkedAt:recovery?.checkedAt,
        eligibilityStatus:product.imageScope === 'options' || /택1|옵션|\d+종/.test(product.name) ? 'pending' : 'verified',
        facts:[...product.facts,...fields],reason:'기존 상품 자료의 규격입니다. 가격·효능 검증은 포함하지 않습니다.' };
    });
    const collected = rawRecords.filter(p => p.itemId === item.id);
    const sourceModel = new Map(collected.filter(p => p.modelKey && safeUrl(p.url)).map(p => [sourceIdentity(safeUrl(p.url)),modelKey(p)]));
    const records = [...legacy.map(p => ({...p,modelKey:sourceModel.get(sourceIdentity(safeUrl(p.url))) || p.modelKey})),...collected];
    const unassignedProducts = [];
    const productsByGroup = new Map(item.groups.map(g => [g.id,[]]));
    for (const raw of records) {
      const url = safeUrl(raw.url);
      if (!url || !raw.id || !raw.name) continue;
      const facts = (raw.facts || []).map(f => cleanFact(f, { ...raw,url },raw.checkedAt)).filter(Boolean);
      const product = { id:raw.id,name:raw.name,modelKey:modelKey(raw),url,imageUrl:safeUrl(raw.imageUrl,true),
        sourceLabel:raw.sourceLabel || '상품 원문',checkedAt:validTime(raw.checkedAt),eligibilityStatus:eligibilityFor(item.id,{...raw,url,imageUrl:safeUrl(raw.imageUrl,true),facts}),
        facts,attributes:{},reason:raw.reason || '' };
      if(product.eligibilityStatus==='verified' && !facts.some(f=>f.key!=='claims')){
        product.eligibilityStatus='pending';product.reason='비교 가능한 원문 규격 부족; 제품명·사진만으로 비교 후보에 포함하지 않음';
      }
      if(unavailableImages.has(product.imageUrl)){product.eligibilityStatus='pending';product.reason='제품 사진 로드 실패 확인; 원문 사진 재확인 전 비교 제외';}
      const group = purposeGroup(item,{ ...raw,facts });
      if (!group) { product.eligibilityStatus='pending';unassignedProducts.push(product);continue; }
      for (const fact of facts) {
        const previous=product.attributes[fact.key];
        if (!previous) product.attributes[fact.key] = {value:fact.value,unit:fact.unit,status:'verified',sourceUrl:fact.sourceUrl,evidenceType:fact.evidenceType,checkedAt:fact.checkedAt};
        else if(typeof previous.value==='string' && typeof fact.value==='string' && previous.sourceUrl===fact.sourceUrl && previous.evidenceType===fact.evidenceType && previous.unit===fact.unit && !previous.value.split('\n').includes(fact.value))previous.value+='\n'+fact.value;
      }
      productsByGroup.get(group.id).push(product);
    }
    return { id:item.id,title:item.title,category:item.category,kind:item.kind,preferenceFilters:item.preferenceFilters,selectionCriteria:item.selectionCriteria,unassignedProducts,
      groups:item.groups.map(({match,...group}) => {
        const products=mergeProducts(productsByGroup.get(group.id));
        const definitions=[...group.attributeDefinitions];
        for (const product of products) for (const fact of product.facts) {
          if (!definitions.some(d => d.key === fact.key)) definitions.push({key:fact.key,label:fact.label,type:typeof fact.value === 'number' ? 'number':'text',unit:fact.unit});
        }
        for (const definition of definitions) {
          const values=products.map(p=>p.attributes[definition.key]).filter(Boolean);
          if (values.length && values.every(v=>typeof v.value==='number' && Number.isFinite(v.value))) definition.type='number';
          else for (const value of values) if (typeof value.value!=='string') value.value=String(value.value);
        }
        for (const product of products) for (const definition of definitions) {
          if (!product.attributes[definition.key]) product.attributes[definition.key]={value:null,status:'unknown'};
        }
        const geometry=definitions.filter(d=>['width','height','depth','length','diameter'].includes(d.key));
        if(geometry.length){
          const at=definitions.findIndex(d=>d.key==='dimensions');
          for(const definition of geometry)definitions.splice(definitions.indexOf(definition),1);
          definitions.splice(at<0 ? 0:at,0,...geometry);
        }
        return {...group,attributeDefinitions:definitions,products};
      }) };
  });
  const groups=items.flatMap(i => i.groups);
  const verified=g => C.groupProducts(g.products).verified.length;
    return {version:'20261012-1',updatedAt:new Date().toISOString(),sourceVersion:catalog.version,items,
    coverage:{totalItems:items.length,productItems:items.filter(i=>i.kind==='product').length,guidanceItems:items.filter(i=>i.kind==='guidance').length,
      comparisonGroups:groups.length,targetSlots:groups.length*6,candidateRecords:groups.reduce((s,g)=>s+g.products.length,0),candidateModels:groups.reduce((s,g)=>s+C.groupProducts(g.products).models.length,0),
      verifiedModels:groups.reduce((s,g)=>s+verified(g),0),compareReadyGroups:groups.filter(g=>verified(g)>=2).length,
      sixModelGroups:groups.filter(g=>verified(g)>=6).length,missingVerifiedSlots:groups.reduce((s,g)=>s+Math.max(0,6-verified(g)),0),
      unassignedCandidates:items.reduce((s,i)=>s+i.unassignedProducts.length,0)} };
}
export function buildComparisonIndex(data) {
  return {version:data.version,updatedAt:data.updatedAt,coverage:data.coverage,
    items:data.items.map(({id,title,category,kind,groups})=>({id,title,category,kind,
      groups:groups.map(({id,label,purpose})=>({id,label,purpose}))}))};
}
async function readJson(path, fallback) {
  try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}
}
async function main(){
  const context={window:{}};
  runInNewContext(await readFile(resolve(root,'product-catalog.js'),'utf8'),context);
  const oldDir=resolve(root,'data/exports/catalog-planning-2026-10-07');
  const index=await readJson(resolve(oldDir,'collection-index.json'),{records:[]});
  const recovered=await readJson(resolve(oldDir,'image-recovery-complete.json'),{});
  const imageHealth=await readJson(resolve(outputDir,'image-health.json'),{observations:[]});
  const raw=[];
  for(const file of ['collected-food.json','collected-household.json'])raw.push(...withModelOptions((await readJson(resolve(outputDir,file),{records:[]})).records));
  const data=buildCatalog(context.window.ProductCatalog,raw,index.records,recovered,imageHealth.observations);
  await mkdir(outputDir,{recursive:true});
  await writeFile(resolve(root,'comparison-data.js'),`window.ComparisonCatalog = ${JSON.stringify(data)};\n`,'utf8');
  await writeFile(resolve(root,'comparison-index.js'),`window.ComparisonIndex = ${JSON.stringify(buildComparisonIndex(data))};\n`,'utf8');
  const chunksDir=resolve(root,'assets/comparison');
  await mkdir(chunksDir,{recursive:true});
  for(const item of data.items){
    if(!/^P\d{3}$/.test(item.id))throw new Error('Invalid comparison item ID: '+item.id);
    await writeFile(resolve(chunksDir,item.id+'.json'),JSON.stringify(item)+'\n','utf8');
  }
  const summary={version:data.version,items:data.items.filter(i=>i.kind==='product').map(i=>({id:i.id,groups:i.groups.map(g=>({id:g.id,label:g.label,count:C.groupProducts(g.products).verified.length})).filter(g=>g.count>=2)})).filter(i=>i.groups.length)};
  await writeFile(resolve(root,'comparison-summary.js'),`window.ComparisonSummary = ${JSON.stringify(summary)};\n`,'utf8');
  await writeFile(resolve(outputDir,'comparison-taxonomy.json'),JSON.stringify(context.window.ProductCatalog.items.map(taxonomyFor),null,2)+'\n','utf8');
  const coverageRows=data.items.flatMap(i=>i.groups.map(g=>({itemId:i.id,groupId:g.id,purpose:g.label,target:g.targetCount,verified:C.groupProducts(g.products).verified.length,pending:g.products.filter(p=>p.eligibilityStatus!=='verified').length,missing:Math.max(0,6-C.groupProducts(g.products).verified.length)})));
  await writeFile(resolve(outputDir,'comparison-coverage.json'),JSON.stringify({generatedAt:data.updatedAt,summary:data.coverage,rows:coverageRows},null,2)+'\n','utf8');
  const headers=['itemId','groupId','purpose','target','verified','pending','missing'];
  const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
  await writeFile(resolve(outputDir,'comparison-coverage.csv'),'\uFEFF'+[headers.map(cell).join(','),...coverageRows.map(row=>headers.map(key=>cell(row[key])).join(','))].join('\r\n')+'\r\n','utf8');
  console.log(JSON.stringify(data.coverage));
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
