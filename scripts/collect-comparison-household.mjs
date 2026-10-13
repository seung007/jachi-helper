import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { purposeGroup } from './comparison-taxonomy.mjs';
import C from '../comparison-core.js';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'data/exports/comparison-planning-2026-10-11');
const cacheDir = resolve(dir, 'household-cache');
const output = resolve(dir, 'collected-household.json');
const oldDir = resolve(root, 'data/exports/catalog-planning-2026-10-07');
const agent = 'JachiComparisonCollector';
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
const norm = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const now = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let activeTaxonomy = [];
const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const numericArg = (name, fallback) => {
  const value = Number(arg(name, fallback));
  assert(Number.isFinite(value) && value >= 0, `Invalid --${name}`);
  return value;
};
async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function save(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', 'utf8');
  for (let retry = 0; ; retry++) {
    try { await rename(`${path}.tmp`, path); return; }
    catch (error) {
      if (!['EPERM','EBUSY'].includes(error.code) || retry >= 6) throw error;
      await sleep(100 * (retry + 1));
    }
  }
}
function safeUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) return null;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function sourceIdentity(value) {
  const url = new URL(value);
  if (url.hostname.includes('ikea.com')) return `ikea:${url.pathname.match(/(?:s)?(\d{8})\/?$/)?.[1] ?? url.pathname}`;
  for (const key of ['goodsNo', 'itemId', 'item_num', 'pcode', 'prdNo', 'productNo']) {
    if (url.searchParams.has(key)) return `${url.hostname}:${key}:${url.searchParams.get(key)}`;
  }
  return `${url.hostname}${url.pathname}`;
}

// Longest matching robots rule wins; equally specific Allow overrides Disallow.
export function robotsPolicy(text, product = agent) {
  const groups = [];
  let group = null;
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true;
      if (key === 'crawl-delay') group.delay = Math.max(group.delay, Number(value) || 0);
      else if (value) group.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  const specific = groups.filter(group => group.agents.some(name => name !== '*' && product.toLowerCase().includes(name)));
  const selected = specific.length ? specific : groups.filter(group => group.agents.includes('*'));
  return {
    delay: Math.max(0, ...selected.map(group => group.delay)),
    allows(url) {
      const path = new URL(url).pathname + new URL(url).search;
      const matches = selected.flatMap(group => group.rules).filter(rule => {
        const parts = rule.pattern.replace(/\$$/, '').split('*').map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return new RegExp('^' + parts.join('.*') + (rule.pattern.endsWith('$') ? '$' : '')).test(path);
      }).sort((a, b) => b.pattern.replace(/[*$]/g, '').length - a.pattern.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow));
      return matches[0]?.allow ?? true;
    },
  };
}

