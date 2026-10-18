import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const privateRoot=path.join(root,'data/exports/life-service-planning-2026-10-17');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const baseline=path.join(privateRoot,'directory-before-implementation.json');
if(!fs.existsSync(baseline))fs.copyFileSync(path.join(root,'data/life-services.json'),baseline);
const original=read(baseline);
const research=read(path.join(root,'data/exports/seoul-life-research-2026-10-16/service-discovery.json'));
const registry=read(path.join(privateRoot,'resource-registry.json')).resources;
const proposals=read(path.join(privateRoot,'search-intents.proposed.json')).services;
const extraPath=path.join(privateRoot,'research-next.json');
const extra=fs.existsSync(extraPath)?read(extraPath):{services:[],enrichments:[],resolutions:[]};
const hash=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,12);
const categories=research.categories.map(c=>({id:c.id,label:c.label,subtopics:c.subtopics.map(label=>({id:c.id+':'+hash(label),label}))}));
const problems=[
  {id:'laundry',label:'빨래·습기',icon:'WashingMachine',categoryIds:['laundry'],placeCategory:'laundry-clean',keywords:['빨래','세탁','이불','쉰내','건조'],productQuery:'세탁',productIds:['P102','P103','P104','P105','P110','P111','P113','P137','P138','P167','P170','P200'],note:'옷감·이불의 세탁 표시와 세탁기 용량을 먼저 확인하세요.',actions:[{label:'세탁·건조 용품',href:'/?q=세탁#catalog'},{label:'이불 제품 비교',href:'/compare?item=P137'}]},
  {id:'cleaning',label:'욕실·집 청소',icon:'Sparkles',categoryIds:['cleaning'],placeCategory:'laundry-clean',keywords:['청소','벌레','해충','욕실','물때'],productQuery:'청소',productIds:['P073','P127','P128','P165','P166'],note:'청소할 표면과 오염을 구분하고 제품의 사용·주의 표시를 확인하세요.',actions:[{label:'청소용품 찾기',href:'/?q=청소#catalog'}]},
  {id:'waste',label:'음식물·분리배출',icon:'Recycle',categoryIds:['waste'],placeCategory:null,keywords:['음식물','쓰레기','분리배출','버리기','폐기물'],productQuery:'음식물',productIds:['P134'],note:'배출 종류와 거주 구의 공식 배출 기준을 먼저 확인하세요.',actions:[{label:'음식물 보관·배출 용품',href:'/?q=음식물#catalog'}]},
  {id:'meals',label:'장보기·식사',icon:'ShoppingBasket',categoryIds:['shopping','meals'],placeCategory:'groceries',keywords:['혼밥','식사','장보기','간편식','도시락'],productQuery:'즉석밥',productIds:['P001','P066','P067'],note:'먹을 양과 보관 공간, 조리·수령 시간을 함께 비교하세요.',actions:[{label:'먹거리 찾기',href:'/?category=먹거리#catalog'},{label:'즉석밥 비교',href:'/compare?item=P001'}]}
];
const exactSubtopics={
  laundrygo:['수거 세탁','옷 수선'],washswat:['수거 세탁'],miso:['가사 청소','입주 청소'],chyeon:['가사 청소','입주 청소','에어컨 청소','세탁기 청소'],soomgo:[],
  dalock:['셀프 창고','계절 짐','단기 짐 보관'],zimssa:['이사·운반','입주 청소'],catchtable:['식당 예약','대기 접수'],modu:['주차'],
  'tmoney-go':['버스·지하철','택시','공공자전거'],'seoul-bike':['공공자전거'],bbegi:['대형폐기물'],kurly:['온라인 장보기'],ssg:['온라인 장보기'],
  ohou:[],spacecloud:['모임 공간'],'daiso-mall':['다이소·생활용품점','매장 픽업'],zigbang:['매물 찾기'],dabang:['매물 찾기'],
  'pocket-cu':['편의점','매장 픽업'],'woodongs':['편의점','매장 픽업','편의점 택배'],'naver-map':[],'kakao-map':[],danggeun:['중고 거래'],
  ddocdoc:['병원·의원'],'kepco-on':['전기'],gasapp:['도시가스'],'seoul-pay':['지역상품권'],'e-gen':['병원·의원','약국','야간·휴일 진료'],
  'seoul-ansimi':['생활 안전'],plabfootball:['체육 대관'],pharm114:['약국'],baemin:['음식 배달','포장 주문','온라인 장보기'],
  'coupang-eats':['음식 배달','온라인 장보기'],yogiyo:['음식 배달'],tabling:['식당 예약','대기 접수'],lastorder:['마감 음식'],
  'oneul-sugeo':['음식물 배출','분리배출'],recl:['헌옷 수거'],
  ddangyo:['음식 배달','포장 주문'],yeogiro:['대형폐기물'],'e-waste-visit':['폐가전 수거'],
  'cu-post':['편의점 택배'],'gs-postbox':['편의점 택배'],epost:['우체국'],
  'kakao-t':['택시','주차','퀵'],frip:['원데이 클래스','운동 레슨'],taling:['원데이 클래스'],sssd:['원데이 클래스'],
  'pet-friends':['반려용품'],wayo:['돌봄'],peopet:['동물등록'],'holiday-pharmacy':['약국','야간·휴일 진료'],smartchoice:['인터넷·통신']
};
const officialSubtopics={
  'single-household':['1인가구 지원','안심계약 도움'],'youth':['청년 지원'],'housing':['공공임대','주거 지원'],'real-estate':['매물 찾기'],
  welfare:['돌봄'],'women-family':['돌봄'],'seoul-job':['일자리'],work24:['일자리'],lifelong:['평생학습'],library:['도서관'],
  culture:['공공 문화행사','전시','공연'],'public-booking':['공공 체육시설','체육 대관','모임 공간'],sports:['공공 체육시설'],
  hangang:['공원'],parks:['공원'],topis:['버스·지하철'],'facilities-corp':['주차'],disaster:['생활 안전'],water:['수도'],
  consumer:['소비자 상담'],finance:[], 'legal-aid':['안심계약 도움'],opinet:['주유'],dasan:['생활 민원'],'civil-complaint':['생활 민원']
};
const records=new Map(registry.map(r=>[r.id,{...r}]));
for(const s of extra.services||[]){
  const key='service:'+s.id;
  if(records.has(key))continue;
  records.set(key,{id:key,kind:'consumer_service',name:s.name,description:s.description,categoryIds:s.categoryIds,whenToUse:s.whenToUse,
    keywords:s.keywords||[],operator:s.operator?{value:s.operator}:null,usageMode:s.usageMode,regionCheck:{description:s.regionCheck},costCheck:{description:s.costCheck},conditions:s.conditions||[],
    links:[['web',s.web?.url],['ios',s.iosUrl],['android',s.androidUrl]].filter(([,url])=>url).map(([platform,url])=>({platform,url,state:platform==='web'&&s.web?.state?s.web.state:s.verification})),
    evidence:[{urls:s.sources,checkedOn:s.checkedOn,state:s.verification}],publicationState:s.publicationState||'reviewable_verified_feature_draft_not_app_transaction_tested',remaining:s.remaining||[],subtopicLabels:s.subtopicLabels||[]});
}
for(const s of extra.enrichments||[]){
  const r=records.get('service:'+s.id);if(!r)continue;
  if(s.operator)r.operator={value:s.operator};
  for(const [platform,url]of [['web',s.web?.url],['ios',s.iosUrl],['android',s.androidUrl]])if(url){r.links=r.links.filter(l=>l.platform!==platform);r.links.push({platform,url,state:platform==='web'&&s.web?.state?s.web.state:s.verification});}
  if(s.conditions)r.conditions=[...(r.conditions||[]),...s.conditions];
  r.evidence.push({urls:s.sources,checkedOn:s.checkedOn,state:s.verification});
}
const validCategories=new Set(categories.map(c=>c.id));
const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const services=[...records.values()].map(r=>{
  const originalId=r.id.replace(/^(service|official):/,'');
  const proposal=proposals.find(s=>s.id===r.id);
  const old=original.services.find(s=>s.id===originalId);
  const categoryIds=r.categoryIds.filter(id=>validCategories.has(id)&&!(originalId==='tmoney-go'&&id==='parcel')&&!(originalId==='chyeon'&&id==='support'));
  const sourceUrls=[...new Set(r.evidence.flatMap(e=>e.urls||[]).filter(safe))];
  const states=r.evidence.map(e=>e.state||'');
  const needsReview=r.publicationState?.startsWith('hold_')||r.kind==='data_resource_audience_review_required'||
    states.every(s=>/search_index|unavailable|target_406|access_warnings/.test(s)&&!/^official_[^;]*store[^;]*(?:read|verified)/.test(s));
  const labels=r.subtopicLabels?.length?r.subtopicLabels:(r.id.startsWith('official:')?officialSubtopics[originalId]:exactSubtopics[originalId])||[];
  const subtopicIds=categories.filter(c=>categoryIds.includes(c.id)).flatMap(c=>c.subtopics.filter(t=>labels.includes(t.label)).map(t=>t.id));
  const links=r.links.filter(l=>safe(l.url));
  const web=links.find(l=>l.platform==='web');
  const verificationText=r.sourceConflict?'공식 안내의 일부 조건을 재확인해야 합니다.':needsReview?'현재 운영·연결 조건을 확인 중입니다.':'공식 소개 확인 · 주소별 이용 가능 여부는 별도 확인';
  const id=r.id.startsWith('official:')?'official-'+originalId:originalId;
  return{id,name:r.name,type:r.id.startsWith('official:')?'official':'service',categoryIds,subtopicIds,
    description:r.description,whenToUse:proposal?.whenToUse||r.whenToUse||'관련 제도·시설의 공식 안내를 확인할 때',
    keywords:[...new Set([...(proposal?.keywords||[]),...(r.keywords||[]),...(r.aliases||[])])],
    problemIds:problems.filter(p=>p.categoryIds.some(c=>categoryIds.includes(c))).map(p=>p.id),
    topicIds:proposal?.topicIds||r.topicIds||[],operator:r.operator?.value||null,
    web:web?{url:web.url,label:r.id.startsWith('official:')?'공식 안내':'공식 서비스',state:web.state}:null,
    androidUrl:links.find(l=>l.platform==='android')?.url||null,iosUrl:links.find(l=>l.platform==='ios')?.url||null,
    regionCheck:r.regionCheck?.description||'서비스에서 주소·매장·자격별 이용 조건을 확인해 주세요.',
    costCheck:r.costCheck?.description||'공식 안내 또는 신청 화면에서 요금·최소 이용 조건·추가 비용을 확인하세요.',
    conditions:[...new Set([...(r.conditions||[]),...(r.existingCheckText?[r.existingCheckText]:[]),...(old?.checkBeforeUse?[old.checkBeforeUse]:[])])],
    reviewRequired:!!needsReview,reviewReason:needsReview?verificationText:null,verification:verificationText,
    checkedOn:r.evidence.map(e=>e.checkedOn).filter(Boolean).sort().at(-1)||null,sources:sourceUrls,
    linkNotes:old?.linkNotes||'표시되지 않은 플랫폼 링크는 미확인입니다. 앱 미제공을 뜻하지 않습니다.',
    linkEvidence:links.map(l=>({platform:l.platform,state:l.state})),
    usageMode:r.usageMode||null};
}).filter(s=>s.categoryIds.length&&(s.web||s.androidUrl||s.iosUrl)).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
assert.equal(new Set(services.map(s=>s.id)).size,services.length);
for(const s of services){assert(s.description&&s.whenToUse&&s.sources.length,s.id);if(s.androidUrl)assert.equal(new URL(s.androidUrl).hostname,'play.google.com');if(s.iosUrl)assert.equal(new URL(s.iosUrl).hostname,'apps.apple.com');}
const result={schemaVersion:2,checkedOn:'2026-10-17',scope:'공식 기능 안내와 연결 정보. 실제 예약·설치·주소별 지원·실시간 가격 검증이 아님.',categories,problems,services};
fs.writeFileSync(path.join(root,'data/life-services.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'data/life-task-links.json'),JSON.stringify({schemaVersion:1,problems},null,2)+'\n');
const summary={services:services.length,reviewRequired:services.filter(s=>s.reviewRequired).length,categories:categories.length,subtopics:categories.reduce((n,c)=>n+c.subtopics.length,0),ios:services.filter(s=>s.iosUrl).length,android:services.filter(s=>s.androidUrl).length,externalResearchPending:extra.resolutions?.filter(r=>r.state?.includes('pending')).length??null};
fs.writeFileSync(path.join(privateRoot,'public-build-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
