import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'data/exports/comparison-planning-2026-10-11');
const output = resolve(dir, 'collected-food.json');
const cacheFile = resolve(dir, 'food-cache.json');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const now = () => new Date().toISOString();
const sleep = ms => new Promise(done => setTimeout(done, ms));
const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalized = value => tidy(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const args = new Map(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const target = 6;
const candidateTarget = Number(args.get('candidate-target') || target);
assert(Number.isInteger(candidateTarget) && candidateTarget >= target && candidateTarget <= 12, 'Invalid candidate target');

// Purpose labels are collection boundaries, not the main application's taxonomy.
// The regexes validate observed names, never synthesize product properties.
const definitions = {
  P001: [['백미 즉석밥', '백미 즉석밥', '백미|흰밥|쌀밥', '잡곡|현미|곤약|흑미|귀리|보리|볶음'], ['잡곡 즉석밥', '잡곡밥 즉석밥', '잡곡|흑미|현미|귀리|보리', '볶음|죽|곤약']],
  P002: [['취사용 백미', '백미 쌀', '쌀|백미', '즉석|햇반|오뚜기밥|밥 |현미|잡곡|찹쌀|가루'], ['취사용 현미', '현미 쌀', '현미', '즉석|햇반|오뚜기밥|밥 |가루|쌀눈']],
  P003: [['취사용 혼합곡', '혼합 잡곡', '혼합|혼식|[0-9]+곡', '햇반|즉석|미숫|가루'], ['취사용 콩', '서리태 콩', '서리태|검정콩|검은콩', '두유|분말|가루|볶음|선식|스낵|햇반|콩조림']],
  P004: [['오트밀', '압착 오트밀', '오트밀|롤드오트|귀리', '시리얼|그래놀라|쿠키|음료|가루|분말']],
  P005: [['플레이크 시리얼', '콘 플레이크 시리얼', '플레이크|후레이크|푸레이크', '그래놀라'], ['그래놀라 시리얼', '그래놀라', '그래놀라|그라놀라', '바 |프로틴바']],
  P006: [['식빵', '식빵', '식빵', '믹스|생지|가루'], ['베이글', '베이글', '베이글', '믹스|생지|가루|칩|스낵']],
  P007: [['국물 봉지라면', '봉지 라면', '라면|탕면|안성탕면|진라면|신라면|너구리|삼양라면', '컵|사발|비빔|볶음|불닭|짜장|짜파|팔도짜장|숙면|사리'], ['비빔 봉지라면', '비빔면 봉지', '비빔', '컵|사발|냉동|쫄면']],
  P008: [['국물 컵라면', '컵라면', '컵|사발|왕뚜껑|육개장|도시락', '비빔|볶음|불닭|짜장|짜파|툼바'], ['비국물 컵라면', '볶음 컵라면', '컵|사발|용기|짜파게티범벅', '봉지']],
  P009: [['파스타면', '스파게티 파스타 면', '스파게티|파스타|스파게띠|스파게토니', '소스|냉동|밀키트|컵|라면'], ['소면', '소면', '소면', '쌀국수|소스|오징어|이카소멘|밀키트'], ['우동면', '우동면', '우동', '소스|라면|컵|밀키트|가쓰오|가스오|크림|김우동|돈코츠']],
  P010: [['냉동 볶음밥', '냉동 볶음밥', '볶음밥', '소스|양념|라면']],
  P011: [['교자만두', '교자 만두', '교자', '물만두'], ['물만두', '물만두', '물만두', '교자']],
  P012: [['포장 곰탕', '사골 곰탕', '곰탕', '육수|농축|분말'], ['포장 육개장', '육개장 국', '육개장', '라면|사발|컵|밀키트'], ['포장 김치찌개', '김치찌개', '김치찌개', '라면|밀키트|양념|소스']],
  P013: [['상온 즉석죽', '즉석 죽', '죽', '이유식|분말|가루|죽염|죽순']],
  P014: [['바로 데우는 카레 소스', '레토르트 카레', '카레|커리', '분말|가루|고형|루 |우동|라면'], ['바로 데우는 짜장 소스', '3분 짜장', '짜장', '라면|면 |분말|가루'], ['조리용 카레 분말', '카레 분말', '카레|커리', '3분|레토르트|즉석|고형']],
  P015: [['국물 전골 밀키트', '전골 밀키트', '전골|샤브|나베', '냄비|육수|소스|용기']],
  P016: [['냉동 치킨너겟', '치킨 너겟', '너겟|너깃', '소스|텐더'], ['냉동 치킨텐더', '치킨 텐더', '텐더', '소스|너겟'], ['냉동 돈가스', '냉동 돈까스', '돈까스|돈가스', '소스|김밥'], ['냉동 피자', '냉동 피자', '피자', '도우|치즈 |소스|피자맛|만두|버거']],
  P017: [['배추김치', '배추 김치', '배추김치|포기김치|썰은김치|썰은배추', '볶음|찌개|볶음밥'], ['깍두기', '깍두기', '깍두기', '볶음밥|단무지']],
  P018: [['볶음김치 반찬', '볶음 김치', '볶음김치|김치볶음', '볶음밥|주먹밥'], ['조림 반찬', '장조림 반찬', '조림', '양념|소스|밀키트'], ['무침 반찬', '무침 반찬', '무침', '양념|소스|밀키트'], ['절임 반찬', '장아찌 반찬', '장아찌|절임', '양념|소스']],
  P019: [['조미 도시락김', '도시락 김', '도시락|식탁김', '김자반|김밥|전장|무조미']],
  P020: [['김자반', '김자반', '김자반|돌자반|자반', '고등어'], ['조미 김가루', '김가루', '김가루', '후리가케']],
  P021: [['일반 살코기 참치캔', '살코기 참치', '참치', '고추|야채|마요|콘참치|동물|사료|스테이크|김밥|회 |불닭|컵밥|덮밥|죽|소스'], ['고추 참치캔', '고추 참치', '고추참치|고추 참치', '김밥|주먹밥|컵밥|덮밥|죽|소스']],
  P022: [['햄 통조림', '햄 통조림', '스팸|리챔|런천|햄|뚝심', '김밥|볶음|핫도그']],
  P023: [['스위트콘 통조림', '스위트콘 통조림', '스위트콘|옥수수', '분말|과자|가루|차 |팝콘|콘버터|냉동|찰옥수수|찐옥수수'], ['조리용 콩 통조림', '콩 통조림', '콩|빈|병아리|렌틸', '두유|소스|스프']],
  P024: [['조리용 생계란', '신선 계란', '계란|유정란|달걀|신선란', '구운|훈제|반숙|삶은|온천'], ['구운 계란', '구운 계란', '구운|훈제', '계란찜|달걀찜']],
  P025: [['부침·찌개 두부', '부침 찌개 두부', '두부', '순두부|연두부|건두부|포두부|면|스낵'], ['순두부', '순두부', '순두부', '찌개 |양념|소스']],
  P026: [['조리용 생닭가슴살', '생 닭가슴살', '닭가슴살|닭 가슴살', '훈제|스팀|소스|큐브|소시지|스테이크|수비드|양념|볶음'], ['조리완료 닭가슴살', '스팀 닭가슴살', '닭가슴살|닭 가슴살', '생닭|생육|큐브|소시지|스테이크']],
  P027: [['볶음탕용 생닭', '볶음탕용 닭', '볶음탕|닭볶음', '밀키트|양념|소스|완제품'], ['닭다리 생육', '닭다리 생육', '닭다리|북채', '훈제|양념|너겟|완제품|매콤|바베큐']],
  P028: [['돼지고기 안심 생육', '돼지고기 안심', '안심', '소고기|한우|닭|돈까스|돈가스|햄|스테이크 |양념'], ['소고기 국거리 생육', '소고기 국거리', '국거리', '돼지|육수|양념|밀키트']],
  P029: [['손질 동태', '손질 동태', '동태', '탕 |전골|밀키트|양념|냄비'], ['냉동 새우살', '냉동 새우살', '새우살|칵테일새우|깐새우', '튀김|완자|볶음|만두|소스'], ['손질 냉동 오징어', '손질 오징어 냉동', '오징어', '튀김|볶음|젓갈|양념|건오징어|마른|버터|구이|채']],
  P030: [['생양파', '양파', '양파', '즙|가루|분말|건조|볶음|장아찌|손질'], ['생대파', '대파', '대파', '냉동|분말|가루|소스'], ['깐마늘', '깐마늘', '깐마늘', '다진|장아찌|냉동']],
  P031: [['생양배추', '양배추', '양배추', '즙|환 |분말|가루|샐러드|김치|채 '], ['씻어 먹는 로메인', '로메인', '로메인', '씨앗|종자|모종']],
  P032: [['콩나물', '콩나물', '콩나물', '밥 |국 |가루|재배|기르'], ['표고버섯', '표고버섯', '표고', '가루|분말|건조|건표고|말린|씨앗|종자|재배|표고칩']],
  P033: [['냉동 혼합 채소', '냉동 혼합 야채', '혼합|믹스|믹스트|찌개용', '볶음밥|만두|볶음 |피클'], ['냉동 브로콜리', '냉동 브로콜리', '브로콜리', '분말|가루|씨앗']],
  P034: [['생바나나', '바나나', '바나나', '우유|칩|칩스|퓨레|가루|분말|빵|음료|젤리|쿠키|냉동'], ['생사과', '사과', '사과', '즙|주스|쥬스|칩|퓨레|가루|분말|식초|말랭|젤리|잼'], ['생키위 (그 외 생과일)', '키위', '키위', '즙|주스|쥬스|칩|퓨레|가루|분말|젤리|잼|건조|냉동']],
  P035: [['냉동 블루베리', '냉동 블루베리', '블루베리', '잼|가루|분말|퓨레|아이스|주스|쥬스|음료'], ['냉동 망고', '냉동 망고', '망고', '퓨레|잼|가루|분말|젤리|아이스|주스|쥬스|음료|빙과|망고바|소르베']],
  P036: [['카놀라 식용유', '카놀라유', '카놀라', '스프레이'], ['엑스트라버진 올리브유', '엑스트라버진 올리브유', '엑스트라|엑스트라버진|extra virgin', '스프레이|퓨어']],
  P037: [['참기름', '참기름', '참기름', '들기름|맛기름|향미유'], ['들기름', '들기름', '들기름', '참기름|맛기름|향미유']],
  P038: [['진간장', '진간장', '진간장', '국간장'], ['국간장', '국간장', '국간장|조선간장', '진간장']],
  P039: [['고추장', '고추장', '고추장', '볶음|초고추장|양념|불고기|찌개'], ['된장', '된장', '된장', '양념|찌개|쌈장']],
  P040: [['조리용 소금', '꽃소금', '꽃소금|천일염', '치약|세제|입욕|후추'], ['흰설탕', '하얀설탕', '하얀설탕|백설탕|흰설탕', '가루|스테비아|슈가파우더'], ['흑후추', '흑후추', '후추', '소금|소스']],
  P041: [['굴소스', '굴소스', '굴소스|굴 소스', '볶음밥'], ['토마토 케첩', '토마토 케찹', '케찹|케첩', '마요|머스타드'], ['마요네즈', '마요네즈', '마요네즈', '케찹|케첩|머스타드']],
  P042: [['해물·멸치 코인육수', '코인 육수', '코인|육수링|한알|육수한알', '사골|치킨'], ['치킨 스톡', '치킨 스톡', '치킨', '육개장|곰탕']],
  P043: [['먹는 샘물', '생수', '삼다수|아이시스|백산수|스파클|샘물|생수|석수|크리스탈|몽베스트', '탄산|정수기|보리|토닉']],
  P044: [['흰우유', '흰우유', '우유', '두유|바나나|딸기|초코|커피|분유|요거트|아이스|오트|가루'], ['두유', '무첨가 두유', '두유', '초코|가루|분말']],
  P045: [['일반 플레인 요거트', '플레인 요거트', '플레인', '그릭|분말|젤리|음료|드링크'], ['플레인 그릭요거트', '플레인 그릭요거트', '그릭', '딸기|블루베리|초코|바닐라|분말']],
  P046: [['인스턴트 블랙커피', '블랙 인스턴트 커피', '커피|카누|수프리모|아메리카노', '믹스|원두|캡슐|드립백|머신|음료'], ['드립백 커피', '드립백 커피', '드립백', '필터|거치대'], ['추출용 원두', '원두 커피', '원두|커피', '드립백|캡슐|인스턴트|믹스|머신|음료|티백'], ['네스프레소 오리지널 호환 캡슐', '네스프레소 오리지널 캡슐', '캡슐', '머신|버츄오|돌체|일리']],
  P047: [['끓이거나 우려 먹는 보리차 티백', '보리차 티백', '보리차', '음료|페트|병 |캔 '], ['녹차 티백', '녹차 티백', '녹차', '음료|가루|분말|페트|캡슐']],
  P048: [['혼합 견과 소포장', '하루 견과', '견과|하루', '바 |시리얼|버터|강정'], ['건포도', '건포도', '건포도', '빵|씨앗|쿠키']],
  P049: [['감자 과자', '감자칩 과자', '감자|포카칩|포테토|칩', '냉동|튀김|감자전|매쉬|가루|김치']],
  P050: [['바로 마시는 단백질 음료', '단백질 음료', '단백질|프로틴|더단백|하이뮨|셀렉스', '분말|파우더|스틱|바 |웨이|보충제'], ['물에 타는 단백질 분말', '단백질 분말', '단백질|프로틴|웨이|하이뮨|셀렉스', '드링크|음료|바 |젤리']],
};
const purposes = Object.fromEntries(Object.entries(definitions).map(([id, rows]) => [id, rows.map(([label, query, include, exclude]) => ({ label, query, include, exclude }))]));
const recommendationTerms = {
  P001: ['백미밥','잡곡밥'], P002: ['백미','현미'], P003: ['잡곡','서리태'], P004: ['오트밀'],
  P005: ['시리얼','그래놀라'], P006: ['식빵','베이글'], P007: ['라면','비빔면'], P008: ['컵라면','볶음면'],
  P009: ['파스타','소면','우동면'], P010: ['볶음밥'], P011: ['왕교자','물만두'], P012: ['곰탕','육개장','김치찌개'],
  P013: ['죽'], P014: ['카레','짜장','카레가루'], P015: ['전골'], P016: ['치킨너겟','치킨텐더','돈까스','피자'],
  P017: ['배추김치','깍두기'], P018: ['볶음김치','장조림','무침','장아찌'], P019: ['도시락김'], P020: ['김자반','김가루'],
  P021: ['참치','고추참치'], P022: ['스팸'], P023: ['스위트콘','콩통조림'], P024: ['계란','구운계란'],
  P025: ['두부','순두부'], P026: ['닭가슴살','스팀닭가슴살'], P027: ['닭볶음탕','닭다리'], P028: ['돼지고기안심','소고기국거리'],
  P029: ['동태','새우살','오징어'], P030: ['양파','대파','깐마늘'], P031: ['양배추','로메인'], P032: ['콩나물','표고버섯'],
  P033: ['냉동채소','브로콜리'], P034: ['바나나','사과','키위'], P035: ['냉동블루베리','냉동망고'],
  P036: ['카놀라유','올리브유'], P037: ['참기름','들기름'], P038: ['진간장','국간장'], P039: ['고추장','된장'],
  P040: ['소금','설탕','후추'], P041: ['굴소스','케첩','마요네즈'], P042: ['코인육수','치킨스톡'], P043: ['생수'],
  P044: ['우유','두유'], P045: ['플레인요거트','그릭요거트'], P046: ['블랙커피','드립백','원두','커피캡슐'],
  P047: ['보리차','녹차'], P048: ['견과류','건포도'], P049: ['감자칩'], P050: ['단백질음료','단백질분말'],
};
const alternateTermAliases = {
  백미밥: '햇반', 잡곡밥: '햇반', 백미: '쌀', 현미: '쌀', 잡곡: '쌀', 서리태: '쌀', 시리얼: '그래놀라',
  컵라면: '라면', 비빔면: '라면', 볶음면: '라면', 왕교자: '만두', 물만두: '만두', 전골: '밀키트',
  배추김치: '김치', 깍두기: '김치', 볶음김치: '반찬', 장조림: '반찬', 무침: '반찬', 장아찌: '반찬',
  도시락김: '김', 김자반: '김', 김가루: '김', 고추참치: '참치', 스팸: '햄', 계란: '달걀',
  깐마늘: '마늘', 로메인: '샐러드', 표고버섯: '버섯', 냉동블루베리: '블루베리',
  플레인요거트: '요거트', 블랙커피: '커피', 드립백: '커피', 원두: '커피', 커피캡슐: '커피', 감자칩: '과자',
};
function eligibleName(name, purpose) {
  return new RegExp(purpose.include, 'i').test(name) && !new RegExp(purpose.exclude || '(?!)', 'i').test(name);
}
function conditionGaps(purpose, observed) {
  const gaps = [];
  if (/냉동/.test(purpose.label) && !/냉동|FROZEN/.test(observed)) gaps.push('frozen_storage_not_confirmed');
  if (/상온/.test(purpose.label) && !/상온|실온|ROOM/.test(observed)) gaps.push('room_storage_not_confirmed');
  if (/밀키트/.test(purpose.label) && !/밀키트|쿠킹박스|간편조리세트/.test(observed)) gaps.push('meal_kit_form_not_confirmed');
  if (/네스프레소 오리지널/.test(purpose.label) && !/네스프레소.*오리지널|오리지널.*네스프레소/i.test(observed)) gaps.push('capsule_machine_compatibility_not_confirmed');
  if (/조리완료 닭가슴살/.test(purpose.label) && !/스팀|훈제|수비드|조리완료|소스|가열처리|익혀/.test(observed)) gaps.push('cooked_chicken_form_not_confirmed');
  if (/조리용 콩 통조림/.test(purpose.label) && !/통조림|캔|canned|베이크드|베이키드/i.test(observed)) gaps.push('canned_beans_form_not_confirmed');
  if (/바로 데우는 카레|바로 데우는 짜장/.test(purpose.label) && /분말|가루|고형/.test(observed)) gaps.push('powder_or_solid_cooking_base_not_ready_sauce');
  if (/물에 타는 단백질 분말/.test(purpose.label) && !/분말|파우더|웨이|유청/.test(observed)) gaps.push('protein_powder_form_not_confirmed');
  if (/티백/.test(purpose.label) && !/티백|티.?백|\d+\s*T\b/i.test(observed)) gaps.push('tea_bag_form_not_confirmed');
  if (/생양파|생대파|깐마늘/.test(purpose.label) && /냉동|FROZEN/.test(observed)) gaps.push('frozen_produce_not_fresh_purpose');
  return gaps;
}
function modelKey(name, url = '') {
  if (/^https?:\/\/(?:m\.)?www\.nongshimmall\.com|^https?:\/\/m\.nongshimmall\.com/.test(url) && !/농심/.test(name)) name = '농심 ' + name;
  name = name.replace(/CJ제일제당/gi, 'CJ').replace(/농심몰/g, '농심').replace(/흰밥/g, '백미');
  return normalized(name.replace(/\([^)]*\d+\s*(?:개|팩|봉|입|병|캔|구|세트|매)[^)]*\)/gi, '')
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|mg|ml|g|l)(?=$|[^a-z]|x\d)/gi, '')
    .replace(/[xX*×]\s*\d+\s*(?:개입|개|팩|봉|입|병|캔|구|매|정|포)?/g, '')
    .replace(/\d+(?:[.,]\d+)?\s*(?:개입|개|팩|봉|입|병|캔|구|매|정|포|인분)/g, '')
    .replace(/(?:대용량|소용량|대포장|소포장|라벨프리|무라벨|라벨|낱개|묶음|큰사발|작은컵|큰컵|소컵|큰밥|작은밥|큰공기|작은공기)/g, '')
    .replace(/[xX*×]\s*\d+|\d+\s*[xX*×]/g, '').replace(/백미밥/g, '백미'));
}
function parseRobots(text) {
  const groups = []; let agents = [], rules = [], started = false;
  const finish = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; started = false; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase(), value = line.slice(colon + 1).trim();
    if (key === 'user-agent') { if (started) finish(); agents.push(value.toLowerCase()); }
    else if (['allow', 'disallow', 'crawl-delay'].includes(key) && agents.length) { rules.push({ key, value }); started = true; }
  }
  finish();
  const named = groups.filter(g => g.agents.some(a => a !== '*' && 'jachifoodcomparisoncollector'.includes(a)));
  return (named.length ? named : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
}
function robotsAllowed(url, rules) {
  const parsed = new URL(url), path = parsed.pathname + parsed.search;
  const hits = rules.filter(r => ['allow', 'disallow'].includes(r.key) && r.value).filter(r => {
    const pattern = r.value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    return new RegExp('^' + pattern).test(path);
  }).sort((a, b) => b.value.replace(/\*/g, '').length - a.value.replace(/\*/g, '').length || (a.key === 'allow' ? -1 : 1));
  return !hits.length || hits[0].key === 'allow';
}
function robotsAvailablePolicy(observation) {
  if (observation.status >= 400 && observation.status < 500 && observation.status !== 429) return { allowed: true, reason: 'robots_4xx_unavailable_rfc9309_2.3.1.3' };
  if (observation.status === 200 && !/<html|<\?xml/i.test(observation.body || '')) return { allowed: true, reason: 'robots_rules_observed' };
  return { allowed: false, reason: observation.status === 429 ? 'robots_rate_limited' : 'robots_network_or_server_unreachable' };
}
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; return fallback; }
}
if (args.has('self-test')) {
  assert.equal(modelKey('CJ제일제당 햇반 백미 210g (36개)'), modelKey('CJ제일제당 햇반 백미 130g (12개)'));
  assert.equal(modelKey('CJ제일제당 햇반 백미 큰공기 300g (30개)'), modelKey('CJ제일제당 햇반 백미 작은공기 130g (36개)'));
  assert.equal(modelKey('켈로그 콘푸레이크 대용량 1200gx1개'), modelKey('켈로그 콘푸레이크 1.2kg (1개)'));
  assert.equal(modelKey('오뚜기 맛있는 오뚜기밥 흰밥 210g (24개)'), modelKey('오뚜기 맛있는 오뚜기밥 백미 200g (36개)'));
  assert.equal(modelKey('신라면(120g*5)','https://www.nongshimmall.com/product/a/2660/'),modelKey('농심 신라면 120g (40개)'));
  assert.notEqual(modelKey('햇반 백미 210g (12개)'), modelKey('햇반 현미 210g (12개)'));
  const rules = parseRobots('User-agent: *\nDisallow: /api/\nAllow: /api/public/\nCrawl-delay: 10\nUser-agent: Googlebot\nDisallow: /');
  assert.equal(robotsAllowed('https://example.com/api/private/', rules), false);
  assert.equal(robotsAllowed('https://example.com/api/public/1', rules), true);
  assert.equal(robotsAllowed('https://example.com/info/?pcode=1', rules), true);
  assert.equal(Object.keys(purposes).length, 50);
  assert.equal(eligibleName('냉동 피자 300g', purposes.P016[1]), false);
  assert.equal(eligibleName('피자맛 만두 1kg', purposes.P016[3]), false);
  assert.equal(eligibleName('돼지고기 안심 500g', purposes.P028[0]), true);
  assert.equal(eligibleName('한우 안심 500g', purposes.P028[0]), false);
  assert.equal(eligibleName('CJ제일제당 햇반 백미 210g (36개)', purposes.P002[0]), false);
  assert.equal(eligibleName('서리태 콩조림 4kg', purposes.P003[1]), false);
  for (const status of [400,401,403,404,410]) assert.equal(robotsAvailablePolicy({status}).allowed,true);
  for (const status of [null,429,500,503]) assert.equal(robotsAvailablePolicy({status}).allowed,false);
  assert.equal(robotsAvailablePolicy({status:200,body:'<html>challenge</html>'}).allowed,false);
  console.log('food collector self-test passed'); process.exit(0);
}

