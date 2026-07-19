'use strict';

const state = {
  all: [],
  filtered: [],
  meta: {},
  filters: { location: 'all', department: 'all', mainMode: 'all', fuel: 'all', carpool: 'all' },
  tableQuery: ''
};

const COLORS = ['#0f766e', '#84cc16', '#14b8a6', '#f59e0b', '#6366f1', '#ec4899'];
const qs = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const fmt1 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (n) => `${fmt1.format(n)}%`;
const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number.isFinite(r[key]) ? r[key] : 0), 0);
const mean = (rows, key) => rows.length ? sum(rows, key) / rows.length : 0;
const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((a,b) => a-b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach(r => {
    const k = r[key] || 'ไม่ระบุ';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return [...map.entries()].map(([name, items]) => ({
    name,
    count: items.length,
    adjustedGHG: sum(items, 'adjustedGHG'),
    surveyGHG: sum(items, 'surveyGHG'),
    avgGHG: items.length ? sum(items, 'adjustedGHG') / items.length : 0,
    avgDistance: mean(items, 'distanceKm'),
    missing: items.filter(x => x.ghgStatus === 'missing_factor').length
  }));
}

function populateSelect(id, values) {
  const el = qs(id);
  values.sort((a,b) => a.localeCompare(b, 'th')).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    el.appendChild(option);
  });
}

function initializeFilters() {
  populateSelect('locationFilter', [...new Set(state.all.map(r => r.location))]);
  populateSelect('departmentFilter', [...new Set(state.all.map(r => r.department))]);
  populateSelect('modeFilter', [...new Set(state.all.map(r => r.mainMode))]);
  populateSelect('fuelFilter', [...new Set(state.all.map(r => r.fuel))]);
  populateSelect('carpoolFilter', [...new Set(state.all.map(r => r.carpool))]);

  const map = {
    locationFilter: 'location', departmentFilter: 'department', modeFilter: 'mainMode',
    fuelFilter: 'fuel', carpoolFilter: 'carpool'
  };
  Object.entries(map).forEach(([id,key]) => qs(id).addEventListener('change', e => {
    state.filters[key] = e.target.value;
    applyFilters();
  }));
}

function applyFilters() {
  state.filtered = state.all.filter(r => Object.entries(state.filters).every(([key,value]) => value === 'all' || r[key] === value));
  renderAll();
}

function renderAll() {
  renderStatus(); renderQuality(); renderKPIs(); renderModeDonut(); renderFuelChart();
  renderLocations(); renderCarpool(); renderVehicles(); renderDistance(); renderDepartments();
  renderInsights(); renderTable();
}

function renderStatus() {
  const active = Object.entries(state.filters).filter(([,v]) => v !== 'all');
  const labels = {location:'สถานที่',department:'ฝ่ายงาน',mainMode:'รูปแบบ',fuel:'เชื้อเพลิง',carpool:'Car Pool'};
  qs('filterStatus').textContent = active.length
    ? `กำลังแสดง ${fmt.format(state.filtered.length)} รายการ • ${active.map(([k,v]) => `${labels[k]}: ${v}`).join(' • ')}`
    : `แสดงข้อมูลทั้งหมด ${fmt.format(state.filtered.length)} รายการ`;
}

function renderQuality() {
  const rows = state.filtered;
  const missingBTS = rows.filter(r => r.ghgStatus === 'missing_factor').length;
  const walk = rows.filter(r => r.ghgStatus === 'zero_walk').length;
  const calculated = rows.filter(r => r.ghgStatus === 'calculated').length;
  qs('qualityText').textContent = missingBTS
    ? `พบ ${fmt.format(missingBTS)} รายการ BTS/MRT ที่ยังไม่มี EF/GHG และมีเดินเท้า ${fmt.format(walk)} รายการที่แสดงเป็น 0 tCO₂e`
    : `ข้อมูลที่เลือกไม่มีรายการ BTS/MRT ที่ขาดค่า GHG • เดินเท้า ${fmt.format(walk)} รายการแสดงเป็น 0 tCO₂e`;
  qs('dialogContent').innerHTML = `
    <p><strong>สถานะข้อมูลที่เลือก</strong></p>
    <ul>
      <li>คำนวณค่า GHG แล้ว: <strong>${fmt.format(calculated)}</strong> รายการ</li>
      <li>เดินเท้า (Dashboard กำหนดเป็น 0 tCO₂e): <strong>${fmt.format(walk)}</strong> รายการ</li>
      <li>BTS/MRT ที่ยังไม่มีค่า EF/GHG ในไฟล์ต้นทาง: <strong>${fmt.format(missingBTS)}</strong> รายการ</li>
    </ul>
    <p>ค่า KPI หลักใช้คอลัมน์ <strong>ADJ.(SCALE UP) GHG (TonCO2e)</strong> จากไฟล์ต้นทาง โดยไม่ประมาณค่าเพิ่มสำหรับ BTS/MRT ดังนั้นยอดรวมปัจจุบันอาจต่ำกว่าความเป็นจริงเล็กน้อย</p>
    <p>เพื่อให้การรายงาน Scope 3 ครบถ้วน ควรกำหนด emission factor สำหรับระบบราง และระบุขอบเขตว่าเป็น Tank-to-Wheel หรือ Well-to-Wheel ให้สอดคล้องกันทั้งชุดข้อมูล</p>`;
}