// These are collection filters, not the main owner's canonical taxonomy.
const filters = {
  P051: ['냄비', '냄비(?!받침)|pot with lid'], P052: ['프라이팬', '프라이팬|frying pan'], P053: ['주방칼|식도', '주방칼|식도|chef'],
  P054: ['도마', '도마'], P055: ['주방가위', '주방가위'], P056: ['국자', '국자'],
  P057: ['뒤집개|스패츌러', '뒤집개|스패츌러'], P058: ['집게', '주방집게|조리집게|집게'],
  P059: ['필러', '필러'], P060: ['콜랜더|채반', '콜랜더|채반'], P061: ['계량', '계량컵|계량스푼'],
  P062: ['젓가락', '젓가락'], P063: ['그릇|밥그릇', '밥그릇|그릇'], P064: ['머그', '머그'],
  P065: ['물병|물통', '물병|물통'], P066: ['보관용기|식품보관', '보관용기.*뚜껑|식품보관용기'],
  P072: ['밀봉클립', '밀봉클립'], P075: ['장갑', '청소용 장갑|고무장갑'],
  P077: ['행주', '행주'], P078: ['식기건조대', '식기건조대'], P080: ['타올|수건', '세면타올|세면수건'],
  P095: ['핸드샤워|샤워기', '핸드샤워|샤워기'], P098: ['욕실매트', '욕실매트'],
  P100: ['욕실선반|욕실 선반', '선반유닛|욕실선반|욕실 선반'], P101: ['물비누통', '물비누통'],
  P111: ['세탁망', '세탁망'], P112: ['빨래바구니', '빨래바구니'], P113: ['빨래주머니', '빨래주머니'],
  P114: ['건조대', '건조대'], P115: ['건조대집게|빨래집게', '건조대집게|빨래집게'],
  P116: ['먼지제거 롤러', '먼지제거 롤러'], P117: ['먼지제거 브러시', '먼지제거 브러시'],
  P125: ['대걸레|밀대', '대걸레|밀대'], P126: ['빗자루', '빗자루'], P128: ['극세사천', '극세사천'],
  P129: ['변기솔', '변기솔'], P130: ['청소솔', '청소솔|바닥솔|틈새솔'], P131: ['유리닦이', '유리닦이'],
  P135: ['휴지통', '휴지통|쓰레기통'], P136: ['분리수거', '휴지통.*뚜껑|분리수거'],
  P138: ['이불', '이불(?!커버)'], P139: ['매트리스커버', '매트리스커버'],
  P140: ['매트리스보호패드', '매트리스보호패드'], P141: ['매트리스방수패드', '매트리스방수패드'],
  P142: ['베개', '베개(?!커버)'], P143: ['베개커버', '베개커버'], P145: ['매트리스', '(?:스프링|폼)매트리스'],
  P146: ['침대프레임', '침대프레임'], P147: ['커튼', '커튼 한 쌍|커튼1폭|커튼,'],
  P148: ['블라인드', '암막블라인드'], P149: ['책상', '책상'], P150: ['사무용의자', '사무용의자'],
  P151: ['발받침', '발받침'], P152: ['2인용소파', '2인용소파'],
  P178: ['옷걸이', '옷걸이(?!행거)'], P179: ['옷걸이행거', '옷걸이행거'],
  P180: ['옷장', '옷장'], P181: ['수납박스', '수납박스'], P182: ['압축팩', '압축팩'],
  P183: ['선반유닛', '선반유닛'], P184: ['바구니', '바구니'], P185: ['칸막이정리함', '칸막이정리함'],
  P186: ['신발장', '신발장|신발정리대'], P187: ['샤워커튼봉', '샤워커튼봉'],
  P190: ['독서등', '독서등'], P191: ['충전지', '(?:충전지|rechargeable battery).*AA'], P192: ['케이블 정리', '케이블 정리'],
  P193: ['줄자', '줄자'], P194: ['공구세트', '공구세트'], P195: ['가위', '가위'],
  P197: ['슬리퍼', '슬리퍼'], P199: ['거울', '거울'],
  P067: ['냉동밥', '냉동밥'], P068: ['도시락', '도시락|DOSILOCK'], P069: ['쌀통', '쌀통'],
  P070: ['지퍼백', '지퍼백'], P071: ['종이호일', '종이호일'], P073: ['주방세제', '주방세제|참그린'],
  P074: ['수세미', '수세미'], P076: ['키친타올', '키친타올|키친타월'], P079: ['싱크대', '싱크대.*거름망|배수구망'],
  P081: ['샴푸', '샴푸|shampoo'], P082: ['트리트먼트', '트리트먼트|린스|conditioner'],
  P083: ['바디워시', '바디워시|거품샤워|body wash'], P084: ['핸드워시', '핸드워시|hand wash'],
  P085: ['클렌징', '클렌징|세안|cleansing'], P086: ['바디로션', '바디로션|body lotion'],
  P087: ['칫솔', '칫솔|toothbrush'], P088: ['치약', '치약|toothpaste'], P089: ['치실', '치실|floss'],
  P090: ['면도기', '면도기|razor'], P093: ['화장지', '화장지'], P094: ['물티슈', '물티슈'],
  P097: ['욕실화', '욕실화'], P099: ['욕실 배수구', '욕실.*거름망|트렌치.*거름망'],
  P102: ['세탁세제', '비트|일반.*세탁세제'], P103: ['울 세제', '울드라이|중성.*세제'],
  P104: ['실내건조', '실내건조'], P105: ['운동복', '운동복|스포츠.*세제'], P106: ['섬유유연제', '섬유유연제|포린스'],
  P107: ['얼룩제거', '얼룩제거|O2액션'], P108: ['산소계', '산소계.*표백|옥시크린.*분말'],
  P109: ['섬유탈취', '섬유탈취'], P110: ['세탁조', '세탁조.*클리너|세탁조.*세정'],
  P118: ['욕실용 세정제', '욕실용.*세정'], P119: ['변기 세정제', '변기.*세정'],
  P120: ['곰팡이', '곰팡이'], P121: ['주방용 세정제', '주방용.*세정'],
  P122: ['유리용세정제', '유리용.*세정'], P123: ['바닥 세정제', '바닥.*세정'], P124: ['배수관', '배수관.*세정|펑펑'],
  P127: ['청소포', '청소포'], P132: ['뚫어뻥', '압축기|뚫어뻥'], P137: ['차렵이불', '차렵이불.*Q'],
  P144: ['수면안대', '수면안대'], P153: ['전자레인지', '전자레인지|microwave'],
  P154: ['밥솥', '밥솥'], P155: ['에어프라이어', '에어프라이어|airfryer'],
  P156: ['전기포트', '케틀|전기포트|kettle'], P157: ['인덕션', '인덕션|induction'],
  P158: ['토스터', '토스터|toaster'], P159: ['블렌더', '블렌더|blender'],
  P160: ['커피메이커', '커피메이커|coffee maker'], P161: ['냉장고', '냉장고|refrigerator'],
  P162: ['냉동고', '냉동고|freezer'], P163: ['정수', '마렐라|Marella'],
  P165: ['청소기', '청소기|제트|vacuum'], P167: ['세탁기', '세탁기'], P168: ['건조기', '건조기'],
  P169: ['다리미', '다리미|steamer'], P170: ['제습기', '제습기|dehumidifier'],
  P171: ['공기청정기', '공기청정기|air purifier'], P172: ['가습기', '가습기|humidifier'],
  P173: ['서큘레이터', '서큘레이터|circulator'], P174: ['벽걸이에어컨', '벽걸이에어컨'],
  P175: ['전기요', '전기요.*싱글'], P176: ['헤어드라이어', '헤어드라이어|헤어 드라이어|hair dryer'],
  P177: ['공유기', '공유기|router'], P188: ['멀티탭', '멀티탭'], P189: ['PD 충전기', '25W.*충전기'],
  P196: ['테이프', '다용도테이프'], P198: ['우산', '우산'], P200: ['제습제', '제습제'],
  P201: ['온습도계', '온습도계'], P202: ['문풍지', '문풍지'], P203: ['방충망', '방충망.*보수'],
  P204: ['하수구트랩', '하수구트랩'], P205: ['라이트트랩', '라이트트랩'], P206: ['훈증', '리퀴드.*히터'],
  P207: ['도어스토퍼', '도어스토퍼'], P208: ['도어록', '도어록|도어락'], P209: ['손전등', '손전등'],
  P210: ['분말소화기', '분말소화기.*3.3'], P211: ['밴드', '밴드플러스'], P212: ['체온계', '귀적외선|써모스캔|ThermoScan'],
};
const purposeNotes = {
  P062: '식사용 젓가락; 수저는 별도 목적', P063: '밥공기/볼; 접시는 별도 목적',
  P067: '냉동밥 소분 보관; 냉동 및 가열 호환 확인 필요', P071: '에어프라이어 종이호일; 랩/알루미늄호일 별도',
  P091: '월경용 패드; 라이너/입는 제품 및 크기별 별도 검수', P096: '샤워기 교체필터; 정확한 장착 모델 호환 필수',
  P102: '일반 의류 세탁세제; 울 전용 제외, 일반/드럼 호환별 구분',
  P103: '중성 울/섬세 의류 세탁; 일반세제와 비교하지 않음', P104: '실내건조용 드럼 세제; 일반 세탁기/분말 별도',
  P105: '운동복용 세탁세제; 제조사 운동복 사용 표시 필요', P108: '세탁용 산소계 표백제; 염소계/표면용 별도',
  P109: '섬유 탈취용 분무 제품; 항균효과 확인 아님', P118: '욕실 표면 세정; 사용 표면과 희석 조건 별도 검수',
  P119: '변기 세정; 탱크 투입/직접 표면 사용 별도', P120: '곰팡이 제거용; 적용 표면/성분 확인 필요',
  P121: '주방 기름때 세정; 식품 접촉면 사용 가능 여부 별도', P122: '유리 표면 세정', P123: '바닥 표면 세정; 목재/타일 별도',
  P124: '배수관 세정; 변기/싱크대 적용과 관 재질 확인 필요', P137: 'Q 규격 차렵이불; 실제 가로/세로 확인 필요',
  P138: '150x200 cm 덮는 속이불; 이불커버 별도', P139: '90x200 cm 매트리스커버',
  P140: '90x200 cm 매트리스보호패드', P141: '90x200 cm 매트리스방수패드',
  P142: '50x80 cm 수면용 베개', P143: '50x80 cm 베개커버', P145: '90x200 cm 수면용 매트리스',
  P146: '90x200 cm 매트리스용 침대 프레임', P152: '2인용 소파; 빈백/좌식의자 별도',
  P158: '빵 토스터; 미니오븐 별도', P160: '드립 커피메이커; 에스프레소/캡슐 별도',
  P164: '정수필터; 장착 정수기 호환 필수', P166: '청소기 교체필터/키트; 정확한 장착 모델 호환 필수',
  P173: '서큘레이터; 일반 선풍기 별도', P175: '싱글 전기요; 온수/온열 매트 별도',
  P189: '25W USB-C PD 충전기; 케이블 단품 별도', P191: 'AA 니켈수소 충전지; AAA/일회용 별도',
  P199: '전신 벽거울; 탁상거울 별도', P205: '해충 포획 도구; 살충제 별도',
  P206: '전기 훈증 살충제품; 분무형 별도', P210: '3.3kg 분말소화기; 감지기 별도',
  P211: '상처 덮개 밴드; 의약품 구매 비교 아님', P212: '귀적외선 체온계; 이마/접촉형 별도',
};
// Discovery terms are not product restrictions or ranking criteria.
const searchTerms = {
  'P062-default':'수저 젓가락','P063-bowl':'밥그릇','P064-default':'머그컵','P065-default':'텀블러',
  'P072-bag':'위생백','P082-rinse':'트리트먼트','P082-leave-in':'노워시 트리트먼트','P083-soap':'비누',
  'P085-rinse':'클렌징폼','P086-face':'수분크림','P086-body':'바디로션','P087-manual':'칫솔',
  'P087-head':'전동칫솔 리필','P090-razor':'면도기','P090-foam':'쉐이빙폼','P091-pad':'생리대',
  'P091-reusable':'생리컵','P092-tissue':'미용티슈','P100-default':'욕실선반','P101-bottle':'욕실 디스펜서',
  'P102-default':'세탁세제','P104-default':'실내건조 세탁세제','P105-default':'운동복 세제',
  'P107-default':'얼룩제거제','P108-default':'과탄산소다','P109-laundry':'세탁 탈취제','P109-spray':'섬유탈취제',
  'P113-default':'빨래가방','P115-default':'빨래집게','P116-body':'돌돌이','P116-refill':'돌돌이 리필',
  'P117-electric':'보풀제거기',
  'P119-installed':'변기 세정 블록','P125-dry':'청소 밀대','P125-wet':'물걸레 밀대',
  'P126-default':'빗자루','P127-dry':'정전기 청소포','P132-toilet':'변기 뚫어뻥',
  'P136-default':'분리수거함','P137-default':'차렵이불','P149-desk':'책상','P149-table':'식탁',
  'P150-work':'사무용 의자','P150-dining':'식탁 의자','P152-floor':'좌식의자',
  'P162-default':'냉동고','P163-installed':'정수기','P163-jug':'정수 포트','P165-manual':'청소기',
  'P174-aircon':'에어컨','P174-heater':'전기 난방기','P180-default':'옷장','P181-default':'침구 보관함',
  'P184-default':'수납박스','P185-default':'서랍 정리함','P190-default':'조명 스탠드',
  'P194-default':'드라이버 공구','P196-default':'보수 테이프','P202-default':'문풍지',
  'P203-screen':'방충망','P205-default':'해충 포획','P206-default':'살충제',
  'P207-stop':'도어스토퍼','P207-security':'휴대용 도어잠금','P208-default':'도어락',
  'P208-default':'도어락','P209-default':'손전등','P211-band':'상처 밴드','P211-tape':'의료용 테이프',
};
Object.assign(filters, {
  P102:['세탁세제','세탁세제|(?:액체|분말|캡슐)세제'],P103:['중성 세제','울.*세제|중성.*세제'],P108:['표백제','표백제|과탄산'],
  P118:['욕실 세정제','욕실.*(?:세정|클리너|청소)'],P121:['주방 세정제','주방.*(?:세정|클리너|청소)|기름때'],
  P122:['유리 세정제','유리.*(?:세정|클리너|청소)'],P137:['차렵이불','차렵이불|덮는이불'],
  P163:['정수기','정수기|정수.*(?:포트|물통)|마렐라|Marella'],P173:['선풍기','선풍기|서큘레이터|circulator|fan'],
  P175:['전기요','전기요|온열매트|전기장판'],P189:['충전기','충전기|충전.*케이블'],
  P196:['테이프','테이프|보수재'],P205:['해충 포획','해충|벌레|모기|포충|끈끈이'],
  P206:['살충제','살충|방역|훈증|리퀴드.*히터'],P210:['소화기','소화기|감지기'],
  P211:['밴드','밴드|거즈|의료.*테이프'],P212:['체온계','체온계|귀적외선|써모스캔|ThermoScan'],
  P191:['건전지','\\bAAA?\\b'],
});
Object.assign(purposeNotes, {
  P104:'실내건조용 세제; 세탁기 호환·제형별 표시를 확인',P109:'세탁 첨가형·섬유 분무형을 별도 목적 그룹으로 구분',
  P137:'차렵이불; 표시 가로·세로와 세탁 방법을 비교',P138:'이불커버·속이불은 별도 목적 그룹',
  P139:'매트리스커버; 실측 규격과 장착 방식 확인',P140:'침대 패드; 실제 규격·관리 방법 확인',
  P141:'방수패드; 실제 규격과 제조사 방수 표시 확인',P142:'수면용 베개; 소재·크기·관리 표시 비교',
  P143:'베개커버; 실제 규격·소재·세탁 표시 확인',P145:'수면용 매트리스; 실제 크기·구조 비교',
  P146:'침대 프레임; 매트리스 규격·조립·설치 조건 확인',P152:'소파·빈백·좌식의자는 별도 목적 그룹',
  P173:'선풍기·서큘레이터; 원문 제품 유형·설치·기능 표시 비교',P175:'전기요·온열매트; 규격·전원·관리 표시 비교',
  P189:'충전기·케이블은 별도 목적 그룹; 출력·규격·호환 표시 확인',P191:'AA·AAA는 별도 규격 그룹; 전지 종류와 충전 가능 표시 확인',
  P210:'소화기·화재 감지기는 별도 목적 그룹',P212:'체온계; 측정 방식·사용 대상·공식 주의사항 확인',
});
export function robotsResultAllowsPublicGet(status) { return status >= 400 && status < 500 && status !== 429; }
function purpose(item) { return purposeNotes[item.id] || `${item.title} 구매; 세부 용도와 필수 호환 조건 검수`; }
function purposeMatch(item, name) {
  const filter = filters[item.id];
  const groups = activeTaxonomy.find(row => row.id === item.id)?.groups || [];
  const groupMatch = groups.some(group => group.match && new RegExp(group.match, 'i').test(name));
  const titleMatch = (item.title || '').split(/[·ㆍ/]/).some(term => term.trim().length >= (filter ? 3 : 2) && norm(name).includes(norm(term)));
  if ((!filter || !new RegExp(filter[1], 'i').test(name)) && !groupMatch && !titleMatch) return false;
  if (item.id === 'P191' && !/\bAAA?\b/.test(name)) return false;
  if (item.id === 'P063' && /서빙|소스|샐러드/.test(name)) return false;
  if (item.id === 'P199' && /탁상|면도|화장|확대/.test(name)) return false;
  if (item.id === 'P114' && /식기|집게|빨래집게|dish|tableware/i.test(name)) return false;
  if (item.id === 'P051' && /받침|뚜껑만|trivet|stand|accessor/i.test(name)) return false;
  if (item.id === 'P145' && /커버|보호패드|방수패드/.test(name)) return false;
  if (item.id === 'P147' && /커튼봉|커튼레일|커튼링|커튼고리/.test(name)) return false;
  return true;
}
function purposeGuard(item, name) {
  if (/증정|선물세트|기획세트/.test(name)) return false;
  if (item.id === 'P082' && /컬링에센스|샴푸.*\+|컨디셔너.*\+/.test(name)) return false;
  if (item.id === 'P119' && !/변기/.test(name)) return false;
  if (item.id === 'P118' && !/욕실|bathroom|bath/i.test(name)) return false;
  if (item.id === 'P121' && !/주방|기름때|kitchen/i.test(name)) return false;
  if (item.id === 'P122' && !/유리|glass/i.test(name)) return false;
  if (item.id === 'P123' && !/바닥|floor/i.test(name)) return false;
  if (item.id === 'P205' && /리필/.test(name) && !/본품|본체/.test(name)) return false;
  return true;
}
function namedFamilyKey(name, url) {
  const host = new URL(url).hostname;
  if (host === 'www.philips.co.kr') {
    const code = new URL(url).pathname.match(/\/c-p\/([A-Z]+\d+)_\d+/i)?.[1];
    if (code) return `philips:base:${code.toLowerCase()}`;
  }
  if (/샤프란.*꽃담초.*섬유탈취/.test(name)) return 'family:shafran-flower-fabric-spray';
  if (/샤프란케어.*스타일러.*섬유탈취/.test(name)) return 'family:shafran-care-styler-fabric-spray';
  if (/샤프란케어.*향기뿜/.test(name)) return 'family:shafran-care-hyangippum-fabric-spray';
  if (/샤프란케어.*섬유탈취/.test(name)) return 'family:shafran-care-fabric-spray';
  if (/테크.*실내건조.*액체/.test(name)) return 'family:tech-indoor-drying-liquid';
  if (/테크.*울드라이/.test(name)) return /캡슐/.test(name) ? 'family:tech-wooldry-capsule' : 'family:tech-wooldry-liquid';
  if (/메소드.*고보습.*핸드워시/.test(name)) return 'family:method-moisturizing-handwash';
  if (/세꼼마|세균아\s*꼼짝마/.test(name) && /핸드워시/.test(name)) return 'family:sekomma-handwash';
  if (/엘라스틴.*시그니처.*극손상.*트리트먼트/.test(name)) return 'family:elastine-signature-damaged-hair-treatment';
  if (/엘라스틴.*아르간오일.*트리트먼트/.test(name)) return 'family:elastine-argan-treatment';
  if (/엘라스틴.*피토케라틴.*모이스처.*트리트먼트/.test(name)) return 'family:elastine-phytokeratin-treatment';
  if (/비욘드.*(?:PRO\s*디펜스|프로디펜스).*트리트먼트/i.test(name)) return 'family:beyond-pro-defense-treatment';
  if (/홈스타.*퍼퓸탈취플러스/.test(name)) return 'family:homestar-dehumidifier-perfume-plus';
  if (/에프킬라.*라이트트랩/.test(name)) return 'family:effkilla-light-trap';
  if (/에프킬라.*리퀴드.*스마트\s*히터/.test(name)) return 'family:effkilla-liquid-smart-heater';
  return null;
}
export function modelKey(name, url, identifiers = {}) {
  if (new URL(url).hostname.includes('ikea.com')) {
    // IKEA colour, size and package articles share a family + product-type key.
    const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1).replace(/-(?:s)?\d{8}$/, '');
    const family = slug.startsWith('ikea-365-hjaelte-') ? 'ikea-365-hjaelte' : slug.startsWith('ikea-365-') ? 'ikea-365' : slug.split('-')[0];
    const types = ['multifunctional-dish-rack', 'dish-drainer', 'dish-drying-mat', 'hand-towel', 'bath-towel', 'bath-mat', 'tea-towel', 'pot-with-lid', 'frying-pan', 'chef-s-knife', 'paring-knife', 'chopping-board', 'soup-ladle', 'kitchen-tongs', 'mug', 'bowl', 'plate', 'duvet-cover', 'pillowcase', 'pillow', 'duvet', 'pocket-sprung-mattress', 'foam-mattress', 'bed-frame', 'rechargeable-battery', 'desk', 'chair', 'sofa', 'mirror', 'laundry-basket', 'laundry-bag', 'drying-rack'];
    const productType = types.find(type => slug.includes(`-${type}`)) || '';
    const format = productType === 'rechargeable-battery' ? (/\baaa\b/.test(slug) ? 'aaa' : /\baa\b/.test(slug) ? 'aa' : 'format-unconfirmed') : '';
    // Conservative family collapse when an unambiguous product type is absent.
    return `ikea:${family}:${productType}:${format}`;
  }
  const named = namedFamilyKey(name, url);
  if (named) return named;
  if (identifiers.mpn) return `model:${norm(identifiers.mpn)}`;
  const explicitModel = C.namedModelCode(name);
  if (explicitModel) return `model:${norm(explicitModel)}`;
  const identity = name.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*(?:색상|컬러|옵션|구매)[^)]*\)/g, '')
    .replace(/\d+(?:\.\d+)?\s*(?:ml|mL|kg|g|L|l|매|입|개|롤|팩|세트)(?=[\s,()*×xX+\/]|$)/gi, '')
    .replace(/[xX*×+]\s*\d*\s*(?:개|입|팩)?/g, '').replace(/리필|용기|대용량|소용량|본품|낱개|묶음/g, '')
    .replace(/\S*향(?=[\s,()]|$)/g, '').replace(/화이트|블랙|핑크|그레이/g, '');
  return `unreviewed:${norm(identity)}`;
}

