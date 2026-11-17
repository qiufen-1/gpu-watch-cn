import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateData, conditionKey, dayOf, GPUS } from './model.mjs';

export function mergeFeed(previous, feed, now = new Date()) {
  validateData(previous, now);
  if (feed?.schemaVersion !== 1 || feed.region !== '北京' || !Number.isFinite(Date.parse(feed.observedAt)) || dayOf(feed.observedAt) !== dayOf(now) || +now - Date.parse(feed.observedAt) > 6*3600000) throw new Error('数据源不是今天六小时内的北京报价');
  if (!Array.isArray(feed.products) || !Array.isArray(feed.observations) || !feed.observations.length) throw new Error('数据源没有有效报价');
  // Publish only the explicitly public contract, never arbitrary provider payloads.
  const productsIn=feed.products.map(p=>Object.fromEntries(['id','brand','gpu','name','url','selfOperated','ownershipVerifiedAt'].map(k=>[k,p[k]])));
  const quotesIn=feed.observations.map(o=>({...Object.fromEntries(['productId','date','observedAt','priceFen','conditions','stock','region','verified','source','sourceUrl'].map(k=>[k,o[k]])),conditionKey:conditionKey(o.conditions??[])}));
  const incoming = { schemaVersion:1, region:'北京', status:'ready', updatedAt:feed.observedAt, lastAttemptAt:now.toISOString(), products:productsIn, observations:quotesIn };
  validateData(incoming,now);
  if (incoming.observations.some(o => o.date !== dayOf(feed.observedAt) || Math.abs(Date.parse(o.observedAt)-Date.parse(feed.observedAt)) > 3600000 || +now-Date.parse(o.observedAt)>6*3600000)) throw new Error('报价时间与采集批次不一致');
  if (previous.updatedAt && Date.parse(feed.observedAt)<Date.parse(previous.updatedAt)) throw new Error('拒绝过期批次');
  const products = new Map(previous.products.map(p => [p.id,p]));
  for (const p of incoming.products) {
    const old=products.get(p.id);
    if (old && (old.gpu!==p.gpu || old.brand!==p.brand)) throw new Error('同一商品编号的身份发生变化');
    products.set(p.id,p);
  }
  const key=o => `${o.productId}|${o.date}|${o.conditionKey}`;
  const observations=new Map(previous.observations.map(o=>[key(o),o]));
  for (const o of incoming.observations) {
    const old=observations.get(key(o));
    if (old && Date.parse(o.observedAt)<Date.parse(old.observedAt)) throw new Error('拒绝覆盖较新的报价');
    observations.set(key(o),o);
  }
  const cutoff=+now-400*86400000;
  const both=GPUS.every(gpu=>incoming.products.some(p=>p.gpu===gpu && incoming.observations.some(o=>o.productId===p.id && o.stock==='in_stock')));
  return validateData({...incoming,status:both?'ready':'partial',products:[...products.values()],observations:[...observations.values()].filter(o=>Date.parse(o.observedAt)>=cutoff)},now);
}
export async function collect(env=process.env) {
  const filename=new URL('./data.json',import.meta.url);
  const previous=validateData(JSON.parse(await readFile(filename,'utf8')));
  if (!env.GPU_FEED_URL) { console.log('PENDING: 尚未配置授权价格数据源，保留现有历史。'); return; }
  try {
    const url=new URL(env.GPU_FEED_URL);
    if(url.protocol!=='https:' || url.username || url.password) throw new Error('数据源必须使用 HTTPS');
    const response=await fetch(url,{headers:env.GPU_FEED_TOKEN?{Authorization:`Bearer ${env.GPU_FEED_TOKEN}`}:{},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error('数据源请求失败');
    if(Number(response.headers.get('content-length'))>8000000) throw new Error('数据过大');
    const chunks=[];let size=0;
    for await(const chunk of response.body){ size+=chunk.length;if(size>8000000)throw new Error('数据过大');chunks.push(chunk); }
    const next=mergeFeed(previous,JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const temporary=new URL('./data.json.tmp',import.meta.url);
    await writeFile(temporary,JSON.stringify(next,null,2)+'\n');await rename(temporary,filename);
    console.log(`已更新 ${next.products.length} 个商品，状态 ${next.status}。`);
  } catch {
    // Never print response bodies, URLs, tokens or provider error messages.
    const next={...previous,status:'error',lastAttemptAt:new Date().toISOString()};
    const temporary=new URL('./data.json.tmp',import.meta.url);
    await writeFile(temporary,JSON.stringify(next,null,2)+'\n');await rename(temporary,filename);
    console.error('ERROR: 采集失败，历史已保留；检查授权、数据结构或时效。');
  }
}
export async function build() {
  await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
  for(const file of ['index.html','styles.css','app.mjs','model.mjs','data.json','CNAME','favicon.svg']) await copyFile(new URL(file,import.meta.url),new URL(`dist/${file}`,import.meta.url));
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--build')) await build(); else await collect();
}
