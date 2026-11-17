import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, currentRows, series, conditionKey, recordState, dayOf } from './model.mjs';
import { mergeFeed } from './collect.mjs';
const now=new Date('2026-11-17T01:05:00Z');
const product={id:'100187310368',brand:'华硕',gpu:'RTX 5070 Ti',name:'测试专用型号，不发布',url:'https://item.jd.com/100187310368.html',selfOperated:true,ownershipVerifiedAt:'2026-11-17T01:00:00Z'};
const quote=(date,priceFen,conditions=['普通用户'],extra={})=>({productId:product.id,date,observedAt:date+'T09:00:00+08:00',priceFen,conditions,conditionKey:conditionKey(conditions),stock:'in_stock',region:'北京',verified:true,source:'authorized_feed',sourceUrl:product.url,...extra});
const snapshot=(observations=[])=>({schemaVersion:1,region:'北京',status:observations.length?'ready':'pending',updatedAt:observations.length?'2026-11-17T01:00:00Z':null,lastAttemptAt:null,products:[product],observations});
test('北京日期以东八区计算',()=>{assert.equal(dayOf('2026-11-16T17:00:00Z'),'2026-11-17');});
test('首次记录不是新低；不同条件不混比',()=>{
  const first=quote('2026-11-17',100000);
  assert.equal(recordState(first,[first]).label,'开始记录');
  const prior=quote('2026-11-16',90000,['PLUS']);
  assert.equal(recordState(first,[prior,first]).low,null);
});
test('近30天边界、缺测天数、持平与新低',()=>{
  const today=quote('2026-11-17',100000);
  const past=[quote('2026-10-17',100),quote('2026-10-18',110000),quote('2026-11-16',120000),today];
  assert.equal(recordState(today,past).isNewLow,true);assert.equal(recordState(today,past).sampleDays,2);
  assert.equal(recordState(quote('2026-11-17',110000),past).label,'持平最低');
});
test('仅今天有货报价进入概览，不能拿旧报价充当实时价',()=>{
  for(const stock of ['unknown','out_of_stock'])assert.equal(currentRows(snapshot([quote('2026-11-17',100000,['普通用户'],{stock})]),{today:'2026-11-17'}).length,0);
  assert.equal(currentRows(snapshot([quote('2026-11-16',100000)]),{today:'2026-11-17'}).length,0);
});
test('曲线不填补缺测，且价格单位保持为分',()=>{
  const values=series(snapshot([quote('2026-11-17',123456)]),'RTX 5070 Ti','','2026-11-17');
  assert.equal(values.length,30);assert.equal(values.filter(p=>p.priceFen!==null).length,1);assert.equal(values[29].priceFen,123456);
});
test('拒绝非自营、伪造来源、错误地区和非法价格',()=>{
  const good=snapshot([quote('2026-11-17',123456)]);assert.doesNotThrow(()=>validateData(good,now));
  for(const change of [x=>x.products[0].selfOperated=false,x=>x.products[0].url='javascript:alert(1)',x=>x.observations[0].region='上海',x=>x.observations[0].priceFen=-1,x=>x.observations[0].sourceUrl='https://evil.example/100187310368.html',x=>x.observations[0].conditions=['PLUS']]){const d=structuredClone(good);change(d);assert.throws(()=>validateData(d,now));}
});
test('更新保留历史、拒绝回退和过期批次',()=>{
  const before=snapshot([quote('2026-11-16',150000)]);before.updatedAt='2026-11-16T01:00:00Z';
  const feed={schemaVersion:1,region:'北京',observedAt:'2026-11-17T01:00:00Z',products:[product],observations:[quote('2026-11-17',140000)]};
  const merged=mergeFeed(before,feed,now);assert.equal(merged.observations.length,2);assert.equal(merged.status,'partial');
  assert.throws(()=>mergeFeed(before,{...feed,observedAt:'2026-11-16T01:00:00Z'},now));
  assert.throws(()=>mergeFeed(before,{...feed,observations:[quote('2026-11-16',140000)]},now));
  assert.equal(before.observations.length,1);
});
test('数据源附加字段不会被发布',()=>{
  const feed={schemaVersion:1,region:'北京',observedAt:'2026-11-17T01:00:00Z',products:[{...product,privateExtra:'REMOVE'}],observations:[{...quote('2026-11-17',140000),privateExtra:'REMOVE'}]};
  assert.ok(!JSON.stringify(mergeFeed(snapshot(),feed,now)).includes('REMOVE'));
});
test('生产初始文件没有演示价、客户端没有采集凭据',async()=>{
  const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));validateData(data);
  const app=await readFile(new URL('./app.mjs',import.meta.url),'utf8');assert.ok(!app.includes('GPU_FEED_TOKEN'));assert.ok(!app.includes('api.jd.com'));
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');assert.ok(html.includes('lang="zh-CN"'));assert.ok(html.includes('价格走势'));
});