await mkdir(dir, { recursive: true });
const context = { window: {} };
runInNewContext(await readFile(resolve(root, 'product-catalog.js'), 'utf8'), context);
const items = JSON.parse(JSON.stringify(context.window.ProductCatalog.items.filter(item => Object.hasOwn(purposes, item.id))));
assert.equal(items.length, 50);
let state = await readJson(output, { records: [], attempts: [], unresolved: [] });
let cache = await readJson(cacheFile, { version: 1, entries: {} });
cache.entries ??= {};
// Reconcile prior observations after improving option deduplication; never upgrade pending.
const previousRecords = state.records;
state.records = [];
for (const record of previousRecords) {
  const aliases = { '무첨가 압착 오트밀': '오트밀', '무첨가 원액 두유': '두유', '무가당 플레인 그릭요거트': '플레인 그릭요거트', '건조 파스타면':'파스타면', '건조 소면':'소면' };
  let purpose = aliases[record.comparisonPurpose] || record.comparisonPurpose;
  if (purpose === '냉동 치킨너겟·텐더') purpose = /텐더/.test(record.name) ? '냉동 치킨텐더' : '냉동 치킨너겟';
  const definition = purposes[record.itemId]?.find(p=>p.label===purpose);
  const gaps = definition ? conditionGaps(definition,record.name+' '+record.facts.map(f=>f.value).join(' ')) : ['purchase_purpose_definition_missing'];
  const match = definition && eligibleName(record.name,definition);
  const downgrade = record.eligibilityStatus==='verified' && (!match || gaps.length);
  saveRecord({ ...record, comparisonPurpose: purpose, modelKey: modelKey(record.name, record.url),
    ...(downgrade ? {eligibilityStatus:'pending',reason:!match?'purchase_purpose_not_matched':gaps.join(';'),verification:{...record.verification,purposeMatch:Boolean(match),unconfirmedConditions:gaps}} : {}) });
}
let apiUnavailable = Object.entries(cache.entries).some(([url, value])=>url.startsWith('https://openapi.naver.com/v1/search/shop.json') && [401,403,429].includes(value.status));
const originTimes = new Map(), policies = new Map(), blockedOrigins = new Set();
const browser = await chromium.launch({ headless: true, executablePath: process.env.FOOD_PARSER_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage();
// Only inert HTML is parsed. Scripts, cookies, site APIs and challenges are never executed.
await page.route('**/*', route => route.abort());
async function parseHtml(html) {
  return page.evaluate(html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const text = e => (e?.textContent || '').replace(/\s+/g, ' ').trim();
    const meta = name => d.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content') || '';
    const title = meta('og:title') || d.title;
    const challenge = /access denied|just a moment|captcha|접근.*차단/i.test(d.title) || /cf-chl-|verify you are human|로봇이 아닙니다/.test(html.slice(0, 16000));
    let kurly = null;
    const labeledFields = [...d.querySelectorAll('table tr')].map(tr=>({label:text(tr.querySelector('th')),value:text(tr.querySelector('td'))})).filter(v=>v.label && v.value && /식품.*유형|원재료|원료|영양|내용량|중량|용량|수량|보관|조리|알레르기|소비기한|품질유지기한/.test(v.label));
    const jsonProducts = [];
    function productData(value) {
      if (!value || typeof value !== 'object') return;
      if ([value['@type']].flat().includes('Product')) jsonProducts.push({name:value.name,image:value.image,sku:value.sku,mpn:value.mpn,brand:value.brand?.name,
        manufacturer:value.manufacturer?.name,category:value.category,weight:value.weight,properties:(value.additionalProperty||[]).map(p=>({label:p.name,value:p.value}))});
      Object.values(value).forEach(productData);
    }
    for (const script of d.querySelectorAll('script[type="application/ld+json"]')) try { productData(JSON.parse(script.textContent)); } catch {}
    try {
      const p = JSON.parse(d.querySelector('#__NEXT_DATA__')?.textContent || '{}').props?.pageProps?.product;
      if (p) kurly = {
        name: p.name, image: p.mainImageUrl, amount: p.volume, count: p.salesUnit,
        imageAlternates: [p.originalImageUrl, p.shareImageUrl, ...(p.thumbnails?.productVerticalLargeUrls || [])].filter(Boolean),
        storage: p.storageTypes, expirationDate: p.expirationDate, allergy: p.allergy,
        origin: p.productOrigin, description: p.shortDescription, categories: p.categoryNames, preparation: [],
        deals: (p.dealProducts || []).map(v => ({ name: v.name, image: v.imageUrl, code: v.masterProductCode })),
        notices: (p.productNotice || []).map(v => ({ name: v.dealProductName, notices: v.notices })),
      };
      if (p && kurly) {
        const description = p.productDetail?.contentDescription?.description?.description;
        if (typeof description === 'string') {
          const detail = new DOMParser().parseFromString(description, 'text/html');
          kurly.imageAlternates.push(...[...detail.querySelectorAll('.goods_intro .pic img, .goods_intro > img')].map(i=>i.getAttribute('src')).filter(Boolean));
          kurly.preparation = [...detail.querySelectorAll('.goods_tip .tip_box, .goods_tip .context')].map(text).filter(v => /조리법|조리 시|조리법|해동|보관법/.test(v)).slice(0, 4);
        }
      }
    } catch { /* Malformed structured data is not evidence. */ }
    const listing = [...d.querySelectorAll('.prod_item')].map(e => {
      const a = e.querySelector('.prod_name a[href*="prod.danawa.com/info/"]');
      const img = e.querySelector('.thumb_image img, .thumb_img img, .prod_image img');
      return { name: text(a), url: a?.getAttribute('href'), image: img?.getAttribute('data-src') || img?.getAttribute('src') };
    }).filter(v => v.name && v.url);
    if (!listing.length) {
      for (const script of d.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(script.textContent);
          for (const v of j.itemListElement || []) if (v.name && /prod\.danawa\.com\/info\//.test(v.url || '')) listing.push({ name: v.name, url: v.url, image: v.image });
        } catch { /* Other JSON-LD is outside the discovery contract. */ }
      }
    }
    const specs = [...d.querySelectorAll('.spec_list .items')].map(text).filter(Boolean);
    const goodsLinks = [...new Set([...d.querySelectorAll('a[href*="/goods/"]')].map(a => a.getAttribute('href')).filter(Boolean))];
    const discoveredGoods = [];
    function walkData(value) {
      if (!value || typeof value !== 'object') return;
      if (value.name && /^\d{4,}$/.test(String(value.no || ''))) discoveredGoods.push({ name: value.name, url: 'https://www.kurly.com/goods/' + value.no });
      Object.values(value).forEach(walkData);
    }
    // RSC push arguments are JSON, parsed inertly. Never evaluate fetched script code.
    for (const script of d.scripts) {
      const m = script.textContent.match(/^self\.__next_f\.push\((.*)\)$/s);
      if (!m) continue;
      try {
        const payload = JSON.parse(m[1])[1];
        if (typeof payload !== 'string') continue;
        for (const line of payload.split('\n')) {
          const data = line.slice(line.indexOf(':') + 1);
          if (!/^[\[{]/.test(data)) continue;
          try { walkData(JSON.parse(data)); } catch {}
        }
      } catch {}
    }
    const declaredImages = [...d.querySelectorAll('img#baseImage, img.prod_img, .photo_w img, .prod_image img, .xans-product-image .BigImage')].map(i=>i.getAttribute('src')).filter(Boolean);
    return { parserVersion: 3, title, image: meta('og:image'), challenge, listing, specs, kurly, goodsLinks, discoveredGoods, declaredImages, jsonProducts, labeledFields,
      headings: [...d.querySelectorAll('h1, .prod_tit, .pro_name')].map(text).filter(Boolean).slice(0, 8) };
  }, html);
}
function attempt(url, kind, itemId, result, more = {}) {
  state.attempts.push({ itemId: itemId || null, kind, url, checkedAt: now(), ...result, ...more });
}
async function rawRequest(url, kind, itemId, headers = {}, delay = 1500) {
  const origin = new URL(url).origin;
  const wait = (originTimes.get(origin) || 0) + delay - Date.now();
  if (wait > 0) await sleep(wait);
  originTimes.set(origin, Date.now());
  try {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'JachiFoodComparisonCollector/1.0', ...headers }, signal: AbortSignal.timeout(20000) });
    const checkedAt = now(), contentType = r.headers.get('content-type') || '';
    if (r.status >= 300 && r.status < 400) {
      const redirect = r.headers.get('location'); await r.body?.cancel();
      attempt(url, kind, itemId, { status: r.status, reason: 'redirect_not_followed', redirect });
      return { status: r.status, checkedAt, contentType, redirect };
    }
    if (kind === 'image') {
      const reader = r.body?.getReader(); const chunk = reader ? (await reader.read()).value : null;
      await reader?.cancel();
      const b = Buffer.from(chunk || []);
      const signature = b[0] === 0xff && b[1] === 0xd8 || b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || /^GIF8|RIFF/.test(b.subarray(0,12).toString('ascii'));
      const ok = r.ok && (contentType.startsWith('image/') || signature);
      attempt(url, kind, itemId, { status: r.status, reason: ok ? 'image_bytes_observed' : 'image_unverified' });
      return { status: r.status, checkedAt, contentType, ok };
    }
    const body = await r.text();
    attempt(url, kind, itemId, { status: r.status, reason: r.ok ? 'response_observed' : `http_${r.status}` });
    return { status: r.status, checkedAt, contentType, body };
  } catch (error) {
    const result = { status: null, checkedAt: now(), reason: `${error.name}:${error.cause?.code || 'request_failed'}` };
    attempt(url, kind, itemId, result); return result;
  }
}
async function policy(url, itemId) {
  const origin = new URL(url).origin;
  if (policies.has(origin)) return policies.get(origin);
  const robotsUrl = origin + '/robots.txt';
  let observation = cache.entries[robotsUrl];
  if (!observation || args.has('refresh')) {
    observation = await rawRequest(robotsUrl, 'robots', itemId);
    cache.entries[robotsUrl] = observation;
  } else attempt(robotsUrl, 'robots', itemId, { status: observation.status, cacheHit: true, observedAt: observation.checkedAt });
  const { allowed, reason } = robotsAvailablePolicy(observation);
  const rules = allowed ? parseRobots(observation.body || '') : [];
  const delay = Math.max(origin.includes('search.danawa.com') ? 10000 : 1500, ...rules.filter(r => r.key === 'crawl-delay').map(r => Number(r.value) * 1000).filter(Number.isFinite));
  const p = { allowed, rules, delay, reason, robotsStatus: observation.status };
  attempt(robotsUrl, 'robots_policy', itemId, { status: observation.status, reason, allowed, documentationUrl: 'https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.3' });
  policies.set(origin, p); return p;
}
async function request(url, kind, itemId, redirects = 0) {
  let u; try { u = new URL(url); } catch { return { reason: 'invalid_url', checkedAt: now() }; }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return { reason: 'invalid_url', checkedAt: now() };
  const p = await policy(url, itemId);
  if (!p.allowed || !robotsAllowed(url, p.rules)) {
    const reason = p.allowed ? 'robots_disallowed' : 'robots_unavailable';
    attempt(url, kind, itemId, { reason }); return { reason, checkedAt: now() };
  }
  if (blockedOrigins.has(u.origin)) { attempt(url, kind, itemId, { reason: 'host_challenge_already_observed' }); return { reason: 'host_challenge_already_observed', checkedAt: now() }; }
  let cached = cache.entries[url];
  if (cached && [401,403,429].includes(cached.status)) {
    attempt(url, kind, itemId, { status: cached.status, cacheHit: true, reason: 'actual_resource_denied_or_rate_limited_no_retry' });
    return cached;
  }
  const isPrimary = /nongshimmall\.com|cjthemarket\.com|productguide\.maeil\.com|sempio\.com/.test(u.hostname);
  const needsParserUpgrade = cached?.info?.kurly && !cached.info.kurly.imageAlternates || kind === 'alternate_retailer_discovery' && cached?.info && !cached.info.discoveredGoods || isPrimary && cached?.info && cached.info.parserVersion !== 3;
  if (cached && !args.has('refresh') && !needsParserUpgrade) { attempt(url, kind, itemId, { cacheHit: true, observedAt: cached.checkedAt, status: cached.status, reason: cached.reason }); return cached; }
  const raw = await rawRequest(url, kind, itemId, {}, p.delay);
  if (raw.redirect) {
    if (redirects >= 3) return { ...raw, reason: 'redirect_limit' };
    return request(new URL(raw.redirect, url).href, kind, itemId, redirects + 1);
  }
  const result = { status: raw.status, checkedAt: raw.checkedAt, url, contentType: raw.contentType };
  if (kind === 'image') Object.assign(result, { ok: raw.ok, reason: raw.ok ? 'image_bytes_observed' : raw.reason || `image_http_${raw.status}` });
  else if (raw.status !== 200) result.reason = raw.reason || `http_${raw.status}`;
  else if (!raw.contentType?.includes('text/html')) result.reason = 'not_html';
  else {
    result.info = await parseHtml(raw.body);
    if (result.info.challenge) { result.reason = 'access_challenge'; blockedOrigins.add(u.origin); }
  }
  cache.entries[url] = result;
  return result;
}
function fact(key, label, value, url, unit) {
  return { key, label, value: tidy(value), ...(unit ? { unit } : {}), sourceUrl: url, evidenceType: 'retailer_listing' };
}
function danawaFacts(info, url) {
  const title = info.title.replace(/^\[다나와\]\s*/, '');
  const full = info.specs.join(' / '), parts = full.split(/\s*\/\s*/).map(tidy).filter(Boolean);
  const facts = [];
  if (parts[0]) facts.push(fact('type', '식품 유형 (다나와 표기)', parts[0], url));
  const amount = title.match(/\d+(?:[.,]\d+)?\s*(?:kg|ml|g|l)\b/i)?.[0];
  if (amount) facts.push(fact('amount', '표시 내용량 (상세 상품명)', amount, url));
  const count = title.match(/\(([^)]*\d+\s*(?:개|팩|봉|입|병|캔|구|매|포|정)[^)]*)\)/)?.[1];
  if (count) facts.push(fact('count', '표시 포장 수량 (상세 상품명)', count, url));
  const storage = parts.filter(v => /보관|냉동|냉장|상온|실온/.test(v));
  if (storage.length) facts.push(fact('storage', '보관·유통 표시', storage.join(' / '), url));
  const ingredients = parts.filter(v => /원재료|원료|함량|쌀\d|콩\d|유지방|돼지고기|쇠고기|닭고기|곡물|백미\d|멥쌀|정제수|대두\d/.test(v));
  if (ingredients.length) facts.push(fact('ingredients', '원재료·함량 표기', ingredients.join(' / '), url));
  const nutrition = full.indexOf('[영양정보]');
  if (nutrition >= 0) facts.push(fact('nutrition', '영양정보 (표시 기준 포함 원문)', full.slice(nutrition), url));
  const allergens = parts.filter(v => /알레르기|알러지/.test(v));
  if (allergens.length) facts.push(fact('allergens', '알레르기 표시', allergens.join(' / '), url));
  const preparation = parts.filter(v => /조리|전자레인지|에어프라이어|프라이팬|끓는|중탕|추출|호환/.test(v));
  if (preparation.length) facts.push(fact('preparation', '조리·사용 표시', preparation.join(' / '), url));
  if (full) facts.push(fact('retailerSpecs', '다나와 전체 식품 규격 원문', full, url));
  return facts;
}
function kurlyFacts(p, url) {
  const facts = [];
  if (p.categories?.length) facts.push(fact('type', '상품 분류 (컬리 표기)', p.categories.filter(v=>v!=='CATEGORY').join(' > '), url));
  if (p.amount) facts.push(fact('amount', '표시 중량·용량', p.amount, url));
  if (p.count) facts.push(fact('count', '판매 단위', p.count, url));
  if (p.storage?.length) facts.push(fact('storage', '유통 보관 코드 (컬리 표기)', p.storage.join(', '), url));
  if (p.allergy) facts.push(fact('allergens', '알레르기 표시', typeof p.allergy === 'string' ? p.allergy : JSON.stringify(p.allergy), url));
  if (p.origin) facts.push(fact('origin', '원산지 표시', p.origin, url));
  if (p.expirationDate) facts.push(fact('expirationDate', '소비기한 안내 (관측 시점 판매 안내)', p.expirationDate, url));
  if (p.preparation?.length) facts.push(fact('preparation', '판매처 상세 조리·보관 안내', p.preparation.join(' / '), url));
  for (const entry of p.notices || []) for (const v of entry.notices || []) {
    const value = tidy(v.description);
    if (!value || /상품설명|상품이미지|상세페이지|상세설명|상세정보|참조|참고|전화|고객/.test(value)) continue;
    const key = /식품.*유형/.test(v.title) ? 'type' : /원재료/.test(v.title) ? 'ingredients' : /영양/.test(v.title) ? 'nutrition' : /보관|취급/.test(v.title) ? 'storage' : /용량|중량|수량/.test(v.title) ? 'amount' : /알레르기/.test(v.title) ? 'allergens' : /조리/.test(v.title) ? 'preparation' : 'notice_' + hash(v.title);
    facts.push(fact(key, `${v.title} (${entry.name})`, value, url));
  }
  return facts;
}
function manufacturerFacts(info, url, product) {
  const facts = [];
  const properties = [...(info.labeledFields || []), ...(product?.properties || [])];
  for (const property of properties) {
    const label = tidy(property.label), value = tidy(property.value);
    if (!value || /상세.*참[고조]|상세.*확인|이미지.*참[고조]|문의|전화/.test(value)) continue;
    const key = /식품.*유형/.test(label) ? 'type' : /원재료|원료/.test(label) ? 'ingredients' : /영양|탄수화물|열량|콜레스테롤|식이섬유|지방|단백질|나트륨|당류/.test(label) ? 'nutrition' : /알레르기/.test(label) ? 'allergens' : /내용량|중량|용량/.test(label) ? 'amount' : /수량/.test(label) ? 'count' : /보관/.test(label) ? 'storage' : /가열|조리|섭취/.test(label) ? 'preparation' : /소비기한|품질유지기한/.test(label) ? 'expiry' : null;
    if (key) facts.push({...fact(key, label + ' (제조사 표기)', value, url),evidenceType:'manufacturer_label'});
  }
  const amount = (product?.name || info.title).match(/\d+(?:[.,]\d+)?\s*(?:kg|ml|g|l)\b/i)?.[0];
  if (amount && !facts.some(f=>f.key==='amount')) facts.push({...fact('amount','내용량 (제조사 상세 상품명)',amount,url),evidenceType:'manufacturer_label'});
  const count = (product?.name || info.title).match(/(?:[x*×]\s*)(\d+)(?:개|입|\))/i)?.[1];
  if (count) facts.push({...fact('count','포장 수량 (제조사 상세 상품명)',count,url,'개'),evidenceType:'manufacturer_label'});
  return facts;
}
function saveRecord(record) {
  const index = state.records.findIndex(r => r.itemId === record.itemId && r.modelKey === record.modelKey && r.comparisonPurpose === record.comparisonPurpose);
  if (index < 0) state.records.push(record);
  else if (state.records[index].eligibilityStatus !== 'verified' || record.eligibilityStatus === 'verified' && record.facts.length > state.records[index].facts.length) state.records[index] = { ...record, id: state.records[index].id };
}
async function detail(item, purpose, candidate, role = 'alternative') {
  const r = await request(candidate.url, 'detail', item.id);
  const info = r.info;
  const primary = /nongshimmall\.com|cjthemarket\.com|productguide\.maeil\.com|sempio\.com/.test(new URL(r.url || candidate.url).hostname);
  const structured = info?.jsonProducts?.find(p=>eligibleName(p.name || '',purpose));
  const name = tidy(info?.kurly?.name || structured?.name || info?.title?.replace(/^\[다나와\]\s*/, '') || candidate.name);
  const isDanawa = new URL(r.url || candidate.url).hostname === 'prod.danawa.com';
  const facts = r.reason ? [] : info?.kurly ? kurlyFacts(info.kurly, r.url) : isDanawa ? danawaFacts(info, r.url) : primary ? manufacturerFacts(info,r.url,structured) : [];
  const structuredImages = [structured?.image].flat().map(v=>typeof v==='string'?v:v?.url).filter(Boolean);
  const imageUrl = info?.kurly?.image || structuredImages[0] || info?.image || candidate.image || null;
  const purposeMatch = eligibleName(name, purpose);
  const dealModels = new Set((info?.kurly?.deals || []).map(v=>modelKey(v.name)));
  const assortment = /택\s*[123]|선택\s*옵션|\d+종|혼합.*참치|참치.*혼합|\+\s*[^\d\s]|\s&\s/.test(name) || dealModels.size > 1;
  const identity = Boolean(info && (isDanawa && info.specs.length || info.kurly || primary && (structured || info.labeledFields?.length)) && purposeMatch);
  const observed = name + ' ' + facts.map(f=>f.value).join(' ');
  const unconfirmedConditions = conditionGaps(purpose, observed);
  let image = null, verifiedImageUrl = null;
  if (identity && !assortment) for (const candidateImage of [...new Set([imageUrl, ...structuredImages, ...(info?.declaredImages || []), ...(info?.kurly?.imageAlternates || [])].filter(Boolean))]) {
    const absolute = new URL(candidateImage, r.url).href;
    image = await request(absolute, 'image', item.id);
    if (image?.ok) { verifiedImageUrl = absolute; break; }
  }
  const meaningful = new Set(facts.filter(f => ['type','amount','count','ingredients','nutrition','allergens','storage','preparation'].includes(f.key)).map(f => f.key));
  const exact = identity && !assortment && !unconfirmedConditions.length && image?.ok && meaningful.size >= 3;
  const reason = r.reason || !purposeMatch && 'purchase_purpose_not_matched' || assortment && 'compound_assortment_requires_option_identity_and_photo' || !identity && 'exact_detail_identity_not_verified' || unconfirmedConditions.join(';') || !image?.ok && ('exact_product_photo_not_verified:' + (image?.reason || 'no_declared_photo')) || meaningful.size < 3 && 'meaningful_comparison_fields_insufficient' || 'exact_detail_type_photo_and_retailer_fields_observed; nutritional/allergen/manufacturer label gaps remain';
  const record = {
    id: `${item.id}-food-${hash(modelKey(name,r.url || candidate.url) + '|' + purpose.label)}`, itemId: item.id,
    name, modelKey: modelKey(name,r.url || candidate.url), url: r.url || candidate.url, imageUrl: verifiedImageUrl || imageUrl,
    sourceLabel: isDanawa ? '다나와 (판매처 규격 표기)' : info?.kurly ? '컬리 (판매처 표기)' : primary ? '제조사 공식 상품 상세' : candidate.sourceLabel || '기존 카탈로그 앵커 (재검증 필요)',
    checkedAt: r.checkedAt, comparisonPurpose: purpose.label,
    eligibilityStatus: exact ? 'verified' : 'pending', facts,
    sources: [{ url: r.url || candidate.url, title: info?.title || name, checkedAt: r.checkedAt }],
    reason, collectionRole: role,
    verification: { purposeMatch, unconfirmedConditions, exactDetailIdentity: identity, compoundAssortment: assortment, photoObserved: Boolean(image?.ok), photoCheckedAt: image?.checkedAt || null, meaningfulFieldCount: meaningful.size,
      unknownFields: ['type','amount','count','ingredients','nutrition','allergens','storage','preparation'].filter(key => !meaningful.has(key)), compareComplete: false },
  };
  saveRecord(record);
  console.log('detail', item.id, purpose.label, record.eligibilityStatus, record.reason, name);
  return record;
}
async function naverDiscovery(query, itemId) {
  if (apiUnavailable) { attempt('https://openapi.naver.com/v1/search/shop.json', 'official_api', itemId, { reason: 'api_permission_previously_denied_no_retry' }); return []; }
  let local = {}; try { local = parseEnv(await readFile(resolve(root, '.env'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const id = process.env.NAVER_CLIENT_ID || local.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET || local.NAVER_CLIENT_SECRET;
  if (!id || !secret) { attempt('https://openapi.naver.com/v1/search/shop.json', 'official_api', itemId, { reason: 'credentials_absent' }); return []; }
  const url = 'https://openapi.naver.com/v1/search/shop.json?' + new URLSearchParams({ query, display: '30', sort: 'sim', exclude: 'used:rental:cbshop' });
  let entry = cache.entries[url];
  if (!entry || args.has('refresh')) {
    const r = await rawRequest(url, 'official_api', itemId, { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret });
    let j = {}; try { j = JSON.parse(r.body || '{}'); } catch {}
    // API prices/reviews/sales and authentication headers are never persisted.
    entry = { status: r.status, checkedAt: r.checkedAt, errorCode: j.errorCode || null,
      items: (j.items || []).map(v => ({ name: tidy(v.title.replace(/<[^>]+>/g, '')), url: v.link, image: v.image, productId: v.productId, sourceLabel: v.mallName })) };
    cache.entries[url] = entry;
  } else attempt(url, 'official_api', itemId, { cacheHit: true, status: entry.status, observedAt: entry.checkedAt });
  if ([401,403,429].includes(entry.status)) {
    apiUnavailable = true;
    attempt(url, 'official_api_scope_result', itemId, { status: entry.status, errorCode: entry.errorCode, reason: 'official_search_api_not_authorized_or_rate_limited; no_retry_this_run' });
  }
  return entry.status === 200 ? entry.items.map(v => ({ ...v, discoveryUrl: url, discoveredAt: entry.checkedAt })) : [];
}
function coverage() {
  return items.map(item => {
    const records = state.records.filter(r => r.itemId === item.id);
    const groups = purposes[item.id].map(p => {
      const rows = records.filter(r => r.comparisonPurpose === p.label);
      const verified = new Set(rows.filter(r => r.eligibilityStatus === 'verified').map(r => r.modelKey)).size;
      const pending = new Set(rows.filter(r => r.eligibilityStatus === 'pending').map(r => r.modelKey)).size;
      return { comparisonPurpose: p.label, query: p.query, target, verified, pending, missingVerified: Math.max(0, target - verified), status: verified >= target ? 'eligibility_target_met_deep_comparison_incomplete' : 'incomplete', compareComplete: false };
    });
    return { itemId: item.id, title: item.title, verified: records.filter(r => r.eligibilityStatus === 'verified').length, pending: records.filter(r => r.eligibilityStatus === 'pending').length, groups, complete: false };
  });
}
async function checkpoint() {
  state.generatedAt = now(); state.collector = 'scripts/collect-comparison-food.mjs';
  state.scope = { itemIds: items.map(i => i.id), targetPerPurchasePurpose: target, comparisonComplete: false, sourceVersion: context.window.ProductCatalog.version,
    officialApiDocumentation: 'https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md', robotsDocumentation: 'https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.3',
    robotsPolicy: 'robots 4xx except 429 means unavailable rules (RFC9309); actual resource 401/403/429 never retried, network/5xx conservative deny; no cookies or access-control bypass',
    note: 'verified means eligible exact product identity/photo and observed source fields only; deep comparison is not complete. Existing catalog claims are not fresh evidence.' };
  state.coverage = coverage();
  state.unresolved = state.coverage.flatMap(item => item.groups.map(g => ({ itemId: item.itemId, comparisonPurpose: g.comparisonPurpose, missingVerified: g.missingVerified,
    reason: g.missingVerified ? 'distinct_eligible_model_target_not_met; see per-source attempts and pending reasons' : 'deep_field_completion_and_manufacturer_label_review_required',
    unknownFields: [...new Set(state.records.filter(r => r.itemId === item.itemId && r.comparisonPurpose === g.comparisonPurpose).flatMap(r => r.verification?.unknownFields || []))] })));
  state.summary = { itemsQueued: 50, purposesQueued: state.coverage.reduce((n,i) => n+i.groups.length,0), records: state.records.length,
    verified: state.records.filter(r => r.eligibilityStatus === 'verified').length, pending: state.records.filter(r => r.eligibilityStatus === 'pending').length,
    groupsAtEligibilityTarget: state.coverage.flatMap(i=>i.groups).filter(g=>g.verified>=target).length, compareComplete: 0 };
  state.failureSummary = {
    pendingReasons: Object.fromEntries([...new Set(state.records.filter(r=>r.eligibilityStatus==='pending').map(r=>r.reason.split(':')[0]))].map(reason=>[reason,state.records.filter(r=>r.eligibilityStatus==='pending'&&r.reason.split(':')[0]===reason).length])),
    actualResourceFailures: Object.fromEntries([401,403,404,429,500,502,503].map(status=>[status,state.attempts.filter(a=>a.kind!=='robots'&&a.kind!=='robots_policy'&&!a.cacheHit&&a.status===status).length])),
    robotsObservations: Object.entries(cache.entries).filter(([url])=>url.endsWith('/robots.txt')).map(([url,v])=>({url,status:v.status,checkedAt:v.checkedAt,policy:robotsAvailablePolicy(v).reason})),
    apiScopeDenied: apiUnavailable,
  };
  await writeFile(output, JSON.stringify(state, null, 2) + '\n');
  await writeFile(cacheFile, JSON.stringify(cache, null, 2) + '\n');
}
try {
  const selected = args.has('audit-only') ? [] : items.filter(i => !args.has('items') || args.get('items').split(',').includes(i.id));
  for (const item of selected) {
    const groups = purposes[item.id];
    if (!args.has('skip-anchors')) for (const anchor of item.products) {
      const purpose = groups.find(p => eligibleName(anchor.name, p)) || groups[0];
      await detail(item, purpose, anchor, 'existing_anchor');
    }
    if (args.has('anchors-only')) { await checkpoint(); continue; }
    for (const purpose of groups) {
      const count = () => state.records.filter(r => r.itemId === item.id && r.comparisonPurpose === purpose.label && r.eligibilityStatus === 'verified').length;
      if (count() >= candidateTarget && !args.has('refresh')) continue;
      const searchUrl = 'https://search.danawa.com/dsearch.php?' + new URLSearchParams({ query: purpose.query });
      const search = args.has('no-danawa') ? {} : await request(searchUrl, 'discovery_search', item.id);
      const candidates = (search.info?.listing || []).filter(v => eligibleName(v.name, purpose));
      attempt(searchUrl, 'purpose_discovery_result', item.id, { comparisonPurpose: purpose.label, observedCandidates: search.info?.listing?.length || 0, nameMatchedCandidates: candidates.length,
        reason: search.reason || (candidates.length ? 'discovery_only_detail_required' : 'no_observed_purpose_candidate') });
      const seen = new Set(); let attempted = 0;
      for (const candidate of candidates) {
        if (count() >= candidateTarget || attempted >= Number(args.get('limit-detail') || 8)) break;
        const key = modelKey(candidate.name); if (!key || seen.has(key)) continue; seen.add(key);
        const url = new URL(candidate.url); candidate.url = 'https://prod.danawa.com/info/?pcode=' + url.searchParams.get('pcode');
        if (state.records.some(r => r.itemId === item.id && r.comparisonPurpose === purpose.label && r.modelKey === key && r.eligibilityStatus === 'verified')) continue;
        await detail(item, purpose, candidate); attempted++;
      }
      if (count() < candidateTarget && !args.has('no-retailer-alternate')) {
        const originalTerm = recommendationTerms[item.id][groups.indexOf(purpose)];
        const term = alternateTermAliases[originalTerm] || originalTerm;
        const discoveryUrl = 'https://www.kurly.com/recommendation/' + encodeURIComponent(term);
        const alternate = await request(discoveryUrl, 'alternate_retailer_discovery', item.id);
        const discovered = (alternate.info?.discoveredGoods || []).filter(v=>eligibleName(v.name,purpose));
        const pool = [...discovered, ...(alternate.info?.goodsLinks || []).map(url=>({url,name:term}))];
        const urlsSeen = new Set(); let alternateAttempts = 0;
        for (const candidate of pool) {
          const url = new URL(candidate.url, discoveryUrl).href;
          if (urlsSeen.has(url)) continue; urlsSeen.add(url);
          if (alternateAttempts >= 8) break;
          if (count() >= candidateTarget) break;
          await detail(item, purpose, { url, name: candidate.name, sourceLabel: '컬리 공개 문서에서 발견' }, 'alternate_retailer'); alternateAttempts++;
        }
      }
      if (count() < candidateTarget && !args.has('no-api')) {
        const api = await naverDiscovery(purpose.query, item.id);
        const apiSeen = new Set();
        for (const candidate of api.filter(v => eligibleName(v.name, purpose))) {
          const key = modelKey(candidate.name); if (!key || apiSeen.has(key)) continue; apiSeen.add(key);
          if (apiSeen.size > 12) break;
          const exists = state.records.some(r => r.itemId === item.id && r.comparisonPurpose === purpose.label && r.modelKey === key);
          if (exists) continue;
          // Search API metadata is discovery only. Do not upgrade it without a detail inspection.
          saveRecord({ id: `${item.id}-food-${hash(key + '|' + purpose.label)}`, itemId: item.id, name: candidate.name, modelKey: key, url: candidate.url,
            imageUrl: candidate.image || null, sourceLabel: '네이버 쇼핑 공식 API (발견용)', checkedAt: candidate.discoveredAt, comparisonPurpose: purpose.label,
            eligibilityStatus: 'pending', facts: [], sources: [{ url: candidate.discoveryUrl, title: '네이버 쇼핑 검색 API: ' + purpose.query, checkedAt: candidate.discoveredAt }],
            reason: 'official_api_discovery_only; exact_detail_model_photo_and_fields_not_verified', verification: { compareComplete: false, unknownFields: ['type','amount','count','ingredients','nutrition','allergens','storage','preparation'] } });
          if (!/shopping\.naver\.com|smartstore\.naver\.com/.test(candidate.url) && count() < target) await detail(item, purpose, candidate, 'api_alternate_source');
        }
      }
      await checkpoint();
      console.log(item.id, purpose.label, 'verified=' + count(), 'pending=' + state.records.filter(r=>r.itemId===item.id && r.comparisonPurpose===purpose.label && r.eligibilityStatus==='pending').length);
    }
    await checkpoint();
  }
} finally {
  await checkpoint(); await browser.close(); console.log(JSON.stringify(state.summary));
}
