import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { buildCatalog, buildComparisonIndex, modelKey, safeUrl, mergeProducts, numericValue, eligibilityFor, withModelOptions } from './build-comparison-catalog.mjs';
import { taxonomyFor, purposeGroup } from './comparison-taxonomy.mjs';
import C from '../comparison-core.js';

const item=(id,title='테스트')=>({id,title,kind:'product',category:'먹거리',variants:[],criteria:[],products:[],guidance:[]});
test('all existing item IDs remain; guidance has no purchase target',async()=>{
  const context={window:{}};
  runInNewContext(await readFile(new URL('../product-catalog.js',import.meta.url),'utf8'),context);
  const data=buildCatalog(context.window.ProductCatalog,[]);
  assert.equal(data.items.length,213);
  assert.equal(data.coverage.productItems,210);
  assert.equal(data.coverage.guidanceItems,3);
  assert.equal(data.items.filter(i=>i.kind==='guidance').flatMap(i=>i.groups).length,0);
  assert.ok(data.items.filter(i=>i.kind==='product').every(i=>i.groups.length&&i.groups.every(g=>g.targetCount===6)));
});
test('different purposes separate while pack sizes remain one model',()=>{
  const groups=taxonomyFor(item('P009'));
  assert.equal(groups.groups.length,3);
  assert.equal(purposeGroup(groups,{name:'파스타 스파게티 500g'}).id,'P009-pasta');
  assert.equal(purposeGroup(groups,{name:'소면 1kg'}).id,'P009-somen');
  assert.equal(purposeGroup(groups,{name:'즉석밥'}),null);
  assert.equal(purposeGroup(groups,{name:'파스타 소면 묶음'}),null);
  const drying=taxonomyFor({...item('P078','식기건조대·매트'),category:'주방용품'});
  assert.equal(purposeGroup(drying,{name:'식기건조대',comparisonPurpose:'식기건조대·매트 구매'}).id,'P078-rack');
  assert.equal(purposeGroup(taxonomyFor(item('P025')),{name:'순두부'}).id,'P025-soft');
  assert.equal(modelKey({name:'햇반 백미밥 210g 12개'}),modelKey({name:'햇반 백미밥 210g 24개'}));
});
test('pending discovery is never counted as a verified model',()=>{
  const base=item('P001','즉석밥');
  const records=[{id:'a',itemId:'P001',name:'확인된 밥',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',modelKey:'a',eligibilityStatus:'verified',facts:[{key:'amount',label:'내용량',value:210,unit:'g',sourceUrl:'https://example.org/a'}]},
    {id:'b',itemId:'P001',name:'발견한 밥',url:'https://example.org/b',modelKey:'b',eligibilityStatus:'pending',facts:[]}];
  const data=buildCatalog({version:'test',items:[base]},records);
  assert.equal(data.coverage.verifiedModels,1);
  assert.equal(data.coverage.compareReadyGroups,0);
  assert.equal(data.items[0].groups[0].products[1].attributes.amount.status,'unknown');
  assert.equal(data.items[0].groups[0].products[1].attributes.amount.value,null);
});
test('identity and photo alone cannot claim a source-backed comparison candidate',()=>{
  const raw={id:'a',itemId:'P001',name:'즉석밥',modelKey:'a',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[{key:'claims',value:'맛있는 밥'}]};
  assert.equal(buildCatalog({version:'test',items:[item('P001')]},[raw]).coverage.verifiedModels,0);
});
test('generic product terms do not override explicit appliance and repair subtypes',()=>{
  const groups=id=>taxonomyFor({...item(id),category:'가전'});
  assert.equal(purposeGroup(groups('P165'),{name:'로봇청소기'}).id,'P165-robot');
  assert.equal(purposeGroup(groups('P165'),{name:'침구청소기'}).id,'P165-bedding');
  assert.equal(purposeGroup(groups('P119'),{name:'거치형 변기세정제'}).id,'P119-installed');
  assert.equal(purposeGroup(groups('P203'),{name:'방충망 보수 테이프'}).id,'P203-repair');
  assert.equal(purposeGroup(groups('P172'),{name:'MODEL-A1',facts:[{key:'type',value:'가습기'},{key:'functions',value:'초음파식'}]}).id,'P172-ultrasonic');
  assert.equal(purposeGroup(groups('P172'),{name:'MODEL-A1',facts:[{key:'functions',value:'초음파식인지 미확인'}]}),null);
  assert.equal(purposeGroup(groups('P172'),{name:'MODEL-A1',facts:[{key:'functions',value:'초음파식'},{key:'functions',value:'가열식'}]}),null);
});
test('explicit leave-in usage overrides a generic treatment name, not unrelated claims',()=>{
  const groups=taxonomyFor({...item('P082','린스·트리트먼트'),category:'욕실·위생'});
  const product={name:'단백질 트리트먼트',facts:[{key:'functions',value:'노워시'}]};
  assert.equal(purposeGroup(groups,product).id,'P082-leave-in');
  assert.equal(purposeGroup(groups,{...product,facts:[{key:'claims',scope:'source_product_description',value:'트리트먼트/헤어팩 / 노워시 / 튜브형'}]}).id,'P082-leave-in');
  assert.equal(purposeGroup(groups,{...product,facts:[{key:'claims',value:'함께 사용할 노워시 제품도 있습니다'}]}),null);
  assert.equal(purposeGroup(groups,{...product,facts:[{key:'functions',value:'노워시 여부 미확인'}]}),null);
  assert.equal(purposeGroup(groups,{...product,facts:[{key:'care',value:'사용 후 물로 헹구세요'}]}).id,'P082-rinse');
});

test('recently broken exact photos exclude candidates, timeouts alone are not treated as permanent failure',()=>{
  const p={id:'a',itemId:'P001',name:'즉석밥',modelKey:'a',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[{key:'amount',value:210,unit:'g'}]};
  const observation={url:p.imageUrl,status:'broken',checkedAt:new Date().toISOString()};
  assert.equal(buildCatalog({version:'test',items:[item('P001')]},[p],[],{},[observation]).coverage.verifiedModels,0);
  assert.equal(buildCatalog({version:'test',items:[item('P001')]},[p],[],{},[{...observation,status:'timeout'}]).coverage.verifiedModels,1);
  const old={...observation,checkedAt:new Date(Date.now()-86400000*2).toISOString()};
  assert.equal(buildCatalog({version:'test',items:[item('P001')]},[p],[],{},[old]).coverage.verifiedModels,0,'A known failure is not silently revived by elapsed time');
  assert.equal(buildCatalog({version:'test',items:[item('P001')]},[p],[],{},[old,{...observation,status:'decoded'}]).coverage.verifiedModels,1);
});
test('source facts remain full length, unknown text and unsafe URLs excluded',()=>{
  const records=[{id:'a',itemId:'P004',name:'오트밀',url:'https://example.org/a',modelKey:'a',eligibilityStatus:'verified',facts:[
    {key:'nutrition',label:'영양',value:'긴 표시 자료 '.repeat(80),sourceUrl:'https://example.org/a'},
    {key:'allergens',label:'알레르기',value:'미확인'},
    {key:'price',label:'가격',value:100},
    {key:'care',label:'관리',value:'제품 설명 탭 참조'},
    {key:'ingredients',label:'원재료',value:'귀리',sourceUrl:'javascript:alert(1)'}]}];
  const data=buildCatalog({version:'test',items:[item('P004')]},records);
  const p=data.items[0].groups[0].products[0];
  assert.equal(p.facts.length,1);
  assert.equal(p.attributes.nutrition.value,'긴 표시 자료 '.repeat(80));
  assert.equal(p.attributes.allergens.status,'unknown');
  assert.equal(safeUrl('https://user:password@example.org/'), '');
  assert.equal(safeUrl('/data/exports/a',true),'');
});
test('duplicate seller options count once and stable anchor ID is retained',()=>{
  const a={id:'anchor',url:'https://example.org/same-option',modelKey:'same',eligibilityStatus:'verified',facts:[1]};
  const b={id:'new',url:a.url,modelKey:'same',eligibilityStatus:'verified',facts:[1,2]};
  const merged=mergeProducts([a,b]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,'anchor');
  assert.equal(merged[0].facts.length,2);
  const other={...b,id:'other-option',url:'https://example.org/other-option'};
  assert.equal(mergeProducts([a,other]).length,2,'Different options retain exact source IDs, while model counters dedupe separately');
});
test('plain appliance model codes dedupe installation options without changing exact IDs',()=>{
  const a={name:'LG전자 BEI3QEBLOE (빌트인)',modelKey:'unreviewed:oldbuiltinkey',url:'https://example.org/a'};
  const b={name:'LG전자 BEI3QEBLOE (프리스탠딩, 15cm)',modelKey:'unreviewed:oldstandkey',url:'https://example.org/b'};
  assert.equal(modelKey(a),modelKey(b));
  assert.notEqual(modelKey(a),modelKey({...a,name:'LG전자 BEI3QEBLOF'}));
  assert.equal(C.namedModelCode('세제 1000ml 12개'), '');
  assert.equal(C.namedModelCode('Bluetooth5.3 무선 이어폰'), '');
  const data=buildCatalog({version:'test',items:[{...item('P157'),category:'가전'}]},[
    {...a,name:a.name+' 인덕션',id:'built-in-option',itemId:'P157',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[{key:'type',value:'인덕션'}]},
    {...b,name:b.name+' 인덕션',id:'stand-option',itemId:'P157',imageUrl:'https://example.org/b.jpg',eligibilityStatus:'verified',facts:[{key:'type',value:'인덕션'}]}
  ]);
  assert.equal(data.coverage.verifiedModels,1);
  assert.deepEqual(data.items[0].groups[0].products.map(p=>p.id),['built-in-option','stand-option']);
});

test('collected model options retain exact photo, facts and stable URL-derived IDs without inflating models',()=>{
  const parent={id:'a',itemId:'P051',name:'모델 A',modelKey:'same',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[],modelOptions:[
    {name:'모델 A 다른 옵션',url:'https://example.org/option',imageUrl:'https://example.org/option.jpg',eligibilityStatus:'verified',facts:[{key:'capacity',value:2,unit:'L'}]}]};
  const expanded=withModelOptions([parent]);
  assert.equal(expanded[1].imageUrl,'https://example.org/option.jpg');
  assert.equal(expanded[1].id,withModelOptions([parent])[1].id);
  const data=buildCatalog({version:'test',items:[{...item('P051'),category:'주방용품'}]},expanded);
  assert.equal(data.coverage.verifiedModels,1);
  assert.equal(data.items[0].groups[0].products.length,2);
});
test('numeric facts require unambiguous units; option strings are not guessed',()=>{
  assert.deepEqual(numericValue('amount','2,520g'),{value:2520,unit:'g'});
  assert.deepEqual(numericValue('capacity','1.5 L'),{value:1.5,unit:'L'});
  assert.deepEqual(numericValue('amount','210g','kg'),{value:'210g',unit:'kg'});
  assert.equal(numericValue('amount','1kg 1포').value,'1kg 1포');
  assert.equal(numericValue('dimensions','100x200 cm').value,'100x200 cm');
});
test('IKEA colors are one model; dish draining is not laundry drying',()=>{
  const a={name:'VAGSJON 핑크',url:'https://www.ikea.com/kr/ko/p/vagsjoen-hand-towel-pink-50609203/'};
  const b={name:'VAGSJON 블루',url:'https://www.ikea.com/kr/ko/p/vagsjoen-hand-towel-bright-blue-40576260/'};
  assert.equal(modelKey(a),modelKey(b));
  assert.equal(eligibilityFor('P114',{name:'식기건조대',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified'}),'pending');
  assert.equal(eligibilityFor('P164',{name:'필터',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[]}),'pending');
  assert.equal(eligibilityFor('P016',{name:'피자맛 만두',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[]}),'pending');
  assert.equal(eligibilityFor('P032',{name:'표고버섯칩 스낵',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[]}),'pending');
  assert.equal(eligibilityFor('P164',{name:'필터',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[{key:'compatibility',value:'미확인'}]}),'pending');
  assert.equal(eligibilityFor('P164',{name:'필터',url:'https://example.org/',imageUrl:'https://example.org/a.jpg',eligibilityStatus:'verified',facts:[{key:'compatibility',value:'MODEL-A1',sourceUrl:'javascript:alert(1)'}]}),'pending');
});
test('width and height keep separate sourced comparison rows',()=>{
  const records=[{id:'a',itemId:'P051',name:'냄비',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',modelKey:'a',eligibilityStatus:'verified',facts:[
    {key:'dimensions',label:'너비',value:'20 cm'}, {key:'dimensions',label:'높이',value:'15 cm'}]}];
  const data=buildCatalog({version:'test',items:[{...item('P051'),category:'주방용품'}]},records);
  const group=data.items[0].groups[0],product=group.products[0];
  assert.equal(product.attributes.width.value,20);
  assert.equal(product.attributes.height.value,15);
  assert.equal(group.attributeDefinitions.find(d=>d.key==='width').type,'number');
});

test('multiple textual specifications from one source are retained in comparison attributes',()=>{
  const records=[{id:'a',itemId:'P051',name:'냄비',url:'https://example.org/a',imageUrl:'https://example.org/a.jpg',modelKey:'a',eligibilityStatus:'verified',facts:[
    {key:'functions',label:'기능',value:'분리형 손잡이'}, {key:'functions',label:'기능',value:'적층 보관'}, {key:'functions',label:'기능',value:'적층 보관'}]}];
  const data=buildCatalog({version:'test',items:[{...item('P051'),category:'주방용품'}]},records);
  assert.equal(data.items[0].groups[0].products[0].attributes.functions.value,'분리형 손잡이\n적층 보관');
});
test('source-specific fragrance/refill options and regional model suffixes do not inflate counts',()=>{
  const base='https://www.lgcaremall.com/product/';
  assert.equal(modelKey({name:'샤프란 꽃담초 섬유탈취제 리필 320mL 연꽃 2개',url:base+'1'}),modelKey({name:'샤프란 꽃담초 섬유탈취제 400mL 자스민꽃',url:base+'2'}));
  assert.equal(modelKey({name:'테크 실내건조 액체 세탁세제 리필 2L 일반용',url:base+'3'}),modelKey({name:'테크 실내건조 액체세제 일반 용기 2.7L',url:base+'4'}));
  assert.equal(modelKey({url:'https://www.philips.co.kr/c-p/BHD321_09/example'}),modelKey({url:'https://www.philips.co.kr/c-p/BHD321_59/example'}));
});

test('published comparison counts and homepage summaries use the same distinct eligible models',async()=>{
  const context={window:{}};
  for(const file of ['comparison-data.js','comparison-summary.js'])runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
  const data=C.validateCatalog(context.window.ComparisonCatalog);
  const summary=context.window.ComparisonSummary;
  const serialized=JSON.stringify(data);
  for(const token of ['data/exports','collection-index.json','NAVER_CLIENT_SECRET','sourceLines','senderHash','C:\\Users'])assert.ok(!serialized.includes(token),'Private provenance must not be published: '+token);
  assert.equal(summary.version,data.version);
  const expected=data.items.filter(i=>i.kind==='product').map(i=>({id:i.id,groups:i.groups.map(g=>({id:g.id,label:g.label,count:C.groupProducts(g.products).verified.length})).filter(g=>g.count>=2)})).filter(i=>i.groups.length);
  assert.equal(JSON.stringify(summary.items),JSON.stringify(expected));
  const groups=data.items.flatMap(i=>i.groups);
  assert.equal(data.coverage.verifiedModels,groups.reduce((n,g)=>n+C.groupProducts(g.products).verified.length,0));
  assert.equal(data.coverage.sixModelGroups,groups.filter(g=>C.groupProducts(g.products).verified.length>=6).length);
  for(const g of groups)for(const p of g.products){
    assert.ok(safeUrl(p.url),p.id+' product URL');
    if(C.eligible(p)){
      assert.ok(safeUrl(p.imageUrl,true),p.id+' image URL');
      assert.ok(p.facts.some(f=>f.key!=='claims'),p.id+' needs source-backed comparison specifications');
    }
    for(const value of Object.values(p.attributes))if(value.status==='verified'){
      assert.ok(safeUrl(value.sourceUrl),p.id+' field source');
      if(value.checkedAt)assert.ok(Date.parse(value.checkedAt)<=Date.now(),p.id+' observation time');
    }
  }
});

test('published item chunks exactly match the aggregate and index omits all products',async()=>{
  const context={window:{}};
  for(const file of ['comparison-data.js','comparison-index.js'])runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
  const data=context.window.ComparisonCatalog;
  const index=context.window.ComparisonIndex;
  assert.equal(JSON.stringify(index),JSON.stringify(buildComparisonIndex(data)));
  const expected={version:data.version,updatedAt:data.updatedAt,coverage:data.coverage,
    items:data.items.map(item=>({id:item.id,title:item.title,category:item.category,kind:item.kind,
      groups:item.groups.map(group=>({id:group.id,label:group.label,purpose:group.purpose}))}))};
  assert.equal(JSON.stringify(index),JSON.stringify(expected),'Index includes only selector metadata');
  assert.equal(index.version,data.version);
  assert.equal(index.updatedAt,data.updatedAt);
  assert.equal(JSON.stringify(index.coverage),JSON.stringify(data.coverage));
  assert.equal(index.items.length,data.items.length);
  for(const item of data.items){
    const chunk=JSON.parse(await readFile(new URL('../assets/comparison/'+item.id+'.json',import.meta.url),'utf8'));
    assert.deepEqual(chunk,JSON.parse(JSON.stringify(item)),item.id+' chunk parity');
    C.validateCatalog({items:[chunk]});
    const metadata=index.items.find(entry=>entry.id===item.id);
    assert.ok(!Object.hasOwn(metadata,'unassignedProducts'));
    for(const group of metadata.groups)assert.ok(!Object.hasOwn(group,'products'));
  }
  assert.ok(!/"(?:products|unassignedProducts)":/.test(JSON.stringify(index)));
  assert.ok(Buffer.byteLength(JSON.stringify(index))<100000,'Selector index remains smaller than 100 KB');
});
