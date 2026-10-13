import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(root, 'data/exports/catalog-planning-2026-10-07');
const rows = JSON.parse(await readFile(resolve(dataDir, 'catalog-rows.json'), 'utf8'));
const index = JSON.parse(await readFile(resolve(dataDir, 'collection-index.json'), 'utf8'));
const scope = JSON.parse(await readFile(resolve(dataDir, 'scope-plan.json'), 'utf8'));
const cachePath = resolve(dataDir, 'public-catalog-media-cache.json');
const outputPath = resolve(root, 'product-catalog.js');

if (rows.length !== 213 || index.rows.length !== 213 || scope.rows.length !== 213) throw new Error('Catalog row count changed');
const rowIds = new Set(rows.map(row => row.id));
if (rowIds.size !== 213 || rows.some(row => !index.rows.some(found => found.rowId === row.id) || !scope.rows.some(found => found.rowId === row.id))) throw new Error('Catalog row IDs differ');

const labels = {
  productCode: '상품 코드', article: '상품 번호', model: '모델명', sku: '상품 코드',
  amount: '내용량', totalAmount: '총내용량', unit: '단위', count: '수량', packCount: '묶음 수량', quantity: '수량',
  capacity: '용량', capacityL: '용량(L)', capacityLitres: '용량(L)', volumeMl: '용량(mL)',
  weightKg: '무게(kg)', netWeight: '순중량', totalWeight: '총중량',
  size: '크기', sizeCm: '크기(cm)', dimensionsCm: '크기(cm)', dimensionsMm: '크기(mm)',
  width: '너비', height: '높이', depth: '깊이', widthCm: '너비(cm)', heightCm: '높이(cm)',
  lengthCm: '길이(cm)', lengthM: '길이(m)', diameterCm: '지름(cm)', bladeLengthLabelCm: '날 길이(cm)',
  material: '소재', materialLabel: '소재', materials: '소재', fabric: '원단', filling: '충전재',
  care: '관리 방법', storage: '보관 방법', cooking: '조리 방법', preparation: '조리 방법',
  allergens: '알레르기 표시', ingredients: '원재료', ingredient: '원재료',
  origin: '원산지', countryOfManufacture: '제조국', country: '제조국', manufacturer: '제조사',
  ratedPowerW: '정격 소비전력(W)', ratedVoltage: '정격 전압', energyEfficiencyGrade: '에너지 효율 등급',
  color: '색상', fragrance: '향', packaging: '포장', contents: '구성',
  brand: '브랜드', productType: '제품 유형', productCategory: '제품 유형', type: '제품 유형',
  specification: '규격', dimensions: '치수', saleUnit: '판매 단위', configuration: '구성',
  listedVolume: '표시 내용량', listedVolumes: '내용량 옵션', volumeOptions: '내용량 옵션',
  listedOption: '표시 옵션', listedVolumeKg: '내용량(kg)', volumeLitres: '용량(L)', amountGrams: '내용량(g)',
  listedWeightG: '표시 무게(g)', form: '제형', scent: '향', countryOfOrigin: '원산지',
  optionCount: '옵션 수', handleMaterial: '손잡이 소재', bristleMaterial: '솔 소재',
  labelledHairType: '표시 사용 대상', packOptions: '포장 수량 옵션', includedDesiccant: '구성품',
  refrigeratorCapacityLiters: '용량(L)', cableLengthM: '코드 길이(m)',
};
const excluded = /미확인|확인 필요|unknown|not verified|not confirmed|가격|재고|할인|무료배송|최저|효능|성능|광고|추천|추정|예상|판매종료|품절/i;
const sourceLabels = [
  [/ikea\.com$/, '이케아'], [/kurly\.com$/, '컬리'], [/cjthemarket\.com$/, 'CJ더마켓'],
  [/lgcaremall\.com$/, 'LG생활건강몰'], [/lionkorea\.co\.kr$/, '라이온코리아'],
  [/lge\.co\.kr$/, 'LG전자'], [/samsung\.com$/, '삼성전자'], [/philips\.co\.kr$/, '필립스'],
  [/ssg\.com$/, 'SSG'], [/dongwonmall\.com$/, '동원몰'], [/amoremall\.com$/, '아모레몰'],
  [/oliveyoung\.co\.kr$/, '올리브영'], [/costco\.co\.kr$/, '코스트코'],
];
const split = value => String(value || '').split(/[;；]/).map(part => part.trim()).filter(Boolean);
const cleanValue = value => {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'value')) value = value.value;
  if (value == null || typeof value === 'boolean') return null;
  if (Array.isArray(value)) value = value.join(', ');
  if (!['string', 'number'].includes(typeof value)) return null;
  const text = String(value).trim();
  return text && text.length <= 160 && !excluded.test(text) ? text : null;
};
const factsFor = fields => Object.entries(fields || {}).flatMap(([key, raw]) => {
  const value = labels[key] && cleanValue(raw);
  return value ? [{ label: labels[key], value }] : [];
}).slice(0, 6);
const validUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; }
  catch { return false; }
};
const sourceLabel = url => sourceLabels.find(([pattern]) => pattern.test(new URL(url).hostname))?.[1] || '상품 원문';
const guidanceCopy = {
  P133: ['구로구청 쓰레기배출요령', '종량제봉투 종류와 구입 방법은 거주지 지자체 안내를 확인하세요. 연결된 자료는 서울 구로구 기준입니다.'],
  P134: ['구로구청 음식물류폐기물 봉투 안내', '음식물류폐기물 봉투의 종류와 규격은 거주지 지자체 안내를 확인하세요. 연결된 자료는 서울 구로구 기준입니다.'],
  P213: ['식품의약품안전처 의약품 온라인 판매 안내', '상비약은 온라인 구매 상품으로 연결하지 않습니다. 필요한 약은 약사 또는 의료전문가와 확인하세요.'],
};

