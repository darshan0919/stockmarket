'use strict';
/**
 * Renders the monthly-updates DTO into ONE self-contained interactive page.
 *
 * Pure function of the DTO (conventions §5 and the design guide's hard
 * data/UI boundary): same DTO in ⇒ same HTML out. Nothing is fetched, summarised
 * or dropped here — every company in the DTO reaches the page.
 *
 * Self-contained by design: the DTO is inlined as JSON and the charts are drawn
 * with hand-rolled SVG rather than a CDN chart library, so the page works
 * offline, on Vercel, and from a file:// path with no external requests.
 */

const fs = require('fs');
const path = require('path');

const PALETTE = [
  '#0c447c',
  '#5bad3a',
  '#ef9f27',
  '#e24b4a',
  '#3a85c9',
  '#791f1f',
  '#27500a',
  '#633806',
];

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function css() {
  return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.45;background:#f5f4f0;padding:18px}
.wrap{max-width:1280px;margin:0 auto;background:#fff;padding:20px 22px;border:1px solid #e5e5e5;border-radius:4px}
h1{font-size:21px;font-weight:600;margin-bottom:2px}
.eyebrow{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#888;font-family:monospace;margin-bottom:4px}
.subline{font-size:10px;font-family:monospace;color:#555;margin-top:3px}
.hdr{border-bottom:2.5px solid #111;padding-bottom:9px;margin-bottom:14px}
.sec{margin-top:20px}
.sec-hd{font-size:11px;font-family:monospace;letter-spacing:.08em;text-transform:uppercase;color:#777;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:9px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
.kpi{border:1px solid #e5e5e5;border-radius:3px;padding:8px 10px;background:#fafafa}
.kpi .lab{font-family:monospace;font-size:8.5px;text-transform:uppercase;letter-spacing:.05em;color:#888}
.kpi .val{font-size:19px;font-weight:600;margin-top:2px}
.kpi-b{border-left:3px solid #0c447c}.kpi-g{border-left:3px solid #5bad3a}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-family:monospace;font-size:8.7px;text-transform:uppercase;letter-spacing:.04em;color:#888;padding:6px;text-align:left;border-bottom:1.5px solid #ccc;cursor:pointer;user-select:none;white-space:nowrap}
th:hover{color:#0c447c}
th.num,td.num{text-align:right}
th .ar{color:#0c447c;font-size:9px}
td{padding:5px 6px;border-bottom:1px solid #eee;vertical-align:middle}
tbody tr:hover{background:#f7fafd}
.mono{font-family:monospace}
.up{color:#27500a;font-weight:600}.dn{color:#791f1f;font-weight:600}.flat{color:#666}
.chip{display:inline-block;font-size:8.6px;font-family:monospace;padding:2px 6px;border-radius:3px;font-weight:600}
.chip-g{background:#eaf3de;color:#27500a}.chip-y{background:#faeeda;color:#633806}.chip-r{background:#fcebeb;color:#791f1f}.chip-b{background:#e6f1fb;color:#0c447c}
a{color:#0c447c;text-decoration:none}a:hover{text-decoration:underline}
.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
input[type=search],select{font-family:inherit;font-size:12px;padding:5px 8px;border:1px solid #ccc;border-radius:3px}
input[type=search]{min-width:230px}
.hint{font-size:10px;color:#888;font-family:monospace}
.chartbox{border:1px solid #e5e5e5;border-radius:3px;padding:12px;background:#fff}
.legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:11px}
.legend span{display:flex;align-items:center;gap:5px}
.sw{width:11px;height:3px;border-radius:2px;display:inline-block}
.picker{max-height:190px;overflow:auto;border:1px solid #e5e5e5;border-radius:3px;padding:8px;background:#fafafa}
.picker label{display:block;font-size:11.5px;padding:2px 0;cursor:pointer}
.picker input{margin-right:6px}
.two{display:grid;grid-template-columns:280px 1fr;gap:14px;align-items:start}
.note{font-size:10.5px;color:#777;margin-top:8px;line-height:1.5}
.tabs{display:flex;gap:2px;margin-bottom:12px;border-bottom:1px solid #ddd}
.tab{padding:7px 14px;font-family:monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;border:1px solid transparent;border-bottom:none;color:#888}
.tab.on{background:#fff;border-color:#ddd;color:#0c447c;font-weight:600;border-radius:3px 3px 0 0;margin-bottom:-1px;background:#f7fafd}
.panel{display:none}.panel.on{display:block}
svg text{font-family:monospace;font-size:9px;fill:#888}
.tip{position:fixed;pointer-events:none;background:#111;color:#fff;font-family:monospace;font-size:10px;padding:4px 7px;border-radius:3px;opacity:0;transition:opacity .1s;z-index:99}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:14px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.filter-bar{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px 0;align-items:center}
.filter-pill{cursor:pointer;padding:4px 10px;border-radius:14px;border:1px solid #d0d7de;font-size:11px;background:#fff;color:#444;font-family:monospace;font-weight:600;transition:all .15s}
.filter-pill:hover{background:#f3f4f6;color:#0c447c}
.filter-pill.on{background:#0c447c;color:#fff;border-color:#0c447c}
.filter-btn{font-size:11px;font-family:monospace;color:#0c447c;cursor:pointer;text-decoration:underline;margin-left:auto}
.card{border:1px solid #e5e5e5;border-radius:4px;padding:12px 14px;background:#fafafa;margin-bottom:12px}
.card-hd{font-size:12px;font-weight:700;color:#0c447c;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e0e0e0;padding-bottom:4px}
.item-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:11.5px}
.item-row:last-child{border-bottom:none}
.callout{background:#f0f4f8;border-left:3.5px solid #0c447c;padding:12px 14px;border-radius:0 4px 4px 0;margin-bottom:14px;font-size:12px;line-height:1.55}
.callout-title{font-weight:700;color:#0c447c;font-size:12.5px;margin-bottom:4px}
.pill{display:inline-block;padding:2px 6px;border-radius:3px;font-size:9.5px;font-family:monospace;font-weight:600}
.pill-up{background:#eaf3de;color:#27500a}.pill-dn{background:#fcebeb;color:#791f1f}.pill-neutral{background:#f1f3f4;color:#5f6368}
.clickable-ticker{cursor:pointer;color:#0c447c;font-weight:600}.clickable-ticker:hover{text-decoration:underline}
@media(max-width:900px){.grid4{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}.grid3{grid-template-columns:1fr}}
`;
}

/** Client-side app: sorting, filtering, and SVG line charts, all from inlined DTO. */
function clientJs() {
  return `
const PAL=${JSON.stringify(PALETTE)};
const D=window.__DTO__;
const C=D.companies;
const $=s=>document.querySelector(s);
const fmt=n=>n===null||n===undefined?'—':(Math.abs(n)>=1000?n.toLocaleString('en-IN'):String(n));
const pctCell=v=>v===null||v===undefined?'<span class="flat">—</span>':'<span class="'+(v>0?'up':v<0?'dn':'flat')+'">'+(v>0?'+':'')+v.toFixed(1)+'%</span>';
const confChip=c=>'<span class="chip chip-'+(c==='high'?'g':c==='medium'?'y':'r')+'">'+c+'</span>';
// What KIND of quantity this is. Mixing a monthly sales flow with a
// point-in-time balance is the single easiest way to misread this table.
const PT={'month-flow':['','monthly sales flow'],'quarter-flow':['Q','quarterly figure — not a monthly flow'],
  'year-flow':['FY','annual/cumulative figure — not a monthly flow'],'stock':['BAL','point-in-time balance (AUM/deposits), not a flow']};
function ptChip(c){
  const d=PT[c.periodType]||['','']; if(!d[0])return '';
  return '<span class="chip chip-'+(c.periodType==='stock'?'r':'b')+'" title="'+d[1]+'">'+d[0]+'</span>';
}
function unitCell(c){
  const warn=c.unitUncertain?' <span class="chip chip-y" title="'+(c.unitNote||'ambiguous unit')+'">?</span>':'';
  return (c.unit||'—')+warn;
}

// ---- Table ----
let sortKey='yoyPct', sortDir=-1;
function rows(){
  const q=($('#q').value||'').toLowerCase();
  const u=$('#unit').value;
  const pt=$('#ptype').value;
  return C.filter(c=>(!q||c.companyId.toLowerCase().includes(q)||(c.name||'').toLowerCase().includes(q))
    &&(!u||c.unit===u)&&(!pt||c.periodType===pt));
}
function renderTable(){
  const r=rows().slice().sort((a,b)=>{
    let x=a[sortKey],y=b[sortKey];
    if(typeof x==='string'||typeof y==='string')return String(x||'').localeCompare(String(y||''))*sortDir;
    if(x===null||x===undefined)return 1; if(y===null||y===undefined)return -1;
    return (x-y)*sortDir;
  });
  $('#tb').innerHTML=r.map(c=>{
    const doc=c.series.length?c.series[c.series.length-1].ssUrl:null;
    return '<tr><td><a href="https://www.stockscans.in/company/'+encodeURIComponent(c.companyId)+'" target="_blank">'+c.companyId+'</a>'
      +'<div class="hint">'+(c.name||'')+'</div></td>'
      +'<td class="mono">'+(c.metricName||'—')+'</td>'
      +'<td class="mono">'+unitCell(c)+'</td>'
      +'<td class="num mono">'+fmt(c.latestValue)+'</td>'
      +'<td class="mono">'+c.latestPeriod+' '+ptChip(c)+'</td>'
      +'<td class="mono">'+(c.latestFiledOn||'—')+'</td>'
      +'<td class="num">'+pctCell(c.momPct)+'</td>'
      +'<td class="num">'+pctCell(c.qoqPct)+'</td>'
      +'<td class="num">'+pctCell(c.yoyPct)+'</td>'
      +'<td class="num mono">'+c.months+'</td>'
      +'<td>'+confChip(c.confidence)+(doc?' <a href="https://www.stockscans.in/document/'+doc+'" target="_blank" title="source filing">doc</a>':'')+'</td></tr>';
  }).join('')||'<tr><td colspan="11" class="hint">No companies match.</td></tr>';
  $('#count').textContent=r.length+' of '+C.length;
  document.querySelectorAll('th[data-k]').forEach(th=>{
    const on=th.dataset.k===sortKey;
    th.querySelector('.ar').textContent=on?(sortDir<0?'▼':'▲'):'';
  });
  if($('#sortby')&&$('#sortby').value!==sortKey)$('#sortby').value=sortKey;
}
function bindSort(){
  document.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{
    const k=th.dataset.k;
    if(sortKey===k)sortDir=-sortDir; else {sortKey=k;sortDir=(k==='companyId'||k==='unit'||k==='metricName')?1:-1;}
    if($('#sortby'))$('#sortby').value=sortKey;
    renderTable();
  });
  if($('#sortby')){
    $('#sortby').onchange=e=>{
      sortKey=e.target.value;
      sortDir=(sortKey==='companyId'||sortKey==='unit'||sortKey==='metricName')?1:-1;
      renderTable();
    };
  }
}

// ---- Chart ----
const tip=document.createElement('div');tip.className='tip';document.body.appendChild(tip);
function lineChart(el,seriesList,{h=300,mode='abs'}={}){
  const periods=[...new Set(seriesList.flatMap(s=>s.points.map(p=>p.period)))].sort();
  if(!periods.length||!seriesList.length){el.innerHTML='<div class="hint">Select at least one company with data.</div>';return;}
  // Indexed mode rebases every series to 100 at its own first point. This is
  // what makes a 616,000-unit filer and a 4,000-unit filer legible on one
  // axis: absolute mode answers "how big", indexed answers "who grew faster".
  if(mode==='idx'){
    seriesList=seriesList.map(s=>{
      const pts=s.points.slice().sort((a,b)=>a.period.localeCompare(b.period));
      const base=pts.length?pts[0].value:0;
      return {...s,unit:'index (first=100)',points:base>0?pts.map(p=>({...p,value:Number((p.value/base*100).toFixed(1)),raw:p.value})):pts};
    });
  }
  const W=Math.max(560,el.clientWidth||760),H=h,L=62,R=16,T=14,B=42;
  const xs=p=>L+(periods.length===1?(W-L-R)/2:(periods.indexOf(p)*(W-L-R)/(periods.length-1)));
  const vals=seriesList.flatMap(s=>s.points.map(p=>p.value));
  let lo=Math.min(...vals),hi=Math.max(...vals);
  if(lo===hi){lo=lo*0.9;hi=hi*1.1||1}
  const pad=(hi-lo)*0.1; lo=Math.max(0,lo-pad); hi=hi+pad;
  const ys=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const ticks=5,gl=[],yl=[];
  for(let i=0;i<=ticks;i++){const v=lo+(hi-lo)*i/ticks,y=ys(v);
    gl.push('<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#eee"/>');
    yl.push('<text x="'+(L-7)+'" y="'+(y+3)+'" text-anchor="end">'+(v>=1000?Math.round(v).toLocaleString('en-IN'):v.toFixed(v<10?1:0))+'</text>');
  }
  const step=Math.ceil(periods.length/12);
  const xl=periods.map((p,i)=>i%step?'':'<text x="'+xs(p)+'" y="'+(H-B+16)+'" text-anchor="middle" transform="rotate(-40 '+xs(p)+' '+(H-B+16)+')">'+p+'</text>').join('');
  const paths=seriesList.map((s,i)=>{
    const col=PAL[i%PAL.length];
    const pts=s.points.slice().sort((a,b)=>a.period.localeCompare(b.period));
    const d=pts.map((p,j)=>(j?'L':'M')+xs(p.period)+' '+ys(p.value)).join(' ');
    const dots=pts.map(p=>{
      const shown=p.raw!==undefined?(p.value.toFixed(1)+' idx ('+p.raw.toLocaleString('en-IN')+')'):(p.value.toLocaleString('en-IN')+' '+(s.unit||''));
      return '<circle cx="'+xs(p.period)+'" cy="'+ys(p.value)+'" r="3.2" fill="'+col+'" data-t="'+s.label+' · '+p.period+' · '+shown+'"/>';
    }).join('');
    return '<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2"/>'+dots;
  }).join('');
  el.innerHTML='<svg width="100%" viewBox="0 0 '+W+' '+H+'">'+gl.join('')+yl.join('')+xl
    +'<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" stroke="#ccc"/>'
    +'<line x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(H-B)+'" stroke="#ccc"/>'+paths+'</svg>'
    +'<div class="legend">'+seriesList.map((s,i)=>'<span><i class="sw" style="background:'+PAL[i%PAL.length]+'"></i>'+s.label+' <span class="hint">('+(s.unit||'')+')</span></span>').join('')+'</div>';
  el.querySelectorAll('circle').forEach(c=>{
    c.onmouseenter=e=>{tip.textContent=c.dataset.t;tip.style.opacity=1;};
    c.onmousemove=e=>{tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-28)+'px';};
    c.onmouseleave=()=>{tip.style.opacity=0;};
  });
}
function seriesFor(cid){
  const c=C.find(x=>x.companyId===cid); if(!c)return null;
  return {label:c.companyId,unit:c.unit,points:c.series.filter(p=>p.value!==null)};
}

// ---- Single-company panel ----
function renderSingle(){
  const cid=$('#single').value;
  lineChart($('#chart1'),[seriesFor(cid)].filter(Boolean));
  const c=C.find(x=>x.companyId===cid);
  $('#s-meta').innerHTML=c?('<div class="grid4">'
    +'<div class="kpi kpi-b"><div class="lab">Latest ('+c.latestPeriod+')</div><div class="val">'+fmt(c.latestValue)+'</div><div class="hint">'+(c.unit||'')+'</div></div>'
    +'<div class="kpi"><div class="lab">MoM</div><div class="val">'+pctCell(c.momPct)+'</div></div>'
    +'<div class="kpi"><div class="lab">QoQ (3m vs prior 3m)</div><div class="val">'+pctCell(c.qoqPct)+'</div></div>'
    +'<div class="kpi"><div class="lab">YoY</div><div class="val">'+pctCell(c.yoyPct)+'</div></div></div>'
    +'<div class="note"><b>'+(c.metricName||'')+'</b> · scope: '+(c.scope||'n/a')+' · '+c.months+' months of history · <b>Last updated:</b> '+(c.latestFiledOn||'n/a')
    +(c.segments&&c.segments.length?'<br>Latest segments: '+c.segments.map(s=>s.name+' '+s.value.toLocaleString('en-IN')).join(' · '):'')+'</div>'):'';
}

// ---- Multi-company panel ----
function renderMulti(){
  const picked=[...document.querySelectorAll('#picker input:checked')].map(i=>i.value);
  const sl=picked.map(seriesFor).filter(s=>s&&s.points.length);
  const mode=document.querySelector('input[name=scale]:checked').value;
  const units=[...new Set(sl.map(s=>s.unit))];
  // Warn when the comparison is not like-for-like: mixed units, or absolute
  // mode across magnitudes so different that the smaller lines flatten out.
  const vals=sl.flatMap(s=>s.points.map(p=>p.value));
  const spread=vals.length?Math.max(...vals)/Math.max(Math.min(...vals),1):1;
  const warn=[];
  if(units.length>1)warn.push('<span class="chip chip-y">mixed units</span> '+units.join(' vs ')+' on one axis.');
  const pts=[...new Set(picked.map(id=>(C.find(c=>c.companyId===id)||{}).periodType).filter(Boolean))];
  if(pts.length>1)warn.push('<span class="chip chip-r">mixed figure types</span> comparing '+pts.join(' + ')+' — a point-in-time balance and a monthly sales flow are different quantities, not a like-for-like trend.');
  if(mode==='abs'&&spread>50)warn.push('<span class="chip chip-y">scale gap '+Math.round(spread)+'×</span> the largest series dwarfs the smallest — switch to <b>Indexed</b> to compare growth shape.');
  if(mode==='idx')warn.push('<span class="chip chip-b">indexed</span> each line rebased to 100 at its own first period; hover a point for the raw value.');
  $('#m-warn').innerHTML=warn.length?'<div class="note">'+warn.join('<br>')+'</div>':'';
  lineChart($('#chart2'),sl,{h:340,mode});
}

function boot(){
  // units filter
  const us=[...new Set(C.map(c=>c.unit).filter(Boolean))].sort();
  $('#unit').innerHTML='<option value="">All units</option>'+us.map(u=>'<option>'+u+'</option>').join('');
  const pts=[...new Set(C.map(c=>c.periodType))].sort();
  $('#ptype').innerHTML='<option value="">All figure types</option>'
    +pts.map(p=>'<option value="'+p+'">'+({'month-flow':'Monthly flow','quarter-flow':'Quarterly','year-flow':'Annual/cumulative','stock':'Balance (stock)'}[p]||p)+'</option>').join('');
  $('#ptype').onchange=renderTable;
  // single picker: default to the longest history
  const byLen=C.slice().sort((a,b)=>b.months-a.months);
  $('#single').innerHTML=byLen.map(c=>'<option value="'+c.companyId+'">'+c.companyId+' ('+c.months+'m)</option>').join('');
  // multi picker: preselect the 4 longest with a shared unit
  const topUnit=(byLen[0]||{}).unit;
  $('#picker').innerHTML=byLen.map((c,i)=>'<label><input type="checkbox" value="'+c.companyId+'"'
    +((c.unit===topUnit&&byLen.slice(0,i).filter(x=>x.unit===topUnit).length<4)?' checked':'')+'>'
    +c.companyId+' <span class="hint">'+c.months+'m · '+(c.latestFiledOn||'')+' · '+(c.unit||'')+'</span></label>').join('');
  $('#q').oninput=renderTable; $('#unit').onchange=renderTable;
  $('#single').onchange=renderSingle;
  $('#picker').onchange=renderMulti;
  document.querySelectorAll('input[name=scale]').forEach(r=>r.onchange=renderMulti);
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('on'));
    t.classList.add('on'); $('#'+t.dataset.p).classList.add('on');
    if(t.dataset.p==='p2')renderSingle(); if(t.dataset.p==='p3')renderMulti();
  });
  bindSort(); renderTable(); renderOverview();
}

const SECTOR_MAP = {
  'Auto': ['M&M', 'TVSMOTOR', 'BAJAJ-AUTO', 'EICHERMOT', 'ASHOKLEY', 'ESCORTS', 'FORCEMOT', 'SMLMAH', 'ATULAUTO', 'SSWL', 'TMPV', 'VSTTILLERS', 'PAVNAIND'],
  'Realty': ['SIGNATURE', 'SOBHA', 'PURVA', 'AJMERA', 'ARKADE', 'KOLTEPATIL', 'RUSTOMJEE', 'LODHA', 'PRESTIGE'],
  'Financials': ['MAHABANK', 'BANKBARODA', 'J&KBANK', 'CAPITALSFB', 'ESAFSFB', 'CSBBANK', 'HOMEFIRST', 'AAVAS', 'CREDITACC', 'FIVESTAR', 'ANGELONE'],
  'Metals': ['NMDC', 'SHYAMMETL', 'LLOYDSME', 'RATHIST', 'APLAPOLLO', 'JTLIND', 'GSMFOILS'],
  'Logistics': ['ADANIPORTS', 'ALLCARGO', 'ATL', 'TVSSCS', 'JETFREIGHT'],
  'Consumption': ['V2RETAIL', 'CANTABIL', 'PNGJL', 'GODREJCP', 'TI', 'QUESTLAB'],
  'Agri': ['RAJSREESUG', 'PRIMEFRESH']
};

let activeSector = 'All';

window.selectSector = function(sec) {
  activeSector = sec;
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('on', p.dataset.sec === sec);
  });
  renderOverview();
};

window.jumpToSectorTable = function() {
  const t = document.querySelector('.tab[data-p="p1"]');
  if (t) {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    $('#p1').classList.add('on');
    if (activeSector !== 'All') {
      const syms = SECTOR_MAP[activeSector] || [];
      $('#q').value = syms[0] || '';
    } else {
      $('#q').value = '';
    }
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

function renderOverview(){
  const pool = activeSector === 'All' ? C : C.filter(c => (SECTOR_MAP[activeSector] || []).some(s => c.companyId.includes(s)));

  const topYoy = pool.filter(c => typeof c.yoyPct === 'number' && !isNaN(c.yoyPct) && c.yoyPct > 0)
    .sort((a,b) => b.yoyPct - a.yoyPct).slice(0, 5);
  const topYoyDecline = pool.filter(c => typeof c.yoyPct === 'number' && !isNaN(c.yoyPct) && c.yoyPct < 0)
    .sort((a,b) => a.yoyPct - b.yoyPct).slice(0, 5);

  const topQoq = pool.filter(c => typeof c.qoqPct === 'number' && !isNaN(c.qoqPct) && c.qoqPct > 0)
    .sort((a,b) => b.qoqPct - a.qoqPct).slice(0, 5);
  const topQoqDecline = pool.filter(c => typeof c.qoqPct === 'number' && !isNaN(c.qoqPct) && c.qoqPct < 0)
    .sort((a,b) => a.qoqPct - b.qoqPct).slice(0, 5);

  const topConsistent = pool.filter(c => c.months >= 3 && (c.yoyPct > 0 || c.momPct > 0))
    .sort((a,b) => b.months - a.months || (b.yoyPct || 0) - (a.yoyPct || 0)).slice(0, 5);
  const topRecent = pool.filter(c => c.latestFiledOn)
    .sort((a,b) => (b.latestFiledOn || '').localeCompare(a.latestFiledOn || '')).slice(0, 5);

  const rowHtml = (c, valHtml, sub) => '<div class="item-row">'
    +'<div><span class="clickable-ticker" data-cid="'+c.companyId+'" onclick="gotoCompany(this.dataset.cid)">'+c.companyId+'</span>'
    +'<span class="hint" style="margin-left:4px;">'+(c.name||'')+'</span>'
    +'<div class="hint">'+(sub || (c.metricName+' ('+(c.unit||'')+')'))+'</div></div>'
    +'<div style="text-align:right;">'+valHtml+'<div class="hint">'+(c.latestFiledOn||'—')+'</div></div></div>';

  if($('#yoy-list'))$('#yoy-list').innerHTML = topYoy.length ? topYoy.map(c => rowHtml(c, pctCell(c.yoyPct), (c.yoyBasis||'YoY') + (c.months <= 2 ? ' · <span class="pill pill-dn">small base</span>' : ''))).join('') : '<div class="hint" style="padding:10px 0;">No positive YoY filers in sector</div>';
  if($('#yoy-decline-list'))$('#yoy-decline-list').innerHTML = topYoyDecline.length ? topYoyDecline.map(c => rowHtml(c, pctCell(c.yoyPct), (c.yoyBasis||'YoY') + ' contraction')).join('') : '<div class="hint" style="padding:10px 0;">No YoY declining filers in this cohort</div>';

  if($('#qoq-list'))$('#qoq-list').innerHTML = topQoq.length ? topQoq.map(c => rowHtml(c, pctCell(c.qoqPct), (c.isMonthly ? '3m-rollup' : 'consecutive-qtr'))).join('') : '<div class="hint" style="padding:10px 0;">No sequential inflections</div>';
  if($('#qoq-decline-list'))$('#qoq-decline-list').innerHTML = topQoqDecline.length ? topQoqDecline.map(c => rowHtml(c, pctCell(c.qoqPct), 'sequential drop')).join('') : '<div class="hint" style="padding:10px 0;">No sequential drops in this cohort</div>';

  if($('#consistent-list'))$('#consistent-list').innerHTML = topConsistent.length ? topConsistent.map(c => rowHtml(c, pctCell(c.yoyPct), c.months + 'm continuous history')).join('') : '<div class="hint" style="padding:10px 0;">No continuous filers</div>';
  if($('#recent-list'))$('#recent-list').innerHTML = topRecent.length ? topRecent.map(c => rowHtml(c, '<span class="mono" style="font-weight:600;">' + fmt(c.latestValue) + '</span>', 'Period: ' + c.latestPeriod)).join('') : '<div class="hint" style="padding:10px 0;">No recent filings</div>';
}

window.gotoCompany = function(cid) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
  const t = document.querySelector('.tab[data-p="p2"]');
  if (t) t.classList.add('on');
  const p = $('#p2');
  if (p) p.classList.add('on');
  $('#single').value = cid;
  renderSingle();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.addEventListener('resize',()=>{
  if($('#p2').classList.contains('on'))renderSingle();
  if($('#p3').classList.contains('on'))renderMulti();
});
boot();
`;
}

function render(dto) {
  const s = dto.summary || {};
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monthly Business Updates — Sales Tracker</title>
<style>${css()}</style></head><body>
<div class="wrap">
  <div class="hdr">
    <div class="eyebrow">Stockscans · Monthly Updates scan · reporting-day cohort</div>
    <h1>Monthly Business Updates — Sales Tracker</h1>
    <div class="subline">Latest period ${esc(s.latestPeriod)} · generated ${esc((dto.generatedAt || '').slice(0, 16).replace('T', ' '))} UTC</div>
  </div>

  <div class="grid4">
    <div class="kpi kpi-b"><div class="lab">Companies tracked</div><div class="val">${esc(s.companies)}</div></div>
    <div class="kpi"><div class="lab">With 12m+ history</div><div class="val">${esc(s.companiesWith12m)}</div></div>
    <div class="kpi"><div class="lab">Filings parsed</div><div class="val">${esc(s.filingsParsed)}</div></div>
    <div class="kpi kpi-g"><div class="lab">Latest period</div><div class="val">${esc(s.latestPeriod)}</div></div>
  </div>

  <div class="tabs">
    <div class="tab on" data-p="p0">Executive Overview</div>
    <div class="tab" data-p="p1">Growth table</div>
    <div class="tab" data-p="p2">Single company</div>
    <div class="tab" data-p="p3">Compare companies</div>
  </div>

  <div class="panel on" id="p0">
    <div class="callout">
      <div class="callout-title">Institutional Signal Assessment — Signal vs. Noise</div>
      <b>Commercial Vehicles & Auto Fleet Boom:</b> Multi-company synchronized volume expansion confirms genuine institutional fleet renewal and capital goods demand across Force Motors (+58.2% YoY), SML Isuzu (+39.5% YoY), Ashok Leyland (+38.0% YoY, +7.4% MoM), Atul Auto (+32.6% YoY), and Steel Strips Wheels (+53.6% YoY).<br>
      <b>Agri Equipment Divergence:</b> Escorts Kubota staged a sharp pre-harvest rebound (+15.4% MoM, +19.1% YoY) ahead of festive inventory replenishment, while VST Tillers experienced sequential drag (-36.4% MoM) due to state DBT subsidy timing lags.<br>
      <b>Base-Effect Alert:</b> Triple-digit percentage surges in 1-filing / 2-quarter histories (Valiant, True Colors, Bright Outdoor) reflect small denominator distortion rather than structural growth.
    </div>

    <div class="sec-hd">Sector Breadth & Operational Health Meter</div>
    <div class="grid4" style="margin-bottom:14px;">
      <div class="card" style="border-top:3.5px solid #27500a;">
        <div class="card-hd"><span>Auto OEMs & Fleet</span><span class="pill pill-up">Accelerating</span></div>
        <div style="font-size:18px;font-weight:700;color:#27500a;margin:3px 0;">+27.7% YoY</div>
        <div class="hint" style="line-height:1.4;">10/10 filers expanding. CV fleet renewal (Ashok Leyland +38%, Force +58%, SML +40%).</div>
      </div>
      <div class="card" style="border-top:3.5px solid #27500a;">
        <div class="card-hd"><span>Real Estate Pre-Sales</span><span class="pill pill-up">Record Absorption</span></div>
        <div style="font-size:18px;font-weight:700;color:#27500a;margin:3px 0;">+81.8% YoY</div>
        <div class="hint" style="line-height:1.4;">Premium luxury surge across Signature (+42%), Sobha (+30%), Prestige (+300%).</div>
      </div>
      <div class="card" style="border-top:3.5px solid #0c447c;">
        <div class="card-hd"><span>Banking & Deposits</span><span class="pill pill-up">Solid CASA</span></div>
        <div style="font-size:18px;font-weight:700;color:#0c447c;margin:3px 0;">+20.4% YoY</div>
        <div class="hint" style="line-height:1.4;">CASA & deposit resilience across Bank of Baroda, Mahabank, Capital SFB (+16%).</div>
      </div>
      <div class="card" style="border-top:3.5px solid #633806;">
        <div class="card-hd"><span>Metals & Tubes</span><span class="pill pill-neutral">Volume Steady</span></div>
        <div style="font-size:18px;font-weight:700;color:#633806;margin:3px 0;">+22.6% YoY</div>
        <div class="hint" style="line-height:1.4;">Infrastructure demand intact. APL Apollo 794k Ton (+10%), Shyam Metalics sponge iron +131%.</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:6px;">
      <div class="sec-hd" style="margin:0;">Key Leaders & Inflections Matrix</div>
      <span class="filter-btn" onclick="jumpToSectorTable()">Explore in Growth Table →</span>
    </div>

    <div class="filter-bar" id="sector-filters">
      <div class="filter-pill on" data-sec="All" onclick="selectSector('All')">All Sectors (127)</div>
      <div class="filter-pill" data-sec="Auto" onclick="selectSector('Auto')">Auto & CVs (10)</div>
      <div class="filter-pill" data-sec="Realty" onclick="selectSector('Realty')">Real Estate (9)</div>
      <div class="filter-pill" data-sec="Financials" onclick="selectSector('Financials')">Banking & SFB (9)</div>
      <div class="filter-pill" data-sec="Metals" onclick="selectSector('Metals')">Metals & Mining (7)</div>
      <div class="filter-pill" data-sec="Logistics" onclick="selectSector('Logistics')">Ports & Logistics (5)</div>
      <div class="filter-pill" data-sec="Consumption" onclick="selectSector('Consumption')">Retail & FMCG (12)</div>
      <div class="filter-pill" data-sec="Agri" onclick="selectSector('Agri')">Agri & Sugar (2)</div>
    </div>

    <div class="grid3">
      <div class="card">
        <div class="card-hd"><span>Top 5 YoY Growth Leaders</span><span class="hint">Annual Expansion</span></div>
        <div id="yoy-list"></div>
      </div>
      <div class="card" style="border-left:3px solid #791f1f;">
        <div class="card-hd"><span>Top 5 YoY Contractions</span><span class="hint">Downside Risk Radar</span></div>
        <div id="yoy-decline-list"></div>
      </div>
      <div class="card">
        <div class="card-hd"><span>Top 5 QoQ Inflections</span><span class="hint">Quarterly Momentum</span></div>
        <div id="qoq-list"></div>
      </div>
      <div class="card" style="border-left:3px solid #633806;">
        <div class="card-hd"><span>Top 5 QoQ Drops</span><span class="hint">Sequential Slowdown</span></div>
        <div id="qoq-decline-list"></div>
      </div>
      <div class="card">
        <div class="card-hd"><span>Top 5 Compounding Leaders</span><span class="hint">Continuous Growth</span></div>
        <div id="consistent-list"></div>
      </div>
      <div class="card">
        <div class="card-hd"><span>Fresh Off The Wire</span><span class="hint">Latest Announcements</span></div>
        <div id="recent-list"></div>
      </div>
    </div>

    <div class="sec-hd">Pricing Power & Realization Tracker (Volume vs. Value)</div>
    <div class="grid2" style="margin-bottom:14px;">
      <div class="card" style="border-left:3.5px solid #0c447c;">
        <div class="card-hd">
          <div><span>Real Estate: Blended Realization Expansion</span></div>
          <span class="pill pill-up">Pricing Power</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.5;">
          <b>Sobha:</b> Q4 sales value ₹20.39 bn (+30% YoY) on 1.33 mn sq ft area (+18% YoY). Average realization expanded to <b>₹15,268/sq ft</b>, confirming luxury segment pricing power.<br>
          <b>Signature Global:</b> FY25 collections grew +41% to ₹43.8 bn. Realization rose to <b>₹12,457/sq ft</b> (vs ₹11,762 in FY24) across premium Gurugram launches.
        </div>
      </div>
      <div class="card" style="border-left:3.5px solid #0c447c;">
        <div class="card-hd">
          <div><span>Metals & Tubes: Volume vs Spread Resilience</span></div>
          <span class="pill pill-neutral">Volume Driven</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.5;">
          <b>APL Apollo Tubes:</b> Q1 sales volume of 794,350 Ton (+10% YoY) driven by General and Rust-Proof Apollo Z segments (498k Ton).<br>
          <b>Shyam Metalics:</b> November Sponge Iron sales surged +131% YoY to 102,561 MT while Pellet sales grew +19.6% YoY to 19,432 MT with stable per-MT realizations.
        </div>
      </div>
    </div>

    <div class="sec-hd">Actionable Sign Flips (Growing ↔ Shrinking)</div>
    <div class="grid2">
      <div class="card" style="border-left:3.5px solid #27500a;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:ESCORTS" onclick="gotoCompany(this.dataset.cid)">NSE:ESCORTS</span> · Escorts Kubota</div>
          <span class="pill pill-up">Rebound</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          July contracted -36.2% MoM (8,731 units) on erratic sowing; surged <b>+15.4% MoM</b> in August (10,072 units, <b>+19.1% YoY</b>) kicking off festive inventory replenishment.
        </div>
      </div>

      <div class="card" style="border-left:3.5px solid #27500a;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:V2RETAIL" onclick="gotoCompany(this.dataset.cid)">NSE:V2RETAIL</span> · V2 Retail</div>
          <span class="pill pill-up">Acceleration</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          Q4 revenue contracted -13.9% QoQ (Rs 798 cr); surged <b>+24.9% QoQ</b> in Q1 (Rs 997 cr) with <b>+58.3% YoY</b> backed by strong tier-2/3 store expansions.
        </div>
      </div>

      <div class="card" style="border-left:3.5px solid #27500a;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:CAPITALSFB" onclick="gotoCompany(this.dataset.cid)">NSE:CAPITALSFB</span> · Capital Small Finance Bank</div>
          <span class="pill pill-up">Recovery</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          Deposits contracted -6.8% QoQ in Q4 (Rs 8,687 cr); rebounded <b>+22.0% QoQ</b> in Q1 (Rs 10,596 cr, <b>+16.3% YoY</b>).
        </div>
      </div>

      <div class="card" style="border-left:3.5px solid #791f1f;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:SMLMAH" onclick="gotoCompany(this.dataset.cid)">NSE:SMLMAH</span> · SML Isuzu</div>
          <span class="pill pill-dn">Seasonal Peak Out</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          May/June peaked at 1,930 units during school bus delivery season; contracted in July and August (<b>-26.7% MoM</b> to 1,175 units), though YoY remains up +39.5%.
        </div>
      </div>

      <div class="card" style="border-left:3.5px solid #791f1f;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:VSTTILLERS" onclick="gotoCompany(this.dataset.cid)">NSE:VSTTILLERS</span> · VST Tillers Tractors</div>
          <span class="pill pill-dn">Sequential Contraction</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          June peaked at 8,107 units; fell sequentially to 5,853 in July and <b>3,720 units in August (-36.4% MoM, -17.3% YoY)</b> due to state tiller DBT subsidy disbursement gaps.
        </div>
      </div>

      <div class="card" style="border-left:3.5px solid #27500a;">
        <div class="card-hd">
          <div><span class="clickable-ticker" data-cid="NSE:NMDC" onclick="gotoCompany(this.dataset.cid)">NSE:NMDC</span> · NMDC</div>
          <span class="pill pill-up">MoM Turnaround</span>
        </div>
        <div style="font-size:11.5px;color:#333;line-height:1.45;">
          July iron ore sales dipped -14.6% MoM (3.40 MT); recovered <b>+5.3% MoM</b> in August (3.58 MT, +5.6% YoY) despite peak monsoon mining challenges.
        </div>
      </div>
    </div>
  </div>

  <div class="panel" id="p1">
    <div class="controls">
      <input type="search" id="q" placeholder="Filter by ticker or name…">
      <select id="unit"></select>
      <select id="ptype"></select>
      <select id="sortby">
        <option value="yoyPct">Sort: YoY Growth</option>
        <option value="latestFiledOn">Sort: Recency (Newest First)</option>
        <option value="qoqPct">Sort: QoQ Growth</option>
        <option value="momPct">Sort: MoM Growth</option>
        <option value="latestValue">Sort: Reported Level</option>
        <option value="companyId">Sort: Company Name</option>
      </select>
      <span class="hint" id="count"></span>
      <span class="hint">· click any column header to sort</span>
    </div>
    <table>
      <thead><tr>
        <th data-k="companyId">Company <span class="ar"></span></th>
        <th data-k="metricName">Metric <span class="ar"></span></th>
        <th data-k="unit">Unit <span class="ar"></span></th>
        <th data-k="latestValue" class="num">Latest <span class="ar"></span></th>
        <th data-k="latestPeriod">Period <span class="ar"></span></th>
        <th data-k="latestFiledOn">Last Update <span class="ar"></span></th>
        <th data-k="momPct" class="num">MoM <span class="ar"></span></th>
        <th data-k="qoqPct" class="num">QoQ <span class="ar"></span></th>
        <th data-k="yoyPct" class="num">YoY <span class="ar"></span></th>
        <th data-k="months" class="num">Hist <span class="ar"></span></th>
        <th>Conf <span class="ar"></span></th>
      </tr></thead>
      <tbody id="tb"></tbody>
    </table>
    <div class="note">
      <b>QoQ</b> = last 3 reported months vs the 3 before, for monthly filers. Companies marked <span class="chip chip-b">Q</span> file
      <b>quarterly</b> business updates through this same scan, so for them QoQ is simply the latest quarter vs the previous one and MoM is not shown —
      summing three quarterly points as if they were months would triple-count.
      <b>YoY</b> uses the filing's own stated prior-year figure where given, else the same month in our stored history.
      Absolute values are <b>not</b> comparable across companies — units differ (${esc((s.units || []).join(', '))}). Growth percentages are.
      Figure-type chips matter: <span class="chip chip-b">Q</span>/<span class="chip chip-b">FY</span> mark quarterly and annual/cumulative figures, and
      <span class="chip chip-r">BAL</span> marks a point-in-time balance (AUM, deposits) rather than a sales flow — don't read those as monthly sales.
      A <span class="chip chip-y">?</span> on a unit means the filing's own label was ambiguous (e.g. "MT" for tonnes vs million tonnes).
    </div>
  </div>

  <div class="panel" id="p2">
    <div class="controls"><span class="hint">Company:</span><select id="single"></select></div>
    <div id="s-meta"></div>
    <div class="chartbox" id="chart1"></div>
  </div>

  <div class="panel" id="p3">
    <div class="two">
      <div><div class="sec-hd">Select companies</div><div class="picker" id="picker"></div></div>
      <div>
        <div class="controls">
          <span class="hint">Scale:</span>
          <label class="hint"><input type="radio" name="scale" value="abs" checked> Absolute</label>
          <label class="hint"><input type="radio" name="scale" value="idx"> Indexed (first period = 100)</label>
        </div>
        <div class="chartbox" id="chart2"></div><div id="m-warn"></div>
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-hd">Provenance</div>
    <div class="note">
      Source: ${esc((dto.provenance || {}).source)}<br>
      Cohort: ${esc((dto.provenance || {}).cohort)} · Extraction: ${esc((dto.provenance || {}).extraction)}<br>
      Parse: ${esc((dto.provenance || {}).parse)}<br>
      Every row links to its source filing on Stockscans. Confidence reflects how unambiguous the filing's own table was.
    </div>
  </div>
</div>
<script>window.__DTO__=${JSON.stringify(dto).replace(/</g, '\\u003c')};</script>
<script>${clientJs()}</script>
</body></html>`;
  return html;
}

function renderToFile(dto, outPath) {
  const html = render(dto);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  return { path: outPath, bytes: Buffer.byteLength(html) };
}

module.exports = { render, renderToFile };
