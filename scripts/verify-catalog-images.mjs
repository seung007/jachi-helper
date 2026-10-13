import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4175';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
try {
  const page = await browser.newPage();
  await page.route(/google-analytics\.com|googletagmanager\.com|\/insights\//, route => route.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ProductCatalog?.items?.length === 213);
  const result = await page.evaluate(async () => {
    const products = window.ProductCatalog.items.flatMap(item => item.products);
    const records = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (cursor < products.length) {
        const product = products[cursor++];
        records.push(await new Promise(resolve => {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          const finish = error => {
            clearTimeout(timer);
            img.onload = img.onerror = null;
            resolve({ id: product.id, imageUrl: product.imageUrl, width: img.naturalWidth, height: img.naturalHeight, error });
          };
          const timer = setTimeout(() => finish('timeout'), 15000);
          img.onload = () => finish(null);
          img.onerror = () => finish('image_error');
          img.src = product.imageUrl || '';
        }));
      }
    }));
    return { total: products.length, loaded: records.filter(record => record.width > 0).length, failed: records.filter(record => !record.width), records };
  });
  writeFileSync('output/playwright/catalog/images-report.json', JSON.stringify({ base, ...result }, null, 2));
  console.log(JSON.stringify({ base, total: result.total, loaded: result.loaded, failed: result.failed }));
  if (result.loaded !== result.total) process.exitCode = 1;
} finally { await browser.close(); }