let cache = {};
try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let recovered = {};
try { recovered = JSON.parse(await readFile(resolve(dataDir, 'image-recovery-complete.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const candidates = index.records.filter(record => record.usableCandidate === true && rowIds.has(record.rowId) && validUrl(record.sourceUrl));

function makeCatalog() {
  const items = rows.map(row => {
    const products = candidates.filter(record => record.rowId === row.id).map((record, position) => {
      const id = `${row.id}-${String(position + 1).padStart(2, '0')}`;
      const recovery = recovered[id]?.status === 'resolved' ? recovered[id] : null;
      return {
        id,
        name: recovery?.name || record.verifiedFields.title?.value || record.verifiedFields.productName || record.name,
        url: validUrl(recovery?.linkUrl) ? recovery.linkUrl : record.sourceUrl,
        sourceLabel: recovery?.sourceLabel || sourceLabel(record.sourceUrl),
        facts: recovery?.facts || factsFor(record.verifiedFields),
        imageUrl: recovery?.imageUrl || (/택1|옵션/.test(record.name) ? null : (cache[record.sourceUrl]?.imageUrl || (validUrl(record.imageUrl) ? record.imageUrl : null))?.replace(/^http:/, 'https:')) || null,
        imageScope: recovery?.imageScope || 'product',
      };
    });
    const guidance = index.guidance.filter(entry => entry.rowId === row.id && validUrl(entry.sourceUrl)).map(entry => ({
      url: entry.sourceUrl,
      title: guidanceCopy[row.id][0],
      description: guidanceCopy[row.id][1],
    }));
    return {
      id: row.id, title: row.item, category: row.category, subgroup: row.subgroup,
      variants: split(row.variants), criteria: split(row.criteria), existingIds: String(row.existingIds || '').split(',').map(id => id.trim()).filter(Boolean),
      kind: guidance.length ? 'guidance' : 'product', products, guidance,
    };
  });
  return { version: '20261010-1', updatedAt: new Date().toISOString(), categories: [...new Set(rows.map(row => row.category))], items };
}

async function exportCatalog() {
  const catalog = makeCatalog();
  await writeFile(outputPath, `window.ProductCatalog = ${JSON.stringify(catalog, null, 2)};\n`, 'utf8');
  console.log(`Exported ${catalog.items.length} items, ${catalog.items.reduce((sum, item) => sum + item.products.length, 0)} products, ${catalog.items.filter(item => item.kind === 'guidance').length} guidance items, ${catalog.items.reduce((sum, item) => sum + item.products.filter(product => product.imageUrl).length, 0)} images`);
}

await exportCatalog();

if (process.argv.includes('--images')) {
  const urls = [...new Set(candidates.map(record => record.sourceUrl))].filter(url => !cache[url] || cache[url].status === 'fetch_error' || cache[url].status === 'timeout');
  let cursor = 0;
  const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'");
  const meta = (html, key) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), decode(match[3])]));
      if (attributes.property === key || attributes.name === key) return attributes.content || '';
    }
    return '';
  };
  async function inspect(url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProductCatalogMetadata/1.0)' }, redirect: 'follow' });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return { imageUrl: null, status: `http_${response.status}` };
      const html = await response.text();
      if (/captcha|cloudflare challenge|접근이 제한|로봇이 아닙니다/i.test(html.slice(0, 10000))) return { imageUrl: null, status: 'blocked' };
      const title = meta(html, 'og:title') || html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '';
      const image = meta(html, 'og:image');
      const records = candidates.filter(record => record.sourceUrl === url);
      const pageTitle = normalize(decode(title));
      const matched = records.some(record => {
        const fields = record.verifiedFields || {};
        const identifier = [fields.model, fields.article, fields.productCode, fields.sku].map(value => normalize(String(value || ''))).find(value => value.length >= 5 && pageTitle.includes(value));
        if (identifier) return true;
        const tokens = String(record.name).split(/[\s/+,()·-]+/).map(normalize).filter(token => token.length >= 3 && !/^\d+(g|kg|ml|l|개|cm)?$/.test(token));
        return tokens.filter(token => pageTitle.includes(token)).length >= 2;
      });
      if (!matched) return { imageUrl: null, status: 'title_mismatch' };
      const imageUrl = new URL(image, response.url).href;
      if (!image || !validUrl(imageUrl) || /logo|banner|sprite|placeholder|category|default|favicon/i.test(new URL(imageUrl).pathname)) return { imageUrl: null, status: 'invalid_image' };
      return { imageUrl, status: 'matched' };
    } catch (error) { return { imageUrl: null, status: error.name === 'TimeoutError' ? 'timeout' : 'fetch_error' }; }
  }
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      cache[url] = await inspect(url);
      if (cursor % 20 === 0) console.log(`Inspected ${cursor}/${urls.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await exportCatalog();
  console.log('Image statuses:', Object.entries(Object.values(cache).reduce((counts, entry) => { counts[entry.status] = (counts[entry.status] || 0) + 1; return counts; }, {})));
}