const aliases = {
  article: 'model', productCode: 'model', retailerSku: 'model', model: 'model', sku: 'model',
  materials: 'material', material: 'material', dimensionsCm: 'dimensions', openDimensions: 'dimensions', dimensions: 'dimensions',
  capacityL: 'capacity', capacityLitres: 'capacity', capacity: 'capacity', capacityMl: 'capacity', volumeMl: 'capacity', volumeLitres: 'capacity',
  listedVolume: 'capacity', listedVolumes: 'capacity', capacityLiters: 'capacity', count: 'count', packCount: 'count', pegCount: 'count', sheetCount: 'count',
  type: 'type', productType: 'type', productCategory: 'type', liquidType: 'type', care: 'care', materialsAndCare: 'care',
  maxLaundryLoad: 'load', maxLaundryLoadKg: 'load', maxLoadKg: 'load', labelledPurpose: 'use', listedUses: 'use', intendedUse: 'use', purpose: 'use', uses: 'use',
  labelledFeatures: 'claims', nameLabel: 'claims', efficacyStatus: 'claims', labelScope: 'cautions', fragranceOptions: 'fragrance', scent: 'fragrance',
  fragrance: 'fragrance', contents: 'contents', configuration: 'contents', listedOption: 'contents', recommendedRinse: 'dosage',
  powerW: 'power', ratedPowerW: 'power', warranty: 'warranty', weightKg: 'weight', weight: 'weight',
  unitWeightG: 'amount', listedVolumeKg: 'amount', compatibility: 'compatibility', functions: 'functions', safety: 'cautions',
};
const labels = { model: '모델/품번', material: '재질', dimensions: '치수(원문 적용 범위)', capacity: '용량 표기', type: '제품 유형',
  care: '관리 표시', load: '표시 하중', use: '사용 대상 표기', claims: '제조사/판매자 표기(독립 시험 아님)',
  contents: '구성 표기', count: '수량', dosage: '사용량/사용 조건 표기', fragrance: '향 표기', power: '정격 전력 표기', cautions: '주의 표기' };
