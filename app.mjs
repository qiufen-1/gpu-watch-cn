import { BRANDS, GPUS, validateData, currentRows, series, dayOf, isStale } from './model.mjs';
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('zh-CN',{minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
const time=s=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=null, gpu='', error=false;
const chartIcon='<svg viewBox="0 0 56 40" aria-hidden="true"><path d="M5 3v31h47M14 25v-7m10 7V10m10 15v-4m10 4V6"/></svg>';
const boxIcon='<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="8" width="30" height="23" rx="3"/><path d="M5 15h30M14 35h12m-6-4v4M15 23h10"/></svg>';
function emptyCharts(){for(const id of ['#chart-5080','#chart-5070'])$(id).innerHTML=`<div class="empty-chart">${chartIcon}<strong>还没有价格曲线</strong><p>取得真实报价后，从第一天开始记录</p></div>`;}
function drawChart(target,points,label){
  const available=points.filter(p=>p.priceFen!==null);
  if(!available.length){$(target).innerHTML=`<div class="empty-chart">${chartIcon}<strong>此口径暂无历史记录</strong><p>没有记录的日期不会补造价格</p></div>`;return;}
  const W=500,H=205,L=66,R=18,T=18,B=33;
  let low=Math.min(...available.map(p=>p.priceFen)),high=Math.max(...available.map(p=>p.priceFen));
  const pad=Math.max((high-low)*.2,10000);low=Math.max(0,low-pad);high+=pad;
  const x=i=>L+i*(W-L-R)/29, y=p=>T+(high-p)*(H-T-B)/(high-low);
  let path='',last=-2;
  points.forEach((p,i)=>{if(p.priceFen!==null){path+=`${i===last+1?'L':'M'}${x(i).toFixed(1)},${y(p.priceFen).toFixed(1)} `;last=i;}});
  const grid=[0,.5,1].map(t=>{const yy=T+t*(H-T-B);return `<path d="M${L} ${yy}H${W-R}" stroke="#e3e9f2"/><text x="${L-9}" y="${yy+4}" text-anchor="end">${esc(money(Math.round(high-t*(high-low))))}</text>`;}).join('');
  const circles=points.map((p,i)=>p.priceFen===null?'':`<circle cx="${x(i)}" cy="${y(p.priceFen)}" r="3.2" fill="#244fbc"><title>${esc(p.date)}：¥${money(p.priceFen)}，${esc(p.name)}</title></circle>`).join('');
  const dates=[0,14,29].map(i=>`<text x="${x(i)}" y="${H-7}" text-anchor="${i===0?'start':i===29?'end':'middle'}">${points[i].date.slice(5).replace('-','/')}</text>`).join('');
  const start=points[0].date;
  $(target).innerHTML=`<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}，近30天已记录${available.length}天，纵轴为人民币价格"><text x="${L}" y="11">元</text>${grid}<path d="${path}" fill="none" stroke="#244fbc" stroke-width="2" stroke-linejoin="round"/>${circles}${dates}</svg><details class="chart-data"><summary style="padding:0;font-size:11px">查看 ${available.length} 天数据</summary><table><caption>${esc(label)}：${start} 起的实际记录</caption><thead><tr><th>日期</th><th>最低价</th><th>对应商品</th></tr></thead><tbody>${available.map(p=>`<tr><td>${p.date}</td><td>¥${money(p.priceFen)}</td><td>${esc(p.name)}</td></tr>`).join('')}</tbody></table></details>`;
}
function renderStatus(){
  const state=$('#status');state.className='notice';
  let title,description;
  if(error){title='记录暂时读取失败';description='请点击“重新读取”再试一次。当前不展示无法确认的价格。';state.classList.add('error');}
  else if(!data.observations.length){title='价格数据待接入';description='网站已就绪，尚未连接授权价格数据源。目前没有真实报价或历史记录；接入后开始每日记录。';}
  else if(data.status==='error'){title='最近一次采集失败';description=`上次成功保存：${time(data.updatedAt)}。已有历史保留，今天未核实的价格不参与今日比较。`;state.classList.add('error');}
  else if(isStale(data)){title='价格记录需要更新';description=`最新一批记录来自 ${time(data.updatedAt)}，已经超过 36 小时。旧记录只用于历史查看。`;}
  else if(data.status==='partial'){title='部分商品已更新';description='本次未取得两类显卡的完整有货报价。以下只展示今天已核实的记录，未覆盖商品不代表无货。';}
  else{title='价格记录已更新';description='以下是北京地区今日已核实的有货报价。优惠因账号与活动而异，请核对每条价格的适用条件。';state.classList.add('ready');}
  state.innerHTML=`<span class="status-dot"></span><div><strong>${title}</strong><p>${esc(description)}</p></div>`;
  $('#updated').textContent=error?'读取失败，请重试':data.updatedAt?`最近成功保存 ${time(data.updatedAt)}`:'尚无成功采集记录';
}
function render(){
  renderStatus();const condition=$('#condition').value;
  const safe=data??{products:[],observations:[]};
  $('#summaries').innerHTML=GPUS.map(type=>{
    const rows=currentRows(safe,{gpu:type,condition}),best=rows[0];
    return `<article class="gpu-summary"><div class="summary-head"><h2>${type}</h2><span class="chip ${best?.record.isNewLow?'low':''}">${best?(best.record.isNewLow?'发现近期新低':`${rows.length} 款有货报价`):'暂无可比较报价'}</span></div>${best?`<div class="price"><small>¥</small>${money(best.quote.priceFen)}</div><p class="product-name">${esc(best.name)}</p><p class="condition-text">${esc(best.quote.conditions.join(' · '))}</p><p class="caption">${best.record.label} · 此口径此前记录 ${best.record.sampleDays} 天</p>`:`<div class="price empty">${error?'暂时无法读取':'等待真实报价'}</div><p class="caption">${safe.observations.length?'今天尚无符合当前口径的已核实有货报价。':'自营身份、北京库存与优惠条件核实后才显示价格。'}</p>`}</article>`;
  }).join('');
  if(!safe.observations.length)emptyCharts();else{drawChart('#chart-5080',series(safe,GPUS[0],condition),GPUS[0]);drawChart('#chart-5070',series(safe,GPUS[1],condition),GPUS[1]);}
  let rows=currentRows(safe,{gpu,condition,brand:$('#brand').value});
  const fullCount=rows.length;if($('#only-new').checked)rows=rows.filter(r=>r.record.isNewLow);
  if($('#sort').value==='drop')rows.sort((a,b)=>(b.record.low===null?-Infinity:b.record.low-b.quote.priceFen)-(a.record.low===null?-Infinity:a.record.low-a.quote.priceFen));
  $('#row-count').textContent=`${rows.length} 款`;
  const noData=!safe.observations.length;
  $('#highlights').innerHTML=rows.length?rows.slice(0,3).map(r=>`<article class="highlight-row"><div><h3>${esc(r.name)}</h3><p class="brand-meta">${esc(r.brand)} · ${r.gpu} · 京东自营</p><p class="condition-text">${esc(r.quote.conditions.join(' · '))}</p></div><div class="highlight-price">¥${money(r.quote.priceFen)}<span>${r.record.label}</span></div><a class="jd-link" href="${r.url}" target="_blank" rel="noopener noreferrer">去京东核对 ↗</a></article>`).join(''):`<div class="empty-products">${boxIcon}<h3>${error?'暂时无法显示商品':noData?'还没有可比较的商品':$('#only-new').checked&&fullCount?'当前筛选下，没有近期新低':'没有符合筛选条件的今日报价'}</h3><p>${noData?'当前候选范围为 11 个品牌。尚未核实的商品、价格和库存不会提前填入列表。':'可切换显卡类型、品牌或优惠口径。库存未知、无货以及今天未核实的报价不参与比较。'}</p>${noData?'<a href="#explain-title">了解价格记录规则</a>':''}</div>`;
  $('#rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.name)}<p>${esc(r.brand)} · ${r.gpu} · 京东自营</p></td><td>¥${money(r.quote.priceFen)}</td><td>${esc(r.quote.conditions.join('；'))}</td><td><span class="tag">${r.record.label}</span><p>${r.record.low===null?'此前暂无同条件记录':`此前最低 ¥${money(r.record.low)}`}<br>此前记录 ${r.record.sampleDays} / 30 天</p></td><td>${time(r.quote.observedAt)}</td><td><a href="${r.url}" target="_blank" rel="noopener noreferrer">去京东核对 ↗</a></td></tr>`).join(''):'<tr><td colspan="6" class="table-empty">暂无符合当前条件的今日报价。</td></tr>';
  $('#coverage-info').textContent=noData?'尚未接入授权价格数据源，没有真实报价或历史记录。':`已核实 ${safe.products.length} 个自营商品，累计 ${new Set(safe.observations.map(o=>o.date)).size} 个采集日期。最低价仅代表已覆盖商品，不代表京东全站最低。`;
}
async function load(){
  $('#reload').disabled=true;$('#reload').setAttribute('aria-busy','true');error=false;
  try{const response=await fetch('./data.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const next=validateData(await response.json());data=next;
    const old=$('#condition').value;$('#condition').replaceChildren(new Option('各商品最低已核实到手价',''));
    const conditions=new Map(next.observations.map(o=>[o.conditionKey,o.conditions.join(' + ')]));for(const [key,label]of conditions)$('#condition').add(new Option(label,key));
    if(conditions.has(old))$('#condition').value=old;
  }catch{data=null;error=true;}finally{$('#reload').disabled=false;$('#reload').removeAttribute('aria-busy');render();}
}
$('#brands').textContent=BRANDS.join(' / ');for(const b of BRANDS)$('#brand').add(new Option(b,b));
for(const control of ['#condition','#brand','#only-new','#sort'])$(control).addEventListener('change',render);
for(const button of document.querySelectorAll('[data-gpu]'))button.addEventListener('click',()=>{gpu=button.dataset.gpu;for(const b of document.querySelectorAll('[data-gpu]')){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));}render();});
$('#reload').addEventListener('click',load);load();
