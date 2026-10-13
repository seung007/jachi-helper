import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import C from '../comparison-core.js';

const base=process.env.BASE_URL || 'http://127.0.0.1:4175';
const out=resolve('output/playwright/comparison-integration',process.env.COMPARISON_ITEM || 'P051');
await mkdir(out,{recursive:true});
const dataContext={window:{}};
runInNewContext(await readFile('comparison-data.js','utf8'),dataContext);
const data=C.validateCatalog(dataContext.window.ComparisonCatalog);
const ready=data.items.flatMap(item=>item.groups.filter(g=>C.groupProducts(g.products).verified.length>=2).map(group=>({item,group})));
assert.ok(ready.length,'Actual source data needs at least one comparable group');
const example=ready.find(({item})=>item.id===(process.env.COMPARISON_ITEM || 'P051')) || ready[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[];
try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/google-analytics\.com|googletagmanager\.com|\/insights\//,route=>route.abort());
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width<700 ? 844:1000});
    await page.goto(`${base}/?item=${example.item.id}#catalog`,{waitUntil:'domcontentloaded'});
    await page.locator('#catalogDetail[open]').waitFor();
    const link=page.locator(`.catalog-comparisons a[href*="group=${example.group.id}"]`);
    assert.ok(await link.isVisible());
    await link.click();
    await page.waitForFunction(()=>document.body.dataset.comparisonReady==='true');
    if(await page.locator('#candidateSection').isVisible()){
      const selections=page.locator('[data-toggle-product]');
      await selections.nth(0).click();
      await selections.nth(1).click();
      await page.locator('#startCompare').click();
    }else assert.ok(await page.locator('#comparisonWorkspace').isVisible(),'Saved comparisons must restore directly');
    assert.match(await page.locator('#comparisonPurpose').innerText(),new RegExp(example.group.label));
    assert.ok(await page.locator('[data-product-column]').count()>=2);
    await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-product-headers img')].every(img=>img.complete && img.naturalWidth>0),null,{timeout:20000});
    const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,overflows:[...document.querySelectorAll('.comparison-main td,.comparison-main th,.comparison-candidate')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.className)}));
    assert.ok(size.scroll<=size.viewport+1,JSON.stringify(size));
    assert.equal(size.overflows.length,0,JSON.stringify(size));
    await page.screenshot({path:resolve(out,`actual-${width}.png`)});
    await page.locator('#showEvidence').check();
    const source=page.locator('.comparison-table td:has([data-status=verified]) .comparison-field-source').first();
    assert.ok(await source.count(),'Actual verified values need source controls');
    await source.locator('summary').click();
    assert.ok(await source.locator('a').count(),'Verified value source must have a safe original link');
    await page.locator('#differencesOnly').check();
    await page.locator('[name=scope][value=all]').check();
    await page.locator('#saveSelection').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.dataset.comparisonReady==='true');
    assert.equal(await page.locator('#restoreSelection').isDisabled(),false);
    checks.push(`${width}px real-data home-to-comparison, images, no overflow, sources, filters, save/reload`);
  }
  assert.deepEqual(errors,[]);
  const report={base,coverage:data.coverage,checks,errors};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser.close();}
