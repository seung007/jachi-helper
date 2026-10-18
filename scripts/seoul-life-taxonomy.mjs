export const taxonomyVersion = '20261014-1';
export const consumerCategories = [
  ['groceries','식재료·식료품 구매','식료품 판매점 찾기'],
  ['shopping','생활·상품 쇼핑','상품 판매점 찾기'],
  ['dining','외식·간식·주점','음식점·간식점 찾기'],
  ['cafes-work','카페·스터디 공간','카페·학습 공간 찾기'],
  ['health','의료·약국·건강용품','의료기관·약국 찾기'],
  ['pets','반려동물·동물병원','반려동물 시설 찾기'],
  ['laundry-clean','세탁·청소·방제','세탁·청소 업체 찾기'],
  ['repairs-home','수리·집 관리','수리·집 관리 업체 찾기'],
  ['mobility','차량·주유·이동','차량·주유 시설 찾기'],
  ['exercise','운동·스포츠','운동 시설 찾기'],
  ['beauty-bath','미용·목욕·신체관리','미용·목욕 시설 찾기'],
  ['housing','주거·부동산','주거·중개 정보 찾기'],
  ['learning','교육·배움','교육기관 찾기'],
  ['leisure','취미·오락·여가','여가 시설 찾기'],
  ['stay-travel','숙박·여행','숙박·여행 업체 찾기'],
  ['rental','생활·장비 대여','대여 업체 찾기'],
  ['professional','법무·세무·전문 서비스','전문 서비스 업체 찾기'],
  ['work-support','일자리·행사·업무 지원','일자리·업무 지원 업체 찾기'],
  ['life-events','예식·장례·생활행사','생활행사 업체 찾기'],
  ['public-support','공공지원·민원·생활정보','공식 생활정보 찾기'],
  ['review','분류 검토 대기','원본 업종 확인'],
].map(([id,label,purpose])=>({id,label,purpose,status:'proposed_consumer_taxonomy'}));
const categories = new Map(consumerCategories.map(value=>[value.id,value]));
const defaults = new Map(Object.entries({'소매':'shopping','음식':'dining','보건의료':'health','수리·개인':'repairs-home','교육':'learning','예술·스포츠':'leisure','숙박':'stay-travel','부동산':'housing','시설관리·임대':'work-support','과학·기술':'professional'}));

export function classifyIndustry(industry) {
  const large=String(industry?.large||'').trim(),middle=String(industry?.middle||'').trim(),small=String(industry?.small||'').trim();
  let categoryId=defaults.get(large)||'review',ruleId=`source-large:${large}`;
  const override=(condition,category,rule)=>{if(condition){categoryId=category;ruleId=rule;}};
  override(large==='소매'&&['식료품 소매','음료 소매'].includes(middle),'groceries','retail-food');
  override(large==='소매'&&(middle==='애완동물·용품 소매'||small==='가축 사료 소매업'),'pets','retail-pets');
  override(large==='소매'&&['약국','의료기기 소매업','건강보조식품 소매업','안경렌즈 소매업'].includes(small),'health','retail-health');
  override(large==='소매'&&['자동차 부품 소매','모터사이클 소매'].includes(middle),'mobility','retail-vehicle');
  override(large==='소매'&&['주유소','가스 충전소'].includes(small),'mobility','vehicle-fuel');
  override(large==='소매'&&middle==='철물·건설자재 소매','repairs-home','home-materials');
  override(large==='음식'&&small==='카페','cafes-work','food-cafe');
  override(large==='예술·스포츠'&&small==='독서실/스터디 카페','cafes-work','study-space-not-food-cafe');
  override(large==='예술·스포츠'&&middle==='스포츠 서비스','exercise','sports-facility');
  override(large==='교육'&&['요가/필라테스 학원','태권도/무술학원'].includes(small),'exercise','sports-learning');
  override(large==='수리·개인'&&middle==='세탁','laundry-clean','laundry');
  override(large==='시설관리·임대'&&middle==='청소·방제','laundry-clean','cleaning-pest');
  override(large==='수리·개인'&&['자동차 수리·세차','모터사이클 수리'].includes(middle),'mobility','vehicle-repair');
  override(large==='수리·개인'&&['이용·미용','욕탕·신체관리'].includes(middle),'beauty-bath','beauty-bath');
  override(large==='수리·개인'&&['장례식장','기타 개인'].includes(middle),'life-events','life-event');
  override(large==='시설관리·임대'&&['시설관리','조경·유지'].includes(middle),'repairs-home','facility-care');
  override(large==='시설관리·임대'&&middle==='운송장비 대여','mobility','transport-rental');
  override(large==='시설관리·임대'&&['가정용품 대여','산업용품 대여'].includes(middle),'rental','equipment-rental');
  override(large==='시설관리·임대'&&middle==='여행사·보조','stay-travel','travel');
  override(large==='과학·기술'&&small==='동물병원','pets','veterinary-not-human-health');
  const category=categories.get(categoryId);
  return {categoryId,categoryLabel:category.label,sectionId:`${categoryId}:${industry?.middleCode||middle}`,sectionLabel:middle,leafCode:industry?.smallCode||null,leafLabel:small,purposeIds:[categoryId],purposeLabels:[category.purpose],ruleId,version:taxonomyVersion,state:categoryId==='review'?'review_required':'rule_based_proposal'};
}

