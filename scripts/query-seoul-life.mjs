import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { consumerCategories, brandRules } from './seoul-life-taxonomy.mjs';

const {values}=parseArgs({options:{district:{type:'string'},dong:{type:'string'},'dong-type':{type:'string',default:'legal'},category:{type:'string'},'leaf-code':{type:'string'},brand:{type:'string'},query:{type:'string'},source:{type:'string',default:'base'},limit:{type:'string',default:'10'}}});
const root=resolve('data/exports/seoul-life-2026-10-14/classification');
const report=JSON.parse(await readFile(resolve(root,'classification-report.json'),'utf8'));
if(!['base','daiso'].includes(values.source))throw new Error('Source must be base or daiso; different sources are not merged');
if(!['legal','administrative'].includes(values['dong-type']))throw new Error('Dong type must be legal or administrative');
if(values.dong&&!values.district)throw new Error('Choose a district before dong; same dong names occur in different districts');
if(values.category&&!consumerCategories.some(value=>value.id===values.category))throw new Error('Unknown consumer category ID');
if(values.brand&&!brandRules.some(value=>value.id===values.brand))throw new Error('Unknown brand candidate ID');
if(values.source==='daiso'&&(values.dong||values['leaf-code']))throw new Error('Daiso source has no official dong/industry codes; use district and literal query instead');
if(values.source==='daiso'&&values.brand&&values.brand!=='daiso')throw new Error('Daiso source cannot filter another brand');
if(values.source==='daiso'&&values.category&&values.category!=='shopping')throw new Error('Official Daiso records are separately classified as household shopping');
const limit=Number(values.limit);
if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Limit must be an integer from 1 to 50');
if(values.query&&Array.from(values.query).length>100)throw new Error('Query too long');
const database=resolve(root,report.database);
if(!database.startsWith(root+sep)||!/^index-[\w.-]+\.sqlite$/.test(report.database))throw new Error('Invalid local index path');
const db=new DatabaseSync(database,{readOnly:true});
try {
  const knownDistricts=db.prepare('SELECT DISTINCT district FROM places').all().map(value=>value.district);
  if(values.district&&!knownDistricts.includes(values.district))throw new Error('Unknown district');
  const where=[],bindings=[];
  if(values.district){where.push('district=?');bindings.push(values.district);}
  if(values.dong){where.push(`${values['dong-type']==='administrative'?'admin_name':'legal_name'}=?`);bindings.push(values.dong);}
  if(values.source==='base') {
    if(values.category){where.push('category_id=?');bindings.push(values.category);}
    if(values['leaf-code']){where.push('leaf_code=?');bindings.push(values['leaf-code']);}
    if(values.brand){where.push('brand_candidate=?');bindings.push(values.brand);}
  }
  if(values.query){const literal=values.query.replace(/[\\%_]/g,'\\$&');where.push(`(name LIKE ? ESCAPE '\\' OR ${values.source==='base'?'road_address':'address'} LIKE ? ESCAPE '\\')`);bindings.push(`%${literal}%`,`%${literal}%`);}
  const table=values.source==='base'?'places':'chain_stores';
  const filter=where.length?` WHERE ${where.join(' AND ')}`:'';
  const total=db.prepare(`SELECT COUNT(*) AS count FROM ${table}${filter}`).get(...bindings).count;
  const results=db.prepare(`SELECT * FROM ${table}${filter} ORDER BY name,id LIMIT ?`).all(...bindings,limit);
  console.log(JSON.stringify({source:values.source,filters:values,dongType:values['dong-type'],total,order:'name; not price/popularity/ranking',classificationState:'proposed',results:results.map(row=>values.source==='base'?{sourceRecord:JSON.parse(row.raw_payload),consumerCategory:row.category_id,brandCandidate:row.brand_payload?JSON.parse(row.brand_payload):null,unknownFacts:['opening hours','24 hours','open now','price','reviews','parking','brand membership']}:JSON.parse(row.raw_payload))},null,2));
} finally {db.close();}
