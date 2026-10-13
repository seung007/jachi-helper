// Purchase purposes split groups; preferences and pack sizes remain filters.
const fields = {
  type: ['제품 유형', '사용 목적과 제품 형태를 먼저 맞춰 보세요.'],
  amount: ['내용량', '소비 속도와 보관 공간을 함께 확인하세요.'],
  count: ['수량', '같은 모델의 묶음 수량은 별도 모델이 아닙니다.'],
  ingredients: ['원재료·성분', '필요한 성분과 피해야 할 성분을 확인하세요.'],
  nutrition: ['영양 표시', '표시 기준량이 같은 경우에만 수치를 비교하세요.'],
  allergens: ['알레르기 표시', '미확인은 알레르기 성분 없음이라는 뜻이 아닙니다.'],
  storage: ['보관 방법', '냉장·냉동 공간과 개봉 후 보관 조건을 확인하세요.'],
  preparation: ['조리 방법', '보유한 조리기구와 준비 시간을 확인하세요.'],
  expiry: ['사용·소비기한', '실제 배송 상품의 기한은 판매처에서 확인하세요.'],
  material: ['소재', '세척 방법과 사용 환경에 맞는 소재인지 확인하세요.'],
  size: ['규격', '필요한 규격과 실제 옵션을 맞춰 보세요.'],
  dimensions: ['치수', '설치 공간과 여닫는 공간을 함께 재 보세요.'],
  capacity: ['용량', '필요한 양과 차지하는 공간을 함께 비교하세요.'],
  compatibility: ['호환 조건', '보유 기기·소재와 일치하는지 먼저 확인하세요.'],
  care: ['관리 방법', '세척·건조·교체에 필요한 수고를 비교하세요.'],
  contents: ['구성품', '필요한 부품이 포함되는지 확인하세요.'],
  weight: ['무게', '이동·운반·보관할 때 부담을 확인하세요.'],
  dosage: ['표시 사용량', '같은 세탁량·오염 조건으로만 사용량을 비교하세요.'],
  fragrance: ['향', '향 선호도와 민감도를 반영하세요.'],
  claims: ['표시 사용 목적', '판매처·제조사 설명이며 독립 시험 결과와 구분합니다.'],
  cautions: ['주의사항', '사용 금지 대상과 취급 주의사항을 확인하세요.'],
  power: ['정격 소비전력', '정격 전력만으로 실제 전기요금이나 성능을 단정하지 않습니다.'],
  installation: ['설치 조건', '공간·배수·전원과 설치비 포함 여부를 확인하세요.'],
  functions: ['기능', '자주 쓸 기능인지 확인하세요. 기능 수는 성능 순위가 아닙니다.'],
  consumables: ['교체 소모품', '교체 주기·구입 가능 여부와 유지비를 확인하세요.'],
  warranty: ['보증·서비스', '보증 범위와 예외 조건을 확인하세요.'],
  performance: ['공식 시험·측정', '같은 시험 방법과 조건일 때만 성능을 비교하세요.'],
  load: ['하중', '제조사가 표시한 설치 방법과 하중 조건을 함께 확인하세요.'],
  mounting: ['고정 방식', '타공·접착과 설치 가능한 표면을 확인하세요.'],
  certification: ['인증 표시', '인증 종류와 대상 모델이 일치하는지 확인하세요.'],
  use: ['사용 대상', '실제 사용할 대상·장소에 맞는지 확인하세요.'],
};
const profiles = {
  '먹거리': 'type amount count ingredients nutrition allergens storage preparation expiry',
  '주방용품': 'type material dimensions capacity compatibility care contents',
  '욕실·위생': 'type amount material use ingredients compatibility care cautions',
  '세탁·의류관리': 'type compatibility amount dosage ingredients fragrance care cautions',
  '청소·폐기': 'type use compatibility amount material care cautions contents',
  '침구·가구': 'type dimensions material weight care installation load',
  '가전': 'type capacity dimensions compatibility power functions installation consumables warranty',
  '수납·생활도구': 'type dimensions material capacity compatibility load mounting contents',
  '환경·안전': 'type use compatibility dimensions installation certification cautions expiry',
};
// Keys are stable purpose IDs. Patterns route candidates, not prove specifications.
const splits = {
  P006: [['toast','식빵','식빵|토스트'],['bagel','베이글','베이글']],
  P009: [['pasta','파스타','파스타|스파게티|펜네|푸실리'],['somen','소면','소면'],['udon','우동면','우동']],
  P014: [['curry','카레','카레|커리'],['jajang','짜장','짜장|자장']],
  P016: [['nugget','너겟·치킨텐더','너겟|너겟|치킨텐더'],['cutlet','돈가스','돈가스|돈까스'],['pizza','피자','피자']],
  P018: [['braised','조림 반찬','조림|장조림'],['seasoned','무침 반찬','무침'],['pickled','절임 반찬','절임|장아찌']],
  P023: [['bean','콩 통조림','콩|빈스'],['corn','옥수수 통조림','옥수수|콘']],
  P024: [['raw','조리용 계란','^(?!.*(?:구운|훈제|삶은)).*(?:계란|달걀|유정란|무정란)'],['cooked','구운 계란','구운|훈제|삶은']],
  P025: [['tofu','두부','두부'],['soft','순두부','순두부']],
  P026: [['raw','생 닭가슴살','생육|생 닭|생닭'],['cooked','조리된 닭가슴살','훈제|스팀|소스|수비드|조리']],
  P028: [['pork','돼지고기','돼지|삼겹|목살'],['beef','소고기','소고기|한우|우육|차돌']],
  P029: [['fish','손질 생선','고등어|갈치|연어|생선|동태|명태|삼치'],['shrimp','새우','새우'],['squid','오징어','오징어']],
  P030: [['onion','양파','양파'],['green-onion','대파','대파'],['garlic','마늘','마늘']],
  P031: [['cabbage','양배추','양배추'],['leaf','잎채소·샐러드','상추|샐러드|잎채소|시금치|로메인']],
  P032: [['sprout','콩나물','콩나물'],['mushroom','버섯','버섯']],
  P034: [['banana','바나나','바나나'],['apple','사과','사과'],['seasonal','그 외 생과일','귤|오렌지|포도|배 |복숭아|키위|딸기']],
  P037: [['sesame','참기름','참기름'],['perilla','들기름','들기름']],
  P038: [['jin','진·양조간장','진간장|양조간장'],['soup','국간장','국간장']],
  P039: [['gochujang','고추장','고추장'],['doenjang','된장','된장']],
  P040: [['salt','소금','소금'],['sugar','설탕','설탕'],['pepper','후추','후추']],
  P041: [['oyster','굴소스','굴소스'],['ketchup','케첩','케첩|케찹'],['mayo','마요네즈','마요네즈']],
  P044: [['milk','우유','우유'],['soy','두유','두유']],
  P046: [['instant','인스턴트 커피','인스턴트|스틱|맥심|카누'],['drip','드립백','드립백'],['bean','원두','원두'],['capsule','캡슐 커피','캡슐']],
  P048: [['nuts','견과류','견과|아몬드|호두|캐슈|땅콩'],['fruit','건과일','건과일|건포도|건망고|말린']],
  P050: [['drink','단백질 음료','음료|드링크|프로틴밀|셀렉스'],['powder','단백질 분말','분말|파우더|웨이']],
  P053: [['chef','식도','식도|셰프|주방칼|chefs-knife'],['paring','과도','과도|paring-knife']],
  P057: [['turner','뒤집개','뒤집개'],['spatula','조리주걱','주걱|스패출러']],
  P060: [['strainer','채반','채반|체 |소쿠리|콜랜더|colander'],['bowl','조리 볼','볼|보울|mixing-bowl']],
  P061: [['cup','계량컵','계량컵'],['spoon','계량스푼','계량스푼'],['scale','주방저울','저울']],
  P063: [['bowl','밥·국그릇','밥공기|밥그릇|국그릇|대접|그릇|bowl'],['plate','접시','접시|plate']],
  P071: [['wrap','식품 랩','랩'],['foil','알루미늄 호일','알루미늄|쿠킹호일'],['paper','종이호일','종이호일|베이킹페이퍼']],
  P072: [['bag','식품 봉투','봉투|봉지'],['clip','밀봉클립','클립']],
  P078: [['rack','식기건조대','건조대'],['mat','식기건조매트','매트']],
  P082: [['rinse','헹구는 린스·트리트먼트','^(?!.*(?:노워시|리브인|leave-in)).*(?:린스|컨디셔너|트리트먼트)'],['leave-in','헹구지 않는 헤어케어','노워시|리브인|leave-in']],
  P083: [['wash','바디워시','바디워시|거품샤워'],['soap','고형 비누','비누']],
  P085: [['rinse','세안 폼·젤','폼|젤'],['oil','클렌징 오일','오일']],
  P086: [['face','얼굴 보습제','페이스|얼굴|수분크림'],['body','바디 보습제','바디']],
  P087: [['manual','일반 칫솔','^(?!.*(?:리필|교체모|전동)).*칫솔'],['head','전동칫솔 리필모','리필|교체모|전동']],
  P089: [['floss','치실','치실'],['interdental','치간칫솔','치간칫솔']],
  P090: [['razor','면도기·날','면도기|면도날'],['foam','면도용 폼·젤','폼|젤']],
  P091: [['pad','일회용 패드','생리대|패드'],['tampon','탐폰','탐폰'],['reusable','재사용 월경용품','생리컵|면생리대']],
  P092: [['cotton','화장솜','화장솜'],['swab','면봉','면봉'],['tissue','미용 티슈','티슈']],
  P095: [['head','샤워헤드','헤드|핸드샤워기|hand-shower'],['hose','샤워호스','호스|shower-hose']],
  P101: [['bottle','욕실 소분통','소분|디스펜서|펌프|물비누통'],['dish','비누받침','비누받침']],
  P109: [['laundry','세탁 첨가형','세탁|첨가'],['spray','섬유 분무형','분무|스프레이|페브리즈|섬유탈취제']],
  P116: [['body','돌돌이 본체','^(?!.*리필).*(?:돌돌이|테이프 클리너|테이프클리너|먼지제거 롤러)'],['refill','돌돌이 리필','리필']],
  P117: [['electric','전동 보풀제거기','보풀제거기'],['brush','옷솔','옷솔|먼지제거 브러시']],
  P119: [['cleaner','변기 청소용','^(?!.*(?:거치|변기세정볼|블루렛)).*(?:세정|클리너)'],['installed','거치형 변기세정제','거치|변기세정볼|블루렛']],
  P125: [['dry','정전기 청소 밀대','정전기'],['wet','물걸레 밀대','물걸레|대걸레']],
  P127: [['dry','정전기 청소포','정전기'],['wet','물걸레 청소포','물걸레']],
  P130: [['gap','틈새솔','틈새'],['floor','바닥솔','바닥']],
  P132: [['toilet','변기용 뚫어뻥','변기'],['sink','싱크대용 뚫어뻥','싱크대']],
  P138: [['cover','이불커버','커버'],['duvet','속이불','속이불|이불솜']],
  P144: [['mask','수면안대','안대'],['earplug','수면 귀마개','귀마개']],
  P149: [['desk','작업 책상','책상'],['table','식탁·테이블','식탁|테이블']],
  P150: [['work','작업 의자','작업|사무|회전'],['dining','식탁 의자','식탁']],
  P152: [['sofa','소파','소파|쇼파'],['beanbag','빈백','빈백'],['floor','좌식의자','좌식']],
  P157: [['induction','인덕션','인덕션'],['radiant','하이라이트','하이라이트']],
  P158: [['toaster','토스터','토스터'],['oven','미니오븐','오븐']],
  P160: [['capsule','캡슐 커피머신','캡슐|네스프레소'],['bean','에스프레소 커피머신','에스프레소|전자동'],['drip','드립 커피메이커','커피메이커|드립']],
  P163: [['installed','설치형 정수기','직수|설치|정수기'],['jug','정수 포트','포트|저그|브리타']],
  P165: [['manual','직접 운용 청소기','^(?!.*(?:로봇|침구)).*청소기'],['robot','로봇청소기','로봇'],['bedding','침구청소기','침구']],
  P167: [['top','일반 세탁기','통돌이|일반세탁기'],['drum','드럼 세탁기','드럼']],
  P172: [['ultrasonic','초음파 가습기','초음파'],['heated','가열식 가습기','가열'],['evaporative','기화식 가습기','기화']],
  P174: [['aircon','냉방기','에어컨|냉방'],['heater','난방기','히터|난방|온풍']],
  P187: [['hook','고리','고리|후크'],['rod','압축봉','압축봉|샤워커튼봉']],
  P189: [['charger','충전기','충전기'],['cable','충전 케이블','케이블']],
  P191: [['aa','AA 건전지','AA(?!A)'],['aaa','AAA 건전지','AAA']],
  P195: [['scissors','생활용 가위','가위'],['cutter','커터칼','커터']],
  P199: [['full','전신거울','전신'],['table','탁상거울','탁상|테이블']],
  P203: [['repair','방충망 보수재','보수|테이프|패치'],['screen','교체 방충망','^(?!.*(?:보수|테이프|패치)).*(?:교체|롤|망)']],
  P207: [['stop','문 고정 스토퍼','스토퍼|문고정'],['security','휴대 방범용','방범|보안|안전잠금']],
  P210: [['extinguisher','소화기','소화기'],['alarm','화재 감지기','감지기|경보기']],
  P211: [['band','상처용 밴드','밴드'],['gauze','거즈','거즈'],['tape','의료용 테이프','테이프']],
};
const special = {
  P102:'type compatibility amount dosage ingredients fragrance cautions performance',
  P103:'type compatibility amount dosage ingredients fragrance cautions',
  P104:'type compatibility amount dosage fragrance claims cautions performance',
  P105:'type compatibility amount dosage ingredients fragrance cautions performance',
  P106:'type compatibility amount dosage fragrance cautions',
  P108:'type compatibility amount dosage ingredients cautions',
  P137:'size dimensions material weight care', P138:'size dimensions material weight care',
  P139:'size dimensions material care', P140:'size dimensions material care', P141:'size dimensions material care',
  P142:'dimensions material care', P145:'size dimensions material load warranty',
  P188:'power compatibility contents dimensions cautions certification',
  P212:'type use performance care warranty',
};