// Name candidates only. These rules cannot verify franchise membership or store format.
const convenience=industry=>industry.small==='편의점';
const market=industry=>industry.large==='소매'&&String(industry.middle||'').trim()==='종합 소매';
const cafe=industry=>industry.large==='음식'&&industry.small==='카페';
const fuel=industry=>industry.small==='주유소';
const household=industry=>industry.large==='소매';
export const brandRules=[
  ['daiso','다이소',/다이소/,household],
  ['cu','CU',/^(?:CU|씨유)/,convenience],
  ['gs25','GS25',/^(?:GS25|지에스25|지에스이십오)/,convenience],
  ['seven-eleven','세븐일레븐',/^(?:세븐일레븐|7ELEVEN)/,convenience],
  ['emart24','이마트24',/^이마트24/,convenience],
  ['emart-everyday','이마트에브리데이',/^이마트에브리데이/,market],
  ['emart','이마트',/^이마트(?!24|에브리데이)/,market],
  ['homeplus','홈플러스',/^홈플러스/,market],
  ['lottemart','롯데마트',/^롯데마트/,market],
  ['costco','코스트코',/^코스트코/,market],
  ['traders','트레이더스',/^트레이더스/,market],
  ['hanaro','하나로마트',/^(?:농협)?하나로마트/,market],
  ['starbucks','스타벅스',/^스타벅스/,cafe],
  ['ediya','이디야',/^이디야/,cafe],
  ['mega-coffee','메가커피',/^(?:메가커피|메가MGC커피)/,cafe],
  ['compose','컴포즈커피',/^컴포즈커피/,cafe],
  ['paik-coffee','빽다방',/^빽다방/,cafe],
  ['twosome','투썸플레이스',/^투썸플레이스/,cafe],
  ['hollys','할리스',/^할리스/,cafe],
  ['s-oil','S-OIL',/^(?:SOIL|에쓰오일|에스오일)/,fuel],
  ['sk-energy','SK',/^SK/,fuel],
  ['gs-caltex','GS칼텍스',/^(?:GS칼텍스|지에스칼텍스)/,fuel],
  ['hd-oilbank','HD현대오일뱅크',/^(?:HD)?현대오일뱅크/,fuel],
].map(([id,label,pattern,eligible])=>({id,label,pattern,eligible,state:'unverified_name_candidate'}));

export function brandCandidateFor(place) {
  const industry=place?.industry||{};
  const name=String(place?.name||'').normalize('NFKC').trim().replace(/^(?:주식회사|유한회사|\(주\))\s*/,'').replace(/[\s()·.,-]/g,'').toUpperCase();
  const rule=brandRules.find(rule=>rule.pattern.test(name)&&rule.eligible(industry));
  return rule?{id:rule.id,label:rule.label,state:rule.state,evidenceField:'name',evidenceValue:place.name,officialMembershipVerified:false}:null;
}
