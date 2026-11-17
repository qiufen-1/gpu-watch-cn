export const BRANDS = ['华硕','微星','技嘉','七彩虹','影驰','索泰','耕升','映众','铭瑄','盈通','万丽'];
export const GPUS = ['RTX 5080','RTX 5070 Ti'];
export const dayOf = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0,10);
const requireValue = (v, message) => { if (!v) throw new Error(message); };
export function jdUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'item.jd.com' && /^\/\d+\.html$/.test(u.pathname) && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
}
export function conditionKey(conditions) { return JSON.stringify([...conditions].sort()); }
export function validateData(data, now = new Date()) {
  requireValue(data?.schemaVersion === 1 && data.region === '北京', '数据版本或地区不匹配');
  requireValue(['pending','ready','partial','error'].includes(data.status), '数据状态不正确');
  requireValue(Array.isArray(data.products) && data.products.length <= 1000 && Array.isArray(data.observations) && data.observations.length <= 200000, '数据量或结构不正确');
  for (const field of ['updatedAt','lastAttemptAt']) requireValue(data[field] === null || (Number.isFinite(Date.parse(data[field])) && Date.parse(data[field]) <= +now + 300000), '更新时间不正确');
  const ids = new Set();
  for (const p of data.products) {
    requireValue(/^\d{5,20}$/.test(p.id) && !ids.has(p.id), '商品编号无效或重复'); ids.add(p.id);
    requireValue(BRANDS.includes(p.brand) && GPUS.includes(p.gpu) && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length < 200, '商品信息不完整');
    requireValue(jdUrl(p.url) && new URL(p.url).pathname === `/${p.id}.html`, '商品链接无效');
    requireValue(p.selfOperated === true && Number.isFinite(Date.parse(p.ownershipVerifiedAt)) && Date.parse(p.ownershipVerifiedAt) <= +now + 300000, '尚未核实京东自营');
  }
  const keys = new Set();
  for (const o of data.observations) {
    requireValue(ids.has(o.productId) && o.region === '北京' && o.verified === true, '报价商品、地区或核实状态无效');
    requireValue(Number.isSafeInteger(o.priceFen) && o.priceFen > 0 && o.priceFen < 100000000, '价格必须为正整数分');
    requireValue(Number.isFinite(Date.parse(o.observedAt)) && Date.parse(o.observedAt) <= +now + 300000 && o.date === dayOf(o.observedAt), '采集日期无效');
    requireValue(['in_stock','out_of_stock','unknown'].includes(o.stock), '库存状态无效');
    requireValue(Array.isArray(o.conditions) && o.conditions.length >= 1 && o.conditions.length <= 12 && o.conditions.every(x => typeof x === 'string' && x.length > 0 && x.length <= 100) && new Set(o.conditions).size === o.conditions.length, '优惠条件不完整');
    requireValue(o.conditionKey === conditionKey(o.conditions), '优惠口径与标识不一致');
    requireValue(jdUrl(o.sourceUrl) && new URL(o.sourceUrl).pathname === `/${o.productId}.html` && o.source === 'authorized_feed', '报价来源无效');
    const key = `${o.productId}|${o.date}|${o.conditionKey}`; requireValue(!keys.has(key), '同日报价重复'); keys.add(key);
  }
  requireValue(data.status !== 'ready' || (data.observations.length > 0 && data.updatedAt !== null), '没有报价不能标记更新成功');
  return data;
}
export function isStale(data, now = new Date()) { return !data.updatedAt || +now - Date.parse(data.updatedAt) > 36 * 3600000; }
export function recordFreshness(data, now = new Date()) {
  if (!data.observations.length) return 'empty';
  if (isStale(data,now)) return 'stale';
  return data.observations.some(o=>o.date===dayOf(now)) ? 'current' : 'prior-day';
}
export function recordState(o, observations) {
  const from = Date.parse(o.date + 'T00:00:00+08:00') - 30 * 86400000;
  const prior = observations.filter(x => x.productId === o.productId && x.conditionKey === o.conditionKey && x.region === o.region && x.stock === 'in_stock' && x.date < o.date && Date.parse(x.date + 'T00:00:00+08:00') >= from);
  const low = prior.length ? Math.min(...prior.map(x => x.priceFen)) : null;
  return { label: low === null ? '开始记录' : o.priceFen < low ? '近30天新低' : o.priceFen === low ? '持平最低' : '高于近期最低', isNewLow: low !== null && o.priceFen < low, low, sampleDays: new Set(prior.map(x => x.date)).size };
}
export function currentRows(data, { gpu = '', brand = '', condition = '', today = dayOf(new Date()) } = {}) {
  const latest = new Map();
  for (const o of data.observations) {
    if (o.date !== today || o.stock !== 'in_stock' || (condition && o.conditionKey !== condition)) continue;
    const previous = latest.get(o.productId);
    if (!previous || o.priceFen < previous.priceFen) latest.set(o.productId, o);
  }
  return data.products.filter(p => (!gpu || p.gpu === gpu) && (!brand || p.brand === brand) && latest.has(p.id)).map(p => {
    const quote = latest.get(p.id); return { ...p, quote, record: recordState(quote, data.observations) };
  }).sort((a,b) => a.quote.priceFen - b.quote.priceFen || a.name.localeCompare(b.name,'zh-CN'));
}
export function series(data, gpu, condition, today = dayOf(new Date())) {
  const end = Date.parse(today + 'T00:00:00+08:00');
  const dates = Array.from({ length: 30 }, (_,i) => dayOf(end - (29-i)*86400000));
  return dates.map(date => {
    const rows = currentRows(data,{ gpu, condition, today: date });
    return { date, priceFen: rows[0]?.quote.priceFen ?? null, name: rows[0]?.name ?? null };
  });
}