function renderKPIs() {
  const rows = state.filtered;
  const adjusted = sum(rows, 'adjustedGHG');
  const survey = sum(rows, 'surveyGHG');
  qs('totalAdjustedGHG').textContent = fmt.format(adjusted);
  qs('surveyGHG').textContent = fmt.format(survey);
  qs('respondents').textContent = fmt.format(rows.length);
  qs('avgDistance').textContent = fmt1.format(mean(rows, 'distanceKm'));
  qs('medianDistance').textContent = `มัธยฐาน ${fmt1.format(median(rows.map(r => r.distanceKm)))} km`;
  qs('avgGHG').textContent = rows.length ? fmt.format(adjusted / rows.length) : '0';
  qs('scaleRatio').textContent = survey ? `×${fmt.format(adjusted / survey)}` : '—';
  qs('adjustedFoot').textContent = `เพิ่มจาก Survey ${survey ? pct((adjusted/survey - 1)*100) : '—'}`;
  qs('respondentFoot').textContent = `คิดเป็น ${pct(state.all.length ? rows.length/state.all.length*100 : 0)} ของฐานข้อมูล`;
}

function renderModeDonut() {
  const data = groupBy(state.filtered, 'mainMode').sort((a,b)=>b.adjustedGHG-a.adjustedGHG);
  const total = data.reduce((a,b)=>a+b.adjustedGHG,0);
  let cursor=0; const segments=[];
  data.forEach((d,i)=>{ const deg=total ? d.adjustedGHG/total*360 : 0; segments.push(`${COLORS[i%COLORS.length]} ${cursor}deg ${cursor+deg}deg`); cursor+=deg; });
  qs('modeDonut').style.background = total ? `conic-gradient(${segments.join(',')})` : 'var(--line)';
  qs('donutTotal').textContent = fmt.format(total);
  qs('modeLegend').innerHTML = data.map((d,i)=>`<div class="legend-item"><span class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></span><span class="legend-label">${escapeHtml(d.name)}</span><span class="legend-value">${fmt.format(d.adjustedGHG)} <small>(${total?pct(d.adjustedGHG/total*100):'0%'})</small></span></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderFuelChart() {
  const data=groupBy(state.filtered,'fuel').sort((a,b)=>b.adjustedGHG-a.adjustedGHG);
  const max=Math.max(...data.map(d=>d.adjustedGHG),1), total=data.reduce((a,b)=>a+b.adjustedGHG,0);
  qs('fuelChart').innerHTML=data.map(d=>`<div class="bar-row"><div class="bar-label">${escapeHtml(d.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${d.adjustedGHG/max*100}%"></div></div><div class="bar-value">${fmt.format(d.adjustedGHG)} <span>${total?pct(d.adjustedGHG/total*100):''}</span></div></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderLocations() {
  const data=groupBy(state.filtered,'location').sort((a,b)=>b.adjustedGHG-a.adjustedGHG);
  qs('locationCards').innerHTML=data.map(d=>`<div class="location-card"><div class="loc-top"><h4>${escapeHtml(d.name)}</h4><span class="loc-count">${fmt.format(d.count)} คน</span></div><strong>${fmt.format(d.adjustedGHG)}</strong><div class="loc-meta"><span>tCO₂e/ปี</span><span>${fmt.format(d.avgGHG)} ต่อคน</span></div></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderCarpool() {
  const data=groupBy(state.filtered,'carpool');
  const yes=data.find(d=>d.name==='มี')||{count:0,avgGHG:0};
  const no=data.find(d=>d.name==='ไม่มี')||{count:0,avgGHG:0};
  const total=yes.count+no.count;
  const saving=no.avgGHG>0 ? (1-yes.avgGHG/no.avgGHG)*100 : 0;
  qs('carpoolCard').innerHTML=`
    <div class="carpool-stat"><div class="row"><span>มี Car Pool</span><strong>${fmt.format(yes.count)} คน</strong></div><div class="compare-bar"><div style="width:${total?yes.count/total*100:0}%"></div></div><div class="row" style="margin-top:7px"><span>GHG เฉลี่ย</span><span>${fmt.format(yes.avgGHG)} tCO₂e/คน</span></div></div>
    <div class="carpool-stat"><div class="row"><span>ไม่มี Car Pool</span><strong>${fmt.format(no.count)} คน</strong></div><div class="compare-bar"><div style="width:${total?no.count/total*100:0}%;background:var(--primary)"></div></div><div class="row" style="margin-top:7px"><span>GHG เฉลี่ย</span><span>${fmt.format(no.avgGHG)} tCO₂e/คน</span></div></div>
    <div class="saving-note">ค่าเฉลี่ย GHG ของกลุ่ม Car Pool ต่ำกว่า ${saving>0?pct(saving):'—'} เมื่อเทียบกับกลุ่มที่เดินทางคนเดียวในข้อมูลที่เลือก</div>`;
}

function renderVehicles() {
  const data=groupBy(state.filtered,'vehicle').sort((a,b)=>b.adjustedGHG-a.adjustedGHG).slice(0,10);
  const max=Math.max(...data.map(d=>d.adjustedGHG),1);
  qs('vehicleChart').innerHTML=data.map(d=>`<div class="hbar-row"><div class="hbar-label" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div><div class="hbar-track"><div class="hbar-fill" style="width:${d.adjustedGHG/max*100}%"></div></div><div class="hbar-value">${fmt.format(d.adjustedGHG)}</div></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderDistance() {
  const bins=[{label:'≤10 km',min:-1,max:10},{label:'11–20',min:10,max:20},{label:'21–40',min:20,max:40},{label:'41–60',min:40,max:60},{label:'61–100',min:60,max:100},{label:'>100',min:100,max:Infinity}];
  const data=bins.map(b=>{const items=state.filtered.filter(r=>r.distanceKm>b.min&&r.distanceKm<=b.max);return {...b,count:items.length,value:sum(items,'adjustedGHG')}});
  const max=Math.max(...data.map(d=>d.value),1);
  qs('distanceChart').innerHTML=data.map(d=>`<div class="column-item"><div class="column-space"><div class="column-value">${fmt.format(d.value)}</div><div class="column-bar" style="height:${Math.max(3,d.value/max*190)}px"></div></div><div class="column-label">${d.label}<br><span>${fmt.format(d.count)} คน</span></div></div>`).join('');
}

function renderDepartments() {
  const data=groupBy(state.filtered,'department').sort((a,b)=>b.adjustedGHG-a.adjustedGHG).slice(0,8);
  const max=Math.max(...data.map(d=>d.adjustedGHG),1);
  qs('departmentChart').innerHTML=data.map((d,i)=>`<div class="rank-item"><div class="rank-no">${i+1}</div><div class="rank-info"><div class="rank-title" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div><div class="rank-track"><div style="width:${d.adjustedGHG/max*100}%"></div></div></div><div class="rank-value">${fmt.format(d.adjustedGHG)}<span>${fmt.format(d.count)} คน</span></div></div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderInsights() {
  const rows=state.filtered, total=sum(rows,'adjustedGHG');
  const fuel=groupBy(rows,'fuel').sort((a,b)=>b.adjustedGHG-a.adjustedGHG)[0]||{name:'—',adjustedGHG:0};
  const mode=groupBy(rows,'mainMode').sort((a,b)=>b.adjustedGHG-a.adjustedGHG)[0]||{name:'—',adjustedGHG:0};
  const long=rows.filter(r=>r.distanceKm>60), longGHG=sum(long,'adjustedGHG');
  const ev=rows.filter(r=>r.fuel==='EV'), fossil=rows.filter(r=>['GASOLINE','DIESEL','LPG','CNG'].includes(r.fuel));
  const evAvg=ev.length?sum(ev,'adjustedGHG')/ev.length:0, fossilAvg=fossil.length?sum(fossil,'adjustedGHG')/fossil.length:0;
  const cards=[
    [`${fuel.name} เป็นแหล่งหลัก`, `${fmt.format(fuel.adjustedGHG)} tCO₂e หรือ ${total?pct(fuel.adjustedGHG/total*100):'0%'} ของ GHG รวม เหมาะเป็นกลุ่มเป้าหมายหลักของมาตรการลดการปล่อย`],
    [`${mode.name} มีสัดส่วนสูงสุด`, `คิดเป็น ${total?pct(mode.adjustedGHG/total*100):'0%'} ของ GHG รวม ควรเน้นทางเลือก Public Transit, Shuttle, Flexible Work และ Car Pool`],
    [`ผู้เดินทางเกิน 60 km มี ${fmt.format(long.length)} คน`, `กลุ่มนี้สร้าง ${fmt.format(longGHG)} tCO₂e หรือ ${total?pct(longGHG/total*100):'0%'} ของยอดรวม แม้มีจำนวนไม่มาก`],
    [`EV ต่ำกว่ารถเชื้อเพลิงเฉลี่ย ${fossilAvg?pct(Math.max(0,(1-evAvg/fossilAvg)*100)):'—'}`, `EV เฉลี่ย ${fmt.format(evAvg)} เทียบกับรถเชื้อเพลิง ${fmt.format(fossilAvg)} tCO₂e/คน/ปี จากวิธีคำนวณในชุดข้อมูลนี้`]
  ];
  qs('insightsGrid').innerHTML=cards.map((c,i)=>`<div class="insight-card"><span class="insight-index">INSIGHT 0${i+1}</span><strong>${escapeHtml(c[0])}</strong><p>${escapeHtml(c[1])}</p></div>`).join('');
}

function renderTable() {
  const total=sum(state.filtered,'adjustedGHG');
  let data=groupBy(state.filtered,'vehicle').sort((a,b)=>b.adjustedGHG-a.adjustedGHG);
  if(state.tableQuery) data=data.filter(d=>d.name.toLowerCase().includes(state.tableQuery.toLowerCase()));
  qs('tableCount').textContent=`${fmt.format(data.length)} รายการ`;
  qs('detailTable').innerHTML=data.map(d=>`<tr><td title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</td><td>${fmt.format(d.count)}</td><td>${fmt1.format(d.avgDistance)} km</td><td>${fmt.format(d.adjustedGHG)}</td><td>${fmt.format(d.avgGHG)}</td><td><div class="share-cell"><div class="mini-bar"><div style="width:${total?d.adjustedGHG/total*100:0}%"></div></div>${total?pct(d.adjustedGHG/total*100):'0%'}</div></td></tr>`).join('') || '<tr><td colspan="6" class="empty-state">ไม่พบข้อมูล</td></tr>';
}

function resetFilters() {
  state.filters={location:'all',department:'all',mainMode:'all',fuel:'all',carpool:'all'};
  ['locationFilter','departmentFilter','modeFilter','fuelFilter','carpoolFilter'].forEach(id=>qs(id).value='all');
  applyFilters();
}

function exportCSV() {
  const total=sum(state.filtered,'adjustedGHG');
  const rows=groupBy(state.filtered,'vehicle').sort((a,b)=>b.adjustedGHG-a.adjustedGHG);
  const csv=[['ประเภทยานพาหนะ','จำนวนผู้ตอบ','ระยะทางเฉลี่ย_km','Adjusted_GHG_tCO2e','GHG_เฉลี่ยต่อคน','สัดส่วนร้อยละ'],...rows.map(d=>[d.name,d.count,d.avgDistance.toFixed(2),d.adjustedGHG.toFixed(4),d.avgGHG.toFixed(4),(total?d.adjustedGHG/total*100:0).toFixed(2)])]
    .map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='ghg-employee-commuting-summary.csv'; a.click(); URL.revokeObjectURL(url); showToast('ส่งออกไฟล์ CSV แล้ว');
}

function showToast(message) { const el=qs('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove('show'),2600); }

async function init() {
  try {
    const res=await fetch('./data/commuting.json');
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json(); state.meta=data.meta; state.all=data.records; state.filtered=[...state.all];
    qs('workingDays').textContent=fmt.format(state.meta.workingDaysPerYear);
    initializeFilters(); renderAll();
  } catch (error) {
    console.error(error); qs('filterStatus').textContent='ไม่สามารถโหลดไฟล์ข้อมูลได้';
    document.querySelector('.dashboard-grid').innerHTML='<article class="panel panel-span-12"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ กรุณาเปิดเว็บไซต์ผ่าน Web Server หรือ Deploy บน Vercel</div></article>';
  }
}

qs('resetFilters').addEventListener('click', resetFilters);
qs('exportButton').addEventListener('click', exportCSV);
qs('printButton').addEventListener('click', ()=>window.print());
qs('tableSearch').addEventListener('input', e=>{state.tableQuery=e.target.value.trim();renderTable();});
qs('qualityDetails').addEventListener('click', ()=>qs('qualityDialog').showModal());
qs('closeDialog').addEventListener('click', ()=>qs('qualityDialog').close());
qs('menuButton').addEventListener('click', ()=>qs('sidebar').classList.toggle('open'));
document.addEventListener('click', e=>{ if(window.innerWidth<=960 && qs('sidebar').classList.contains('open') && !qs('sidebar').contains(e.target) && e.target!==qs('menuButton')) qs('sidebar').classList.remove('open'); });
let savedTheme=null;
try { savedTheme=localStorage.getItem('ghg-theme'); } catch (_) { savedTheme=null; }
if(savedTheme) document.documentElement.dataset.theme=savedTheme;
qs('themeToggle').addEventListener('click', ()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;
  try { localStorage.setItem('ghg-theme',next); } catch (_) { /* storage may be unavailable in previews */ }
});

init();
