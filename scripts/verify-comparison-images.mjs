import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import C from '../comparison-core.js';

const base=process.env.BASE_URL || 'http://127.0.0.1:4175';
const out=resolve('data/exports/comparison-planning-2026-10-11');
await mkdir(out,{recursive:true});
const context={window:{}};
runInNewContext(await readFile('comparison-data.js','utf8'),context);
const products=context.window.ComparisonCatalog.items.flatMap(i=>i.groups.flatMap(g=>g.products.filter(C.eligible)));
const urls=[...new Set(products.map(p=>p.imageUrl).filter(Boolean))];
let prior=[];
try{prior=JSON.parse(await readFile(resolve(out,'image-health.json'),'utf8')).observations || [];}catch(error){if(error.code!=='ENOENT')throw error;}
if(process.argv.includes('--recheck-failed'))for(const o of prior.filter(o=>o.status==='broken'))if(!urls.includes(o.url))urls.push(o.url);
const reused=process.argv.includes('--only-new') ? prior.filter(o=>urls.includes(o.url) && o.status==='decoded' && Date.now()-Date.parse(o.checkedAt)>=0 && Date.now()-Date.parse(o.checkedAt)<3600000) : [];
const reusedUrls=new Set(reused.map(o=>o.url));
const pending=urls.filter(url=>!reusedUrls.has(url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  const page=await browser.newPage();
  await page.route(/google-analytics\.com|googletagmanager\.com|\/insights\//,route=>route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const observations=[...reused];
  for(let offset=0;offset<pending.length;offset+=12){
    const batch=await page.evaluate(async urls=>Promise.all(urls.map(url=>new Promise(resolve=>{
      const image=new Image();image.referrerPolicy='no-referrer';
      const done=status=>{clearTimeout(timer);resolve({url,status,width:image.naturalWidth,height:image.naturalHeight,checkedAt:new Date().toISOString()});};
      const timer=setTimeout(()=>done('timeout'),12000);
      image.onload=()=>done(image.naturalWidth>0 ? 'decoded':'broken');
      image.onerror=()=>done('broken');image.src=url;
    }))),pending.slice(offset,offset+12));
    observations.push(...batch);
  }
  const summary={images:urls.length,decoded:observations.filter(o=>o.status==='decoded').length,broken:observations.filter(o=>o.status!=='decoded').length};
  const history=new Map([...prior,...observations].map(o=>[o.url,o]));
  await writeFile(resolve(out,'image-health.json'),JSON.stringify({generatedAt:new Date().toISOString(),base,summary,observations:[...history.values()]},null,2)+'\n','utf8');
  console.log(JSON.stringify(summary));
  if(summary.broken)console.log(JSON.stringify(observations.filter(o=>o.status!=='decoded')));
  if(summary.broken)process.exitCode=1;
}finally{await browser.close();}
