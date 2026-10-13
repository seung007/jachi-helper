import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import Loader from '../comparison-loader.js';
import Core from '../comparison-core.js';

const index={version:'test & v2',items:[{id:'P001'},{id:'P002'}]};
const item=(id='P001')=>({id,title:'Rice',kind:'product',groups:[{
  id:id+'-main',label:'Main',purpose:'Purchase',attributeDefinitions:[],products:[]
}],unassignedProducts:[]});
const response=payload=>({ok:true,json:async()=>payload});

test('creation is lazy; successful item loads are cached and versioned',async()=>{
  const urls=[];
  const payload=item();
  const loader=Loader.create(index,{fetchImpl:async url=>{urls.push(url);return response(url.includes('/P002.json')?item('P002'):payload);}});
  assert.equal(urls.length,0);
  assert.equal(await loader.loadItem('P001'),payload);
  assert.equal(await loader.loadItem('P001'),payload);
  assert.deepEqual(urls,['/assets/comparison/P001.json?v=test%20%26%20v2']);
  assert.equal((await loader.loadItem('P002')).id,'P002');
  assert.equal(urls[1],'/assets/comparison/P002.json?v=test%20%26%20v2');
  assert.equal(await loader.loadItem('P001'),payload);
  assert.equal(urls.length,2);
});

test('separate index versions do not share cached item payloads',async()=>{
  const urls=[];
  const fetchImpl=async url=>{urls.push(url);return response(item());};
  const previous=Loader.create({...index,version:'old'},{fetchImpl});
  const current=Loader.create({...index,version:'new'},{fetchImpl});
  const oldItem=await previous.loadItem('P001');
  const newItem=await current.loadItem('P001');
  assert.notEqual(newItem,oldItem);
  assert.equal(await current.loadItem('P001'),newItem);
  assert.deepEqual(urls,['/assets/comparison/P001.json?v=old','/assets/comparison/P001.json?v=new']);
});

test('concurrent requests for the same item share one promise and fetch',async()=>{
  let finish;
  let calls=0;
  const loader=Loader.create(index,{fetchImpl:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const first=loader.loadItem('P001');
  const second=loader.loadItem('P001');
  assert.equal(first,second);
  await Promise.resolve();
  assert.equal(calls,1);
  finish(response(item()));
  assert.equal(await first,await second);
});

test('invalid or non-allowlisted IDs never request a file',async()=>{
  let calls=0;
  const loader=Loader.create(index,{fetchImpl:async()=>{calls++;return response(item());}});
  for(const id of ['P999','../P001','P001/','P001?x','P001%2f','p001','P1','',null,1,{},'__proto__']){
    await assert.rejects(loader.loadItem(id),/품목을 비교 목록에서 찾을 수 없습니다/);
  }
  assert.equal(calls,0);
});

test('wrong or stale payload IDs are rejected and not cached',async()=>{
  let calls=0;
  const loader=Loader.create(index,{fetchImpl:async()=>response(++calls===1?item('P002'):item())});
  await assert.rejects(loader.loadItem('P001'),/요청한 품목과 다른 비교 자료/);
  assert.equal((await loader.loadItem('P001')).id,'P001');
  assert.equal(calls,2);
});

test('network, HTTP, JSON and synchronous fetch errors remain retryable',async()=>{
  for(const fail of [
    ()=>{throw new Error('offline');},
    async()=>{throw new Error('offline');},
    async()=>({ok:false,status:404}),
    async()=>({ok:true,json:async()=>{throw new SyntaxError('bad JSON');}}),
    async()=>undefined
  ]){
    let calls=0;
    const loader=Loader.create(index,{fetchImpl:()=>++calls===1?fail():response(item())});
    const first=loader.loadItem('P001');
    const second=loader.loadItem('P001');
    await assert.rejects(first,/비교 자료(?:를 불러오지 못했습니다| 형식을 확인할 수 없습니다)/);
    await assert.rejects(second,/비교 자료(?:를 불러오지 못했습니다| 형식을 확인할 수 없습니다)/);
    assert.equal((await loader.loadItem('P001')).id,'P001');
    assert.equal(calls,2);
  }
});

test('missing or corrupt payloads and group arrays are rejected before caching',async()=>{
  const corrupt=[null,{},[],{...item(),groups:undefined},{...item(),groups:{}},
    {...item(),groups:[null]},
    {...item(),groups:[{id:'P001-main',attributeDefinitions:[],products:{}}]},
    {...item(),groups:[{id:'P001-main',attributeDefinitions:{},products:[]}]},
    {...item(),groups:[{id:'P001-main',attributeDefinitions:[],products:[{}]}]},
    {...item(),groups:[{id:'P001-main',attributeDefinitions:[{}],products:[]}]}
  ];
  for(const payload of corrupt){
    let calls=0;
    const loader=Loader.create(index,{fetchImpl:async()=>response(++calls===1?payload:item())});
    await assert.rejects(loader.loadItem('P001'),/[가-힣]/);
    assert.equal((await loader.loadItem('P001')).id,'P001');
    assert.equal(calls,2);
  }
});

test('guidance items may have empty groups',async()=>{
  const payload={id:'P001',title:'Guidance',kind:'guidance',groups:[],unassignedProducts:[]};
  const loader=Loader.create(index,{fetchImpl:async()=>response(payload)});
  assert.equal(await loader.loadItem('P001'),payload);
});

test('malformed indexes cannot authorize unsafe or duplicate IDs',()=>{
  const fetchImpl=async()=>response(item());
  for(const bad of [null,{}, {...index,version:''},{...index,items:{}},
    {...index,items:[null]},{...index,items:[{id:'../P001'}]},
    {...index,items:[{id:'P001'},{id:'P001'}]}]){
    assert.throws(()=>Loader.create(bad,{fetchImpl}),/비교 목록/);
  }
});

test('browser global exports the same lazy API and delegates validation to ComparisonCore',async()=>{
  let requests=0;
  let validations=0;
  const context={ComparisonCore:{validateCatalog:catalog=>{validations++;return Core.validateCatalog(catalog);}},
    fetch:async()=>{requests++;return response(item());}};
  runInNewContext(await readFile(new URL('../comparison-loader.js',import.meta.url),'utf8'),context);
  const loader=context.ComparisonLoader.create(index);
  assert.equal(requests,0);
  assert.equal((await loader.loadItem('P001')).id,'P001');
  assert.equal(requests,1);
  assert.equal(validations,1);
});