function oldFacts(entry) {
  if (!entry) return [];
  const evidenceType = /manufacturer|official|brand/.test(entry.sourceType || '') ? 'manufacturer_label' : 'retailer_listing';
  return Object.entries(entry.verifiedFields || {}).filter(([key, value]) => value != null && !/price|efficacy|noticeNumber/i.test(key)).map(([key, value]) => ({
    key: aliases[key] || (/height|width|depth|diameter|length/i.test(key) ? 'dimensions' : key),
    label: labels[aliases[key]] || key,
    value,
    ...(key.endsWith('Cm') ? { unit: 'cm' } : key.endsWith('Kg') ? { unit: 'kg' } : key.endsWith('Ml') ? { unit: 'mL' } : key.endsWith('L') || key.endsWith('Litres') ? { unit: 'L' } : {}),
    sourceUrl: entry.sourceUrl, evidenceType, sourceField: key, scope: entry.fieldSources?.[key] || 'previously_confirmed_source_field',
  }));
}

export async function parser() {
  const browser = await chromium.launch({ headless: true, executablePath: arg('browser', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') });
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  return { close: () => browser.close(), parse: (html, url) => page.evaluate(({ html, url }) => {
    // Inert DOMParser: remote scripts, links and images never execute or load.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';
    const meta = key => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || '';
    const products = [];
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if ([value['@type']].flat().includes('Product')) products.push(value);
      for (const child of Object.values(value)) if (typeof child === 'object') {
        if (Array.isArray(child)) child.forEach(visit); else visit(child);
      }
    }
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(script.textContent)); } catch {}
    }
    const abs = value => { try { return new URL(value, url).href; } catch { return null; } };
    if (!products.length && new URL(url).hostname === 'www.lgcaremall.com' && /\/product\/detail\//.test(url)) {
      const name = meta('og:description');
      const image = meta('og:image');
      if (name && name.length < 300 && image && !/logo|banner|default/i.test(image)) products.push({ name, image, detailEvidence: 'exact_detail_og_product_name_and_photo' });
    }
    if (!products.length && new URL(url).hostname === 'www.lionkorea.co.kr' && /itemView\.do/.test(url)) {
      const name = clean(doc.querySelector('h2'));
      const compact = value => String(value).replace(/\s+/g, '').toLowerCase();
      const image = [...doc.querySelectorAll('img')].find(img => img.getAttribute('src')?.startsWith('/upload/item/') && !img.closest('.view_item') && compact(img.alt).includes(compact(name)));
      if (name && image) products.push({ name, image: abs(image.getAttribute('src')), detailEvidence: 'exact_manufacturer_h2_and_matching_main_image_alt' });
    }
    const links = [...doc.querySelectorAll('a[href]')].map(node => ({ url: abs(node.getAttribute('href')), title: clean(node), image: node.querySelector('img')?.getAttribute('src') || '', alt: node.querySelector('img')?.alt || '', typeText: clean(node.closest('.prod_item')?.querySelector('.spec_list')) })).filter(link => link.url);
    const facts = [];
    const add = (key, label, value, scope) => { if (value) facts.push({ key, label, value, scope }); };
    for (const node of doc.querySelectorAll('[class*="measurements-tab__measurement-row"]')) {
      const label = clean(node.querySelector('[class*="measurement-name"]'));
      const value = clean(node.querySelector('[class*="measurement-value"]'));
      const key = /용량|부피|Volume|Capacity/i.test(label) ? 'capacity' : /무게|Weight/i.test(label) ? 'weight' : /하중|load/i.test(label) ? 'load' : /개수|매수|수량|패키지/.test(label) ? 'count' : 'dimensions';
      add(key, label, value, /내부|안쪽|internal/i.test(label) ? 'product_internal_dimensions' : 'product_dimensions_original_label');
    }
    for (const node of doc.querySelectorAll('[class*="range-revamp-product-dimensions__dimension"], [class*="pip-product-dimensions__dimension"]')) {
      const raw = clean(node);
      if (!raw || /탭 참조|포장/.test(raw)) continue;
      const colon = raw.indexOf(':');
      const label = colon >= 0 ? raw.slice(0, colon).trim() : '공식 제품 크기';
      const value = colon >= 0 ? raw.slice(colon + 1).trim() : raw;
      const key = /용량|부피|Volume|Capacity/i.test(label) ? 'capacity' : /무게|Weight/i.test(label) ? 'weight' : 'dimensions';
      add(key, label, value, 'manufacturer_range_revamp_product_dimensions');
    }
    for (const node of doc.querySelectorAll('[class*="package-measurement-item"]')) {
      const label = clean(node.querySelector('[class*="package-measurement-label"]'));
      const value = clean(node).slice(label.length).trim();
      add(/무게|weight/i.test(label) ? 'packagingWeight' : 'packagingDimensions', `포장 ${label}`, value, 'packaging_only_not_product_dimensions');
    }
    for (const [selector, key] of [['[class*="material-header"]', 'material'], ['[class*="care-header"]', 'care']]) {
      for (const header of doc.querySelectorAll(selector)) {
        const container = header.nextElementSibling;
        if (!container || /^H\d$/.test(container.tagName)) continue;
        const value = [...container.querySelectorAll('p,dt,dd')].map(clean).filter(Boolean).join('; ') || clean(container);
        if (/탭 참조|포장면 참조|교환 환불|제조년월|제조국|이케아 서비스|제품 번호/.test(value)) continue;
        add(key, key === 'material' ? '소재 표시 원문' : '관리 표시 원문', value, `manufacturer_${key}_section`);
        if (key === 'care') {
          const compatibility = [...container.querySelectorAll('p')].map(clean).filter(value => /인덕션|가스레인지|오븐|전자레인지|냉동고|호환/.test(value));
          if (compatibility.length) add('compatibility', '사용 기기 호환 표시', compatibility.join('; '), 'manufacturer_care_compatibility_label');
        }
      }
    }
    for (const node of doc.querySelectorAll('tr')) {
      const cells = [...node.querySelectorAll('th,td')].map(clean);
      if (cells.length >= 2 && cells[0].length < 100) {
        const label = cells[0], value = cells.slice(1).join(' | ');
        if (/가격|최저가|판매가|배송|리뷰|후기|평점|순위|할인|교환|환불|수입자|책임자|제조년월|동일모델의 출시/.test(label) || !value || /탭 참조|제품명 또는 이미지 참조|제조일자.*참조/.test(value)) continue;
        const key = /소재|재질/.test(label) ? 'material' : /크기|치수|폭|너비|높이|길이/.test(label) ? 'dimensions' : /용량/.test(label) ? 'capacity' : /무게|중량/.test(label) ? 'weight' : /소비전력|전력/.test(label) ? 'power' : /기능/.test(label) ? 'functions' : /호환|적용모델/.test(label) ? 'compatibility' : /구성/.test(label) ? 'contents' : /보증/.test(label) ? 'warranty' : 'specification';
        add(key, label, value, 'source_specification_table');
      }
    }
    return {
      title: meta('og:title') || doc.title, headings: [...doc.querySelectorAll('h1')].map(clean), ogImage: meta('og:image'),
      products: products.map(product => ({ name: product.name, sku: product.sku, mpn: product.mpn, brand: typeof product.brand === 'string' ? product.brand : product.brand?.name,
        image: product.image, description: product.description, category: product.category, url: product.url, additionalProperty: product.additionalProperty, detailEvidence: product.detailEvidence })),
      links, facts: [...new Map(facts.map(fact => [fact.key + ':' + fact.label + ':' + fact.scope + ':' + fact.value, fact])).values()],
      classes: [...new Set([...doc.querySelectorAll('[class]')].map(node => node.className).filter(value => typeof value === 'string' && /dimensions|material|care|product-details/.test(value)))].slice(0, 60),
      challenge: /access denied|just a moment|captcha|robot check/i.test(doc.title) || /cf-chl-|verify you are human|로봇이 아닙니다|자동입력 방지/.test(clean(doc.body).slice(0, 5000)),
    };
  }, { html, url }) };
}
function imageValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(imageValues);
  return value?.contentUrl || value?.url ? [value.contentUrl || value.url] : [];
}
function identityMatches(name, info) {
  const title = norm(name);
  const haystack = [info.name, info.sku, info.mpn].map(norm);
  if (haystack.some(value => value.length > 4 && (title.includes(value) || value.includes(title)))) return true;
  const tokens = String(name).split(/[\s,/+()]+/).map(norm).filter(value => value.length >= 3);
  return tokens.filter(token => norm(info.name).includes(token)).length >= 2;
}