export function taxonomyFor(item) {
  if (item.kind === 'guidance') return { ...item, groups: [] };
  const definitions = (special[item.id] || profiles[item.category]).split(' ').map(key => ({
    key, label: fields[key][0], type: 'text', interpretation: fields[key][1],
  }));
  const purposes = splits[item.id] || [['default', item.title, null]];
  return {
    id: item.id, title: item.title, category: item.category, kind: item.kind,
    preferenceFilters: item.variants,
    selectionCriteria: item.criteria,
    groups: purposes.map(([key,label,match]) => ({
      id: `${item.id}-${key}`, label, purpose: label, match,
      constraints: ['같은 사용 목적', '필수 호환 조건과 실제 선택 옵션 확인'],
      targetCount: 6, attributeDefinitions: definitions,
    })),
  };
}

export function purposeGroup(item, product) {
  if (item.groups.length === 1) return item.groups[0];
  if (item.id === 'P082') {
    const usage = (product.facts || []).filter(f =>
      ['type','productType','productCategory','functions','use','care','dosage'].includes(f.key) ||
      (f.key === 'claims' && f.scope === 'source_product_description')
    ).flatMap(f => String(f.value).split(/\s*\/\s*|;|\n/));
    if (/노워시|리브인|leave-in/i.test(product.name || '') || usage.some(value => /^(?:노워시|리브인|leave-in)$/i.test(value.trim()) || /헹구지\s*않|헹굴\s*필요\s*없/.test(value))) {
      return item.groups.find(group => group.id === 'P082-leave-in') || null;
    }
    if (!/린스|컨디셔너/.test(product.name || '') && !usage.some(value=>/헹구어|헹궈|헹구세요|헹굽|씻어내|rinse-off/i.test(value))) return null;
  }
  if (item.id === 'P172') {
    const methods=(product.facts || []).filter(f=>['type','functions'].includes(f.key))
      .map(f=>String(f.value).trim()).filter(value=>/^(?:초음파식|가열식|자연기화식|기화식)$/.test(value));
    const keys=[...new Set(methods.map(value=>/초음파/.test(value) ? 'ultrasonic' : /가열/.test(value) ? 'heated':'evaporative'))];
    if(keys.length>1)return null;
    if(keys.length===1)return item.groups.find(group=>group.id===`P172-${keys[0]}`) || null;
  }
  const typeFacts=(product.facts || []).filter(f=>['type','productType','productCategory'].includes(f.key)).map(f=>f.value).join(' ');
  const matchText=text=>item.groups.flatMap(group => {
    const match=new RegExp(group.match,'i').exec(text);
    return match ? [{group,start:match.index,end:match.index+match[0].length}] : [];
  });
  const named=matchText(product.name || '');
  const matches=named.length ? named : matchText((product.url || '')+' '+typeFacts);
  if(matches.length===1)return matches[0].group;
  // A specific subtype may contain the generic term: 순두부/두부 or 전동칫솔/칫솔.
  const encompassing=matches.find(a=>matches.every(b=>a.start<=b.start&&a.end>=b.end));
  if(encompassing)return encompassing.group;
  if(matches.length>1)return null;
  // Do not classify using a broad row title or unrelated words in full page specs.
  return item.groups.find(group=>group.label===product.comparisonPurpose) || null;
}

export const attributeLabels = Object.fromEntries(Object.entries(fields).map(([key,[label]]) => [key,label]));