async function collect() {
  await mkdir(cacheDir, { recursive: true });
  const context = { window: {} };
  runInNewContext(await readFile(resolve(root, 'product-catalog.js'), 'utf8'), context);
  const items = JSON.parse(JSON.stringify(context.window.ProductCatalog.items)).filter(item => +item.id.slice(1) >= 51 && +item.id.slice(1) <= 212 && item.kind === 'product');
  assert.equal(items.length, 160);
  assert(!items.some(item => ['P133', 'P134'].includes(item.id)));
  const recovery = await json(resolve(oldDir, 'image-recovery-complete.json'), {});
  const index = await json(resolve(oldDir, 'collection-index.json'), { records: [] });
  const taxonomy = await json(resolve(dir, 'comparison-taxonomy.json'), []);
  activeTaxonomy = taxonomy;
  const itemGroups = item => taxonomy.find(row => row.id === item.id)?.groups || [{ id: `${item.id}-default`, purpose: item.title, match: null, targetCount: 6 }];
  function groupFor(item, name, facts = [], url = '') {
    const groups = itemGroups(item);
    const matched = purposeGroup({ ...item, groups }, { name, facts, url });
    if (matched) return matched;
    if (item.id === 'P138' && /duvet-/.test(url) && !/duvet-cover/.test(url)) return groups.find(group => /속이불/.test(group.purpose));
    if (item.id === 'P187' && /curtain-rod/.test(url)) return groups.find(group => /압축봉/.test(group.purpose));
    if (item.id === 'P125' && /대걸레/.test(name)) return groups.find(group => /물걸레/.test(group.purpose));
    if (item.id === 'P199' && /\b40x150\b/.test(name)) return groups.find(group => /전신/.test(group.purpose));
    return null;
  }
  const previous = await json(output, { records: [], attempts: [] });
  const records = new Map();
  for (const record of previous.records) {
    const item = items.find(item => item.id === record.itemId);
    if (!item) continue;
    if (new URL(record.url).hostname.includes('ikea.com')) {
      record.modelKey = modelKey(record.name, record.url);
      record.id = `${record.itemId}-${hash(record.modelKey)}`;
      if (!purposeMatch(item, record.name)) { record.eligibilityStatus = 'pending'; record.reason = 'same_purchase_purpose_not_confirmed'; }
    }
    const named = namedFamilyKey(record.name, record.url);
    if (named) record.modelKey = named;
    else if (C.namedModelCode(record.name)) record.modelKey = modelKey(record.name, record.url);
    if (!purposeGuard(item, record.name)) { record.eligibilityStatus = 'pending'; record.reason = 'purchase_purpose_or_mixed_bundle_requires_review'; }
    const group = groupFor(item, record.name, record.facts, record.url);
    record.comparisonGroupId = group?.id || null;
    if (!group) { record.eligibilityStatus = 'pending'; record.reason = 'taxonomy_subpurpose_unconfirmed'; }
    // Remove obsolete over-broad extraction before replaying cached details.
    record.facts = record.facts.filter(fact => fact.scope !== 'manufacturer_product_details' && !/탭 참조|교환 환불|제조일자.*참조/.test(String(fact.value)));
    const duplicate = [...records.values()].find(value => value.itemId === record.itemId && value.modelKey === record.modelKey);
    if (duplicate) {
      const option = { name: record.name, url: record.url, imageUrl: record.imageUrl, checkedAt: record.checkedAt, eligibilityStatus: record.eligibilityStatus, facts: record.facts, sources: record.sources };
      duplicate.modelOptions = [...(duplicate.modelOptions || []), option];
      if (duplicate.eligibilityStatus === 'verified' || record.eligibilityStatus !== 'verified') continue;
      record.id = duplicate.id;
      record.modelOptions = [...(duplicate.modelOptions || []), { name: duplicate.name, url: duplicate.url, imageUrl: duplicate.imageUrl, checkedAt: duplicate.checkedAt, eligibilityStatus: duplicate.eligibilityStatus, facts: duplicate.facts, sources: duplicate.sources }];
    }
    if (records.get(record.id)?.eligibilityStatus === 'verified' && record.eligibilityStatus !== 'verified') continue;
    records.set(record.id, record);
  }
  const attempts = previous.attempts;
  const robots = new Map(), lastRequest = new Map(), blockedHosts = new Map();
  const selected = items.filter(item => !arg('items', '') || arg('items', '').split(',').includes(item.id));
  const htmlParser = await parser();
  const limit = numericArg('max-requests', 700), gap = numericArg('delay-ms', 1200);
  let requests = 0;
  const attempt = (url, kind, status, extra = {}) => attempts.push({ url, kind, status, checkedAt: now(), ...extra });
  async function request(url, kind, headers = {}, checkRobots = true, depth = 0) {
    url = safeUrl(url);
    if (!url) return { status: 'invalid_url' };
    const parsed = new URL(url), host = parsed.origin;
    if (depth > 5) return { status: 'redirect_limit' };
    if (blockedHosts.has(host)) { attempt(url, kind, 'host_stopped_after_block', { reason: blockedHosts.get(host) }); return { status: 'host_stopped_after_block' }; }
    if (checkRobots) {
      if (!robots.has(host)) {
        const response = await request(`${host}/robots.txt`, 'robots', {}, false);
        const policy = robotsResultAllowsPublicGet(response.httpStatus) ? robotsPolicy('') : response.status === 'ok' && !/<html/i.test(response.body) ? robotsPolicy(response.body) : null;
        if (robotsResultAllowsPublicGet(response.httpStatus)) attempt(`${host}/robots.txt`, 'robots_policy', 'robots_4xx_unavailable_target_public_get_permitted', { httpStatus: response.httpStatus, policySource: 'RFC9309_2.3.1.3' });
        robots.set(host, policy);
      }
      const policy = robots.get(host);
      if (!policy) { attempt(url, kind, 'robots_unavailable'); return { status: 'robots_unavailable' }; }
      if (!policy.allows(url)) { attempt(url, kind, 'robots_disallowed'); return { status: 'robots_disallowed' }; }
    }
    const cachePath = resolve(cacheDir, `${hash(url)}.json`);
    const cached = await json(cachePath, null);
    if (cached && !process.argv.includes('--refresh') && Date.now() - Date.parse(cached.checkedAt) < 24 * 3600000) {
      attempt(url, kind, cached.status, { cached: true, observedAt: cached.checkedAt, httpStatus: cached.httpStatus });
      if (cached.status === 'blocked' && (kind !== 'robots' || cached.httpStatus === 429)) blockedHosts.set(host, `http_${cached.httpStatus}`);
      return cached;
    }
    if (process.argv.includes('--offline')) return { status: 'offline_cache_missing' };
    if (requests >= limit) { attempt(url, kind, 'request_budget_remaining_queue_retained'); return { status: 'request_budget_remaining_queue_retained' }; }
    await sleep(Math.max(0, Math.max(gap, (robots.get(host)?.delay || 0) * 1000) - (Date.now() - (lastRequest.get(host) || 0))));
    requests++;
    lastRequest.set(host, Date.now());
    let response;
    try {
      response = await fetch(url, { headers: { 'User-Agent': `${agent}/1.0 (private product comparison research)`, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(18000) });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        const next = safeUrl(response.headers.get('location'), url);
        await response.body?.cancel();
        attempt(url, kind, 'redirect', { destination: next });
        // Never forward credentials to a redirect destination.
        if (Object.keys(headers).length) return { status: 'credential_redirect_not_followed' };
        return request(next, kind, {}, checkRobots, depth + 1);
      }
      const body = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const challenge = /<title[^>]*>[^<]*(access denied|just a moment|captcha|robot check)/i.test(body) || /cf-chl-|verify you are human|로봇이 아닙니다/.test(body.slice(0, 12000));
      const status = [401, 403, 429].includes(response.status) || challenge ? 'blocked' : response.ok ? 'ok' : `http_${response.status}`;
      const result = { url, status, httpStatus: response.status, checkedAt: now(), contentType, body: body.slice(0, 8000000) };
      await save(cachePath, result);
      attempt(url, kind, status, { httpStatus: response.status });
      if (status === 'blocked' && (kind !== 'robots' || response.status === 429)) blockedHosts.set(host, `http_${response.status}_or_challenge`);
      return result;
    } catch (error) {
      const result = { url, status: 'network_error', checkedAt: now(), reason: error.cause?.code || error.name };
      await save(cachePath, result);
      attempt(url, kind, result.status, { reason: result.reason });
      return result;
    }
  }
  const getHtml = async (url, kind) => {
    const response = await request(url, kind);
    if (response.status !== 'ok' || !response.contentType?.includes('html')) return { response };
    const info = await htmlParser.parse(response.body, response.url);
    if (info.challenge) { blockedHosts.set(new URL(url).origin, 'html_challenge'); return { response: { ...response, status: 'blocked' } }; }
    return { response, info };
  };
  const categoryMatches = (item, title) => filters[item.id] && new RegExp(filters[item.id][0], 'i').test(title) &&
    !(item.id === 'P114' && /식기|dish/i.test(title));
  function put(item, candidate, detail = {}) {
    const url = safeUrl(candidate.url);
    if (!url) return;
    const key = candidate.modelKey || modelKey(candidate.name, url, candidate.identifiers);
    const id = [...records.values()].find(record => record.itemId === item.id && record.modelKey === key)?.id ||
      [...records.values()].find(record => record.itemId === item.id && sourceIdentity(record.url) === sourceIdentity(url))?.id || `${item.id}-${hash(key)}`;
    const record = {
      id, itemId: item.id, name: candidate.name, modelKey: key, url,
      imageUrl: candidate.imageUrl || null, sourceLabel: candidate.sourceLabel || new URL(url).hostname,
      checkedAt: candidate.checkedAt || now(), comparisonPurpose: purpose(item),
      eligibilityStatus: candidate.verified ? 'verified' : 'pending', facts: candidate.facts || [],
      sources: candidate.sources || [{ url, title: candidate.name, checkedAt: candidate.checkedAt || now() }],
      reason: candidate.reason || 'partial_source_fields_only; not a complete comparison or independent performance test',
      fieldCompleteness: 'partial', ...detail,
    };
    record.facts = record.facts.filter(fact => fact.value !== undefined && fact.sourceUrl && ['retailer_listing', 'manufacturer_label'].includes(fact.evidenceType));
    const group = groupFor(item, record.name, record.facts, url);
    record.comparisonGroupId = group?.id || null;
    if (group) record.comparisonPurpose = itemGroups(item).length === 1 ? `${group.purpose}; ${purpose(item)}` : `${group.purpose}; 정확한 사용 대상/규격은 출처 필드 참조`;
    if (item.id === 'P104') record.comparisonPurpose = `실내건조 액체 세탁; ${/겸용/.test(record.name) ? '일반/드럼 겸용 표기' : /드럼/.test(record.name) ? '드럼용 표기' : /일반/.test(record.name) ? '일반용 표기' : '세탁기 호환 미확인'}`;
    if (!group) { record.eligibilityStatus = 'pending'; record.reason += '; taxonomy_subpurpose_unconfirmed'; }
    const existing = records.get(id);
    if (existing && existing.modelKey === key && sourceIdentity(existing.url) !== sourceIdentity(url)) {
      const option = { name: record.name, url: record.url, imageUrl: record.imageUrl, checkedAt: record.checkedAt, eligibilityStatus: record.eligibilityStatus, facts: record.facts, sources: record.sources };
      const options = new Map((existing.modelOptions || []).map(value => [value.url, value]));
      options.set(url, option);
      existing.modelOptions = [...options.values()];
      if (existing.eligibilityStatus === 'verified' || record.eligibilityStatus !== 'verified') return;
    } else if (existing?.modelOptions) record.modelOptions = existing.modelOptions;
    for (const [otherId, other] of records) {
      if (otherId !== id && other.itemId === item.id && sourceIdentity(other.url) === sourceIdentity(url)) {
        if (other.eligibilityStatus === 'verified' && record.eligibilityStatus !== 'verified' && !candidate.revalidated) return;
        records.delete(otherId);
      }
    }
    if (existing?.eligibilityStatus === 'verified' && record.eligibilityStatus !== 'verified' && !candidate.revalidated) return;
    records.set(id, record);
  }
  const counts = item => new Set([...records.values()].filter(record => record.itemId === item.id && record.eligibilityStatus === 'verified').map(record => record.modelKey)).size;
  const groupCounts = (item, group) => new Set([...records.values()].filter(record => record.itemId === item.id && record.comparisonGroupId === group.id && record.eligibilityStatus === 'verified').map(record => record.modelKey)).size;
  const needsCandidates = item => itemGroups(item).some(group => groupCounts(item, group) < 6);
  async function checkpoint() {
    const all = [...records.values()].sort((a, b) => a.itemId.localeCompare(b.itemId) || a.id.localeCompare(b.id));
    const queue = items.map(item => {
      const own = all.filter(record => record.itemId === item.id);
      const verified = counts(item);
      const comparisonGroups = itemGroups(item).map(group => ({ id: group.id, purpose: group.purpose, constraints: group.constraints || [], targetDistinctModels: 6,
        verifiedDistinctModels: groupCounts(item, group), missingDistinctModels: Math.max(0, 6 - groupCounts(item, group)), status: 'partial_fields_not_complete_comparison' }));
      return { itemId: item.id, title: item.title, comparisonPurpose: purpose(item), targetDistinctModels: 6, verifiedDistinctModels: verified,
        pendingCandidates: own.filter(record => record.eligibilityStatus === 'pending').length, remainingDistinctModels: Math.max(0, 6 - verified),
        comparisonGroups,
        status: !needsCandidates(item) ? 'six_models_per_group_partial_fields_not_comparison_complete' : 'retained_needs_more_verified_distinct_models',
        referenceSourceUrls: item.products.map(product => product.url) };
    });
    const unresolved = queue.filter(row => row.comparisonGroups.some(group => group.missingDistinctModels > 0)).map(row => ({
      itemId: row.itemId, comparisonPurpose: row.comparisonPurpose, missingDistinctModels: row.remainingDistinctModels,
      missingGroups: row.comparisonGroups.filter(group => group.missingDistinctModels > 0),
      blockers: [...new Set(attempts.filter(a => row.referenceSourceUrls.includes(a.url) && !['ok', 'redirect'].includes(a.status)).map(a => a.status))],
      reason: row.pendingCandidates ? 'pending identity/photo/purchase-purpose/compatibility review; do not count pending as alternatives' : 'no verified alternatives collected; full item retained',
    }));
    const groups = queue.flatMap(row => row.comparisonGroups);
    const summary = { productItems: queue.length, comparisonGroups: groups.length, targetSlots: groups.length * 6, records: all.length,
      verified: all.filter(record => record.eligibilityStatus === 'verified').length, pending: all.filter(record => record.eligibilityStatus === 'pending').length,
      itemsWithSixVerifiedModels: queue.filter(row => row.verifiedDistinctModels >= 6).length,
      groupsWithSixVerifiedModels: groups.filter(group => group.verifiedDistinctModels >= 6).length,
      remainingGroupModelSlots: groups.reduce((sum, group) => sum + group.missingDistinctModels, 0),
      remainingDistinctModelSlots: queue.reduce((sum, row) => sum + row.remainingDistinctModels, 0),
      completeDetailedComparisons: 0, requestsThisRun: requests, blockedHosts: Object.fromEntries(blockedHosts) };
    summary.recordedAccessProblems = [...new Set(attempts.filter(value => ['blocked', 'robots_disallowed', 'robots_unavailable', 'host_stopped_after_block'].includes(value.status)).map(value => `${new URL(value.url).origin}: ${value.status}${value.httpStatus ? ` (HTTP ${value.httpStatus})` : ''}`))];
    await save(output, { generatedAt: now(), collectorVersion: 2, summary, records: all, attempts, unresolved, queue,
      policy: { target: 'reference_plus_five_distinct_models', pendingExcludedFromTarget: true, noPricePerformancePopularityInference: true,
        fieldsArePartial: true, imagesMatchedToSourceNotReuseLicense: true, taxonomyOwnedByMain: true, cachedObservationTimestampsPreserved: true } });
    return summary;
  }
  async function verify(item, seed, kind) {
    const { response, info } = await getHtml(seed.url, kind);
    if (!info) return { response };
    const product = info.products.find(product => identityMatches(seed.name, product) ||
      (new URL(seed.url).hostname.includes('ikea.com') && [product.sku, product.mpn].some(value => value && sourceIdentity(seed.url) === `ikea:${String(value).replaceAll('.', '')}`)) ||
      (new URL(seed.url).hostname === 'prod.danawa.com' && product.sku && sourceIdentity(seed.url) === `prod.danawa.com:pcode:${product.sku}`));
    const titleMatch = info.headings.some(title => norm(title) === norm(seed.name) || norm(title).includes(norm(seed.name)));
    const exactImage = product ? imageValues(product.image).map(value => safeUrl(value, response.url)).find(Boolean) : titleMatch ? safeUrl(info.ogImage, response.url) : null;
    const name = product?.name || info.headings.find(title => norm(title).includes(norm(seed.name))) || seed.name;
    const samePurpose = purposeMatch(item, `${name} ${product?.category || ''} ${product?.description || ''}`) ||
      (product?.detailEvidence && purposeMatch(item, seed.name) && norm(seed.name).includes(norm(name)));
    const evidenceType = /ikea\.com|philips|lionkorea|samsung|lge\.co\.kr|shinil|oxyclean|brita/.test(new URL(seed.url).hostname) ? 'manufacturer_label' : 'retailer_listing';
    const facts = info.facts.map(fact => ({ ...fact, sourceUrl: response.url, evidenceType }));
    if (product && new URL(seed.url).hostname.includes('ikea.com') && !facts.some(fact => fact.key === 'capacity')) {
      const labelled = product.name.match(/\b(\d+(?:\.\d+)?)\s+(l|cl|ml)\s*$/i);
      if (labelled) facts.push({ key: 'capacity', label: '공식 상품명 용량 표기', value: Number(labelled[1]), unit: { l: 'L', cl: 'cL', ml: 'mL' }[labelled[2].toLowerCase()],
        sourceUrl: response.url, evidenceType, scope: 'verified_exact_product_title_capacity_not_inferred_dimensions' });
    }
    for (const [key, value] of Object.entries({ model: product?.mpn || product?.sku, brand: product?.brand, type: product?.category })) {
      if (value) facts.push({ key, label: labels[key] || key, value, sourceUrl: response.url, evidenceType, scope: 'exact_product_structured_metadata' });
    }
    if (product?.description) facts.push({ key: 'claims', label: '상품 설명 원문(독립 시험 아님)', value: product.description, sourceUrl: response.url, evidenceType, scope: 'source_product_description' });
    if (product?.detailEvidence) {
      for (const value of name.match(/\d+(?:\.\d+)?\s*(?:mL|ml|kg|g|L)(?![A-Za-z])/g) || []) {
        facts.push({ key: /kg|g/.test(value) ? 'amount' : 'capacity', label: '상세 페이지 상품명 표시량(옵션 범위)', value, sourceUrl: response.url, evidenceType, scope: 'exact_detail_product_title_option_quantity' });
      }
      for (const value of name.match(/드럼용|드럼전용|일반용|중성|울드라이|리필/g) || []) {
        facts.push({ key: /드럼|일반용/.test(value) ? 'compatibility' : /중성|울드라이/.test(value) ? 'use' : 'contents', label: '상세 페이지 상품명 사용/형태 표기', value, sourceUrl: response.url, evidenceType, scope: 'exact_detail_title_label_not_efficacy_test' });
      }
    }
    if (new URL(seed.url).hostname === 'prod.danawa.com' && product?.description) {
      const parts = product.description.split(' / ').map(value => value.trim()).filter(Boolean);
      for (const [position, value] of parts.entries()) {
        const key = position === 0 ? 'type' : /호환|적용\s*모델|대응\s*모델/.test(value) ? 'compatibility' : /크기|가로|깊이|높이/.test(value) ? 'dimensions' : /소비전력|정격전력/.test(value) ? 'power' : /용량/.test(value) ? 'capacity' : /무게|중량/.test(value) ? 'weight' : 'functions';
        facts.push({ key, label: position === 0 ? '제품 유형(다나와 등록 규격)' : '다나와 등록 규격 원문', value, sourceUrl: response.url, evidenceType: 'retailer_listing', scope: 'public_aggregator_product_specs_not_independent_test' });
      }
    }
    for (const fact of [product?.additionalProperty].flat().filter(Boolean)) {
      if (!/가격|price|rank|rating/i.test(fact.name || '')) facts.push({ key: aliases[fact.propertyID] || 'specification', label: fact.name || fact.propertyID || '규격 원문', value: fact.value, ...(fact.unitText ? { unit: fact.unitText } : {}), sourceUrl: response.url, evidenceType, scope: 'source_additional_property' });
    }
    const previousEntry = index.records.find(entry => entry.rowId === item.id && sourceIdentity(entry.sourceUrl) === sourceIdentity(seed.url));
    const confirmed = oldFacts(previousEntry);
    for (const fact of facts) fact.checkedAt = response.checkedAt;
    for (const fact of confirmed) { fact.checkedAt = index.retrievedOn; fact.observationPrecision = 'date_only'; }
    const hasSpecs = [...facts, ...confirmed].some(fact => !['model', 'brand', 'claims'].includes(fact.key));
    const correctPrimaryType = item.id !== 'P173' || new URL(seed.url).hostname !== 'prod.danawa.com' || /서큘레이터|선풍기/.test(product?.description?.split(' / ')[0] || '');
    const verified = Boolean(product && exactImage && samePurpose && correctPrimaryType && purposeGuard(item, name) && hasSpecs && !/택1|색상 옵션|옵션 선택/.test(name));
    put(item, { name, url: response.url, imageUrl: exactImage || seed.imageUrl, identifiers: product, revalidated: true,
      sourceLabel: seed.sourceLabel, checkedAt: response.checkedAt, facts: [...facts, ...confirmed], verified,
      reason: verified ? 'exact_detail_identity_photo_and_same_purchase_purpose_confirmed; full_specs_partial; image_reuse_rights_unreviewed' : 'partial_fields; exact detail identity/photo or same-purpose mandatory constraints require review',
      sources: [{ url: response.url, title: info.title, checkedAt: response.checkedAt }, ...(previousEntry ? [{ url: previousEntry.sourceUrl, title: previousEntry.name, checkedAt: `${index.retrievedOn}T00:00:00Z`, observationPrecision: 'date_only', reusedConfirmedFields: true }] : [])] },
    { identityVerification: product ? product.detailEvidence || 'matched_product_structured_metadata' : titleMatch ? 'matched_page_heading' : 'not_confirmed', imageVerification: exactImage ? 'matched_exact_detail_metadata' : 'unconfirmed',
      purposeVerification: samePurpose ? 'purchase_type_and_scoped_size_filter' : 'manual_compatibility_review_required' });
    return { response, info };
  }
  try {
    // Reuse confirmed local evidence without pretending it was observed today.
    for (const item of items) for (const product of item.products) {
      const recovered = recovery[product.id];
      const entry = index.records.find(entry => entry.rowId === item.id && sourceIdentity(entry.sourceUrl) === sourceIdentity(product.url));
      const matching = recovered?.inspection?.products?.find(value => identityMatches(product.name, value));
      const verified = Boolean(recovered?.status === 'resolved' && recovered.imageScope === 'product' && recovered.matchEvidence && entry?.usableCandidate && purposeMatch(item, product.name) && !/택1|옵션/.test(product.name));
      put(item, { ...product, imageUrl: recovered?.imageUrl || product.imageUrl, checkedAt: recovered?.checkedAt || `${index.retrievedOn}T00:00:00Z`,
        identifiers: matching, name: matching?.name || product.name, facts: oldFacts(entry), verified,
        reason: verified ? 'reused_confirmed_detail_and_exact_photo; source_fields_partial; not_live_price_or_full_comparison' : 'reused_reference_pending_exact_model_photo_or_same_purpose_constraints; previous_catalog_image_is_not_comparison_verification',
        sources: [{ url: recovered?.sourceUrl || product.url, title: recovered?.productName || product.name, checkedAt: recovered?.checkedAt || `${index.retrievedOn}T00:00:00Z`, reusedConfirmedFields: Boolean(entry), observationPrecision: recovered?.checkedAt ? 'timestamp' : 'date_only' }] },
      { catalogProductId: product.id, imageVerification: recovered?.matchEvidence || 'unconfirmed', purposeVerification: verified ? 'scoped_reference_purpose' : 'manual_review_required' });
    }
    await checkpoint();
    if (process.argv.includes('--replay-cached') || process.argv.includes('--replay-pending')) {
      for (const candidate of [...records.values()]) {
        if (process.argv.includes('--replay-pending') && candidate.eligibilityStatus==='verified' && !['P096','P164','P166'].includes(candidate.itemId)) continue;
        const cached = await json(resolve(cacheDir, `${hash(candidate.url)}.json`), null);
        if (cached?.status !== 'ok' || !cached.contentType?.includes('html')) continue;
        const item = items.find(item => item.id === candidate.itemId);
        await verify(item, candidate, 'reparse_cached_detail');
      }
      await checkpoint();
    }
    const categories = new Map();
    for (const item of selected) {
      for (const seed of item.products) {
        const result = await verify(item, seed, 'reference_detail');
        if (result.info && filters[item.id] && new URL(seed.url).hostname.includes('ikea.com')) {
          const candidates = result.info.links.filter(link => link.url.includes('/kr/ko/cat/') && categoryMatches(item, link.title) && link.title.length < 100);
          for (const candidate of candidates.slice(0, 3)) {
            if (!categories.has(candidate.url)) categories.set(candidate.url, new Set());
            categories.get(candidate.url).add(item.id);
          }
          for (const candidate of result.info.links.filter(link => link.url.includes('/kr/ko/p/') && purposeMatch(item, link.alt || link.title)).slice(0, 14)) {
            if (!needsCandidates(item)) break;
            const name = candidate.alt || candidate.title;
            const key = modelKey(name, candidate.url);
            if ([...records.values()].some(record => record.itemId === item.id && record.modelKey === key && record.eligibilityStatus === 'verified')) continue;
            await verify(item, { name, url: candidate.url, imageUrl: candidate.image, sourceLabel: 'IKEA 한국 공식' }, 'related_product_detail');
          }
        }
        if (result.info && filters[item.id] && !new URL(seed.url).hostname.includes('ikea.com')) {
          const host = new URL(seed.url).hostname;
          const candidates = result.info.links.filter(link => safeUrl(link.url) && new URL(link.url).hostname === host &&
            /\/cat\/|\/c-m-\w+\/|\/product\/list\/|\/list\/|itemList\.do|\/all-/.test(link.url) &&
            categoryMatches(item, link.title) && link.title.length < 100 && !/search|검색/.test(link.url));
          for (const candidate of [...new Map(candidates.map(candidate => [candidate.url, candidate])).values()].slice(0, 3)) {
            if (!categories.has(candidate.url)) categories.set(candidate.url, new Set());
            categories.get(candidate.url).add(item.id);
          }
          const related = result.info.links.filter(link => safeUrl(link.url) && new URL(link.url).hostname === host &&
            /\/c-p\/|itemView\.do|\/product\/detail\/|\/info\/\?pcode=/.test(link.url) && purposeMatch(item, link.alt || link.title));
          for (const candidate of related.slice(0, 18)) {
            if (!needsCandidates(item) || requests >= limit) break;
            if ([...records.values()].some(record => record.itemId === item.id && sourceIdentity(record.url) === sourceIdentity(candidate.url))) continue;
            await verify(item, { name: candidate.alt || candidate.title, url: candidate.url, imageUrl: candidate.image, sourceLabel: host }, 'manufacturer_related_detail');
          }
        }
      }
      await checkpoint();
      console.log(JSON.stringify({ itemId: item.id, stage: 'reference', verifiedDistinctModels: counts(item), requests }));
      if (requests >= limit && !process.argv.includes('--offline')) break;
    }
    if (process.argv.includes('--search-alternatives') && !process.argv.includes('--offline')) {
      for (const item of selected) for (const group of itemGroups(item)) {
        if (requests >= limit) break;
        if (groupCounts(item, group) >= 6) continue;
        const query = `${searchTerms[group.id] || group.label || item.title} ${arg('query-suffix', '')}`.trim();
        const url = 'https://search.danawa.com/dsearch.php?' + new URLSearchParams({ query });
        const { info } = await getHtml(url, 'purpose_search_discovery');
        if (!info) continue;
        const candidates = new Map();
        for (const link of info.links) {
          if (!/https:\/\/prod\.danawa\.com\/info\//.test(link.url)) continue;
          const name = link.alt || link.title;
          const discoveryFacts=link.typeText ? [{key:'type',value:link.typeText}] : [];
          if (!purposeMatch(item, name+' '+(link.typeText || '')) || groupFor(item, name, discoveryFacts, link.url)?.id !== group.id) continue;
          const code = new URL(link.url).searchParams.get('pcode');
          if (!code || !/^\d+$/.test(code)) continue;
          const detailUrl = 'https://prod.danawa.com/info/?pcode=' + code;
          if (!candidates.has(detailUrl)) candidates.set(detailUrl, { name, url: detailUrl, imageUrl: link.image, sourceLabel: '다나와' });
        }
        const distinct = new Map(), options = [];
        for (const candidate of candidates.values()) {
          const key = modelKey(candidate.name, candidate.url);
          if (distinct.has(key)) options.push(candidate);
          else distinct.set(key, candidate);
        }
        let inspected = 0;
        // Inspect different named models before repeated package options.
        for (const candidate of [...distinct.values(), ...options]) {
          if (groupCounts(item, group) >= 6 || requests >= limit || inspected >= numericArg('limit-detail', 8)) break;
          const exists = [...records.values()].some(record => record.itemId === item.id && sourceIdentity(record.url) === sourceIdentity(candidate.url) && record.eligibilityStatus === 'verified');
          if (exists) continue;
          await verify(item, candidate, 'purpose_search_exact_detail');
          inspected++;
        }
        await checkpoint();
        console.log(JSON.stringify({ itemId: item.id, groupId: group.id, stage: 'purpose_search', discovered: candidates.size, inspected, verified: groupCounts(item, group), requests }));
      }
    }
    for (const [url, itemIds] of categories) {
      if (requests >= limit && !process.argv.includes('--offline')) break;
      const { info, response } = await getHtml(url, 'category_list');
      if (!info) continue;
      for (const itemId of itemIds) {
        const item = items.find(item => item.id === itemId);
        const candidateLinks = info.links.filter(link => safeUrl(link.url) && new URL(link.url).hostname === new URL(url).hostname &&
          /\/kr\/ko\/p\/|\/c-p\/|itemView\.do|\/product\/detail\/|\/info\/\?pcode=/.test(link.url) &&
          (purposeMatch(item, link.alt || link.title) || (new URL(url).hostname === 'prod.danawa.com' && Boolean(link.title))));
        const bySource = new Map();
        for (const link of candidateLinks) {
          const previous = bySource.get(sourceIdentity(link.url));
          const score = value => /[A-Za-z가-힣]{2}/.test(value.alt || value.title) && !/^[\d,.\s]+원$/.test(value.title) ? 1 : 0;
          if (!previous || score(link) > score(previous)) bySource.set(sourceIdentity(link.url), link);
        }
        const distinctLinks = [...bySource.values()];
        for (const candidate of distinctLinks.slice(0, 36)) {
          if (!needsCandidates(item) || requests >= limit) break;
          const name = candidate.alt || candidate.title;
          const group = groupFor(item, name, [], candidate.url);
          if (group && groupCounts(item, group) >= 6) continue;
          const key = modelKey(name, candidate.url);
          if ([...records.values()].some(record => record.itemId === itemId && record.modelKey === key)) continue;
          await verify(item, { name, url: candidate.url, imageUrl: candidate.image, sourceLabel: new URL(url).hostname, checkedAt: response.checkedAt }, 'category_product_detail');
        }
      }
      await checkpoint();
    }
    // Official search API permission is independent of Data Lab credentials.
    if (!process.argv.includes('--no-naver') && !process.argv.includes('--offline')) {
      let env = '';
      try { env = await readFile(resolve(root, '.env'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const readEnv = key => process.env[key] || env.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'))?.[1]?.trim();
      const clientId = readEnv('NAVER_CLIENT_ID'), secret = readEnv('NAVER_CLIENT_SECRET');
      if (clientId && secret) {
        for (const item of selected.filter(item => counts(item) < 6)) {
          const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(item.title)}&display=30&start=1&sort=sim&exclude=used:rental:cbshop`;
          const response = await request(url, 'official_shop_search_discovery', { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': secret }, false);
          if (response.status !== 'ok') break;
          let data;
          try { data = JSON.parse(response.body); } catch { attempt(url, 'official_shop_search_discovery', 'invalid_json'); break; }
          for (const hit of (data.items || []).slice(0, 18)) {
            const name = (await htmlParser.parse(`<title>${hit.title}</title>`, url)).title;
            if (!safeUrl(hit.link)) continue;
            put(item, { name, url: hit.link, imageUrl: hit.image, sourceLabel: `네이버 쇼핑 API 발견: ${hit.mallName || '미표기'}`, checkedAt: response.checkedAt,
              modelKey: `discovery:${hash(norm(name.replace(/\d+(?:\.\d+)?\s*(?:ml|kg|g|L|개|입|팩|매)/gi, '').replace(/화이트|블랙|핑크|그레이/g, '')))}`,
              verified: false, facts: [], reason: 'discovery_only; retailer_detail_identity_photo_model_dedup_and_same_purpose_unverified; search_price_not_imported',
              sources: [{ url, title: '네이버 공식 쇼핑 검색 API (발견용, 상품 검증 아님)', checkedAt: response.checkedAt }] });
          }
          await checkpoint();
        }
      } else attempt('https://openapi.naver.com/v1/search/shop.json', 'official_shop_search_discovery', 'credentials_missing');
    }
    console.log(JSON.stringify(await checkpoint(), null, 2));
  } finally {
    await checkpoint();
    await htmlParser.close();
  }
}

export async function selfTest() {
  const rules = robotsPolicy('User-agent: *\nDisallow: */search/?q=*\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 2');
  assert(!rules.allows('https://www.ikea.com/kr/ko/search/?q=pot'));
  assert(rules.allows('https://www.ikea.com/kr/ko/cat/pots-20634/'));
  assert(!rules.allows('https://a.test/private/file'));
  assert(rules.allows('https://a.test/private/public/file'));
  assert.equal(rules.delay, 2);
  assert(robotsPolicy('User-agent: *\nDisallow: /\nUser-agent: JachiComparisonCollector\nAllow: /').allows('https://a.test/item'));
  assert.equal(modelKey('OFTAST 오프타스트 그릇, 화이트, 15 cm', 'https://www.ikea.com/kr/ko/p/oftast-bowl-white-12345678/'), modelKey('OFTAST 오프타스트 그릇, 그레이, 19 cm', 'https://www.ikea.com/kr/ko/p/oftast-bowl-grey-23456789/'));
  assert.equal(modelKey('신일 SIF-TW24W (1개)', 'https://a.test/item/1'), modelKey('신일 SIF-TW24W (3개)', 'https://b.test/item/2'));
  assert(!purposeMatch({ id: 'P051' }, 'LÄMPLIG 렘플리그 냄비받침, 스테인리스'));
  assert(!purposeMatch({ id: 'P114' }, 'VARIERA 바리에라 식기건조대 - 화이트 42x30 cm'));
  assert(!purposeMatch({ id: 'P114' }, 'LILLHAVET 다용도 식기건조대'));
  for (const [a, b] of [
    ['vagsjoen-hand-towel-orange-red-30609204', 'vagsjoen-hand-towel-bright-blue-40576260'],
    ['slanhoestmal-hand-towel-black-light-beige-striped-70576032', 'slanhoestmal-hand-towel-bright-blue-light-blue-striped-00576040'],
    ['faergrik-mug-stoneware-white-70192736', 'faergrik-mug-dark-turquoise-60330564'],
    ['rinnig-tea-towel-multicolour-patterned-20609983', 'rinnig-tea-towel-white-dark-grey-patterned-80476348'],
    ['alstern-bath-mat-white-90439322', 'alstern-bath-mat-bright-blue-70579988'],
  ]) assert.equal(modelKey('', `https://www.ikea.com/kr/ko/p/${a}/`), modelKey('', `https://www.ikea.com/kr/ko/p/${b}/`));
  assert(purposeMatch({ id: 'P145' }, 'VESTERÖY 포켓스프링매트리스, 160x200 cm'));
  assert(purposeMatch({ id: 'P145' }, 'VESTERÖY 포켓스프링매트리스, 90x200 cm'));
  assert(purposeMatch({ id: 'P191' }, 'LADDA 충전지 AAA 1.2V'));
  assert(purposeMatch({ id: 'P191' }, '알카라인 일회용 AA'));
  assert(purposeMatch({ id: 'P191' }, 'LADDA 충전지 HR06 AA 1.2V'));
  assert(!purposeMatch({ id: 'P063' }, 'OFTAST 샐러드그릇'));
  assert.equal(safeUrl('http://127.0.0.1/secret'), null);
  const p = await parser();
  try {
    const info = await p.parse('<html><head><script>throw Error("must not run")</script><script type="application/ld+json">{"@type":"Product","name":"Exact Model","sku":"M1","image":"https://example.test/M1.jpg"}</script></head><body><h1>Exact Model</h1><table><tr><th>소비전력</th><td>50 W</td></tr><tr><th>최저가</th><td>1원</td></tr></table></body></html>', 'https://example.test/item');
    assert.equal(info.products[0].sku, 'M1');
    assert.equal(info.facts[0].key, 'power');
    assert.equal(info.facts.length, 1);
    const discovered=await p.parse('<ul><li class="prod_item"><div class="spec_list">IH압력밥솥 / 6인용</div><a href="https://prod.danawa.com/info/?pcode=123"><img alt="MODEL-A1" src="https://example.test/a.jpg"></a></li></ul>','https://search.danawa.com/');
    assert.equal(discovered.links[0].typeText,'IH압력밥솥 / 6인용');
    const labelled = await p.parse('<head><meta property="og:description" content="테크 울드라이 중성 세탁세제 오리지널 용기 2.5L"><meta property="og:image" content="https://images.example.test/exact.jpg"></head>', 'https://www.lgcaremall.com/product/detail/S10000998');
    assert.equal(labelled.products[0].name, '테크 울드라이 중성 세탁세제 오리지널 용기 2.5L');
    assert.equal(labelled.products[0].detailEvidence, 'exact_detail_og_product_name_and_photo');
  } finally { await p.close(); }
  console.log('household collector self-test passed');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-test')) await selfTest();
  else await collect();
}
