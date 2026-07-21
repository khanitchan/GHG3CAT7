'use strict';

const state = {
  all: [],
  filtered: [],
  meta: {},
  defaultRecords: [],
  defaultMeta: {},
  source: { kind: 'default', name: 'แบบสอบถามการเดินทางพนักงาน ปี 2568' },
  filters: { location: 'all', department: 'all', mainMode: 'all', fuel: 'all', carpool: 'all' },
  tableQuery: '',
  filterListenersBound: false
};

const COLORS = ['#0f766e', '#84cc16', '#14b8a6', '#f59e0b', '#6366f1', '#ec4899'];
const MAX_CSV_SIZE_BYTES = 25 * 1024 * 1024;
const qs = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const fmt2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (n) => `${fmt1.format(n)}%`;
const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number.isFinite(r[key]) ? r[key] : 0), 0);
const mean = (rows, key) => rows.length ? sum(rows, key) / rows.length : 0;
const median = (values) => {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const FILTER_CONFIG = {
  locationFilter: 'location',
  departmentFilter: 'department',
  modeFilter: 'mainMode',
  fuelFilter: 'fuel',
  carpoolFilter: 'carpool'
};

const COLUMN_ALIASES = {
  location: ['สถานที่ทำงาน', 'location', 'work location', 'work_location'],
  department: ['ฝ่ายงาน', 'department', 'division', 'department_name'],
  mainMode: [
    'เดินทางมาทำงานโดย พาหนะส่วนบุคคล, พาหนะสาธารณะ (ระบุ พาหนะหลัก ที่ใช้เดินทาง) หรือ เดินเท้า',
    'รูปแบบการเดินทางหลัก', 'mainmode', 'main mode', 'main_mode', 'commuting mode'
  ],
  privateVehicle: [
    'เดินทางมาทำงานโดยพาหนะส่วนบุคคล (ระบุ พาหนะหลัก ที่ใช้เดินทาง)',
    'พาหนะส่วนบุคคล', 'private vehicle'
  ],
  publicVehicle: [
    'เดินทางมาทำงานโดย พาหนะสาธารณะ (ระบุ พาหนะหลัก ที่ใช้เดินทาง)',
    'พาหนะสาธารณะ', 'public vehicle'
  ],
  motorcycleType: ['ประเภทรถจักรยานยนต์', 'motorcycle type'],
  vehicle: ['vehicle', 'ประเภทยานพาหนะ', 'vehicle type', 'vehicle_type'],
  fuel: ['fuel type', 'fuel', 'ประเภทเชื้อเพลิง', 'fuel_type'],
  motorcycleFuel: ['เชื้อเพลิงมอไซค์', 'motorcycle fuel'],
  privateFuel: ['เชื้อเพลิงรถส่วนตัว', 'private vehicle fuel'],
  carpool: [
    'มีพนักงานร่วมเดินทางมาทำงานด้วยกัน (car pool) หรือไม่',
    'carpool', 'car pool', 'car_pool'
  ],
  carpoolCount: ['จำนวน (คน)', 'carpool count', 'จำนวนผู้ร่วมเดินทาง'],
  distanceKm: ['ระยะทาง ไป-กลับ (หน่วย : กิโลเมตร)', 'distancekm', 'distance km', 'distance_km', 'round trip distance'],
  adjustedDistanceKm: ['ระยะทาง (km) (adj. carpool)', 'adjusteddistancekm', 'adjusted distance km', 'adjusted_distance_km'],
  workingDays: ['working day per year', 'workingdaysperyear', 'working days per year', 'working_days_per_year'],
  fuelConsumption: ['fuel consumption per year (l or kg or kwh)', 'fuel consumption per year', 'fuelconsumptionperyear', 'annual fuel consumption'],
  adjustedFuelConsumption: ['adj. (scale up) fuel consumption per year (l or kg or kwh)', 'adjusted fuel consumption per year', 'adjustedfuelconsumptionperyear', 'scale up fuel consumption'],
  emissionFactor: ['ef_factor', 'ef factor', 'emission factor', 'emission_factor'],
  surveyGHG: ['ghg (tonco2e) from survey', 'surveyghg', 'survey ghg', 'survey_ghg', 'survey_ghg_tco2e', 'ghg from survey'],
  adjustedGHG: ['adj.(scale up) ghg (tonco2e)', 'adjustedghg', 'adjusted ghg', 'adjusted_ghg', 'adjusted_ghg_tco2e', 'scale up ghg']
};

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const groupName = row[key] || 'ไม่ระบุ';
    if (!map.has(groupName)) map.set(groupName, []);
    map.get(groupName).push(row);
  });
  return [...map.entries()].map(([name, items]) => ({
    name,
    count: items.length,
    adjustedGHG: sum(items, 'adjustedGHG'),
    surveyGHG: sum(items, 'surveyGHG'),
    avgGHG: items.length ? sum(items, 'adjustedGHG') / items.length : 0,
    avgDistance: mean(items, 'distanceKm'),
    missing: items.filter((item) => item.ghgStatus === 'missing_factor').length
  }));
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .normalize('NFKC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCell(value) {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
  const raw = normalizeCell(value);
  if (!raw || /^(?:-|–|—|n\/a|na|null|none)$/i.test(raw)) return null;
  const thaiDigits = raw.replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const negative = /^\(.*\)$/.test(thaiDigits);
  const cleaned = thaiDigits.replace(/[(),\s]/g, '');
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return negative ? -number : number;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => normalizeCell(cell) !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => normalizeCell(cell) !== '')) rows.push(row);
  return rows;
}

function parseCSV(text) {
  const candidates = [',', ';', '\t'].map((delimiter) => {
    const rows = parseDelimited(text, delimiter);
    const headerWidth = rows[0]?.length ?? 0;
    const consistency = rows.slice(1, 21).filter((row) => row.length === headerWidth).length;
    return { delimiter, rows, score: headerWidth * 100 + consistency };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || !best.rows.length || best.rows[0].length < 2) {
    throw new Error('ไม่พบโครงสร้างตารางในไฟล์ CSV กรุณาตรวจสอบตัวคั่นคอลัมน์');
  }
  return best;
}

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  let index = headers.findIndex((header) => normalizedAliases.includes(header));
  if (index >= 0) return index;

  index = headers.findIndex((header) => normalizedAliases.some((alias) =>
    alias.length >= 8 && (header.includes(alias) || alias.includes(header))
  ));
  return index;
}

function inferMainMode(vehicle) {
  const value = normalizeCell(vehicle);
  if (/เดินเท้า|walk/i.test(value)) return 'เดินเท้า';
  if (/รถไฟฟ้า|bts|mrt|รถโดยสาร|รถเมล์|รถตู้|เรือ|public|taxi|แท็กซี่|วิน/i.test(value)) return 'พาหนะสาธารณะ';
  return value ? 'พาหนะส่วนบุคคล' : 'ไม่ระบุ';
}

function inferReportYear(filename) {
  const match = String(filename).match(/(?:^|\D)(25\d{2}|20\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function mostFrequentNumber(values, fallback = 242) {
  const counts = new Map();
  values.filter(Number.isFinite).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  if (!counts.size) return fallback;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function convertCSVToRecords(parsed, filename) {
  const [rawHeaders, ...rawRows] = parsed.rows;
  const headers = rawHeaders.map(normalizeHeader);
  const indexes = {};
  Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => {
    indexes[key] = findColumn(headers, aliases);
  });

  const missingRequired = [];
  if (indexes.distanceKm < 0) missingRequired.push('ระยะทางไป-กลับ');
  const hasPreciseAdjustedInputs = indexes.adjustedFuelConsumption >= 0 && indexes.emissionFactor >= 0;
  if (!hasPreciseAdjustedInputs && indexes.adjustedGHG < 0) {
    missingRequired.push('Adjusted Fuel Consumption + EF_FACTOR หรือ Adjusted GHG');
  }
  if (indexes.vehicle < 0 && indexes.mainMode < 0 && indexes.privateVehicle < 0 && indexes.publicVehicle < 0) {
    missingRequired.push('ประเภทยานพาหนะ/รูปแบบการเดินทาง');
  }
  if (missingRequired.length) {
    throw new Error(`ไม่พบคอลัมน์ที่จำเป็น: ${missingRequired.join(', ')}`);
  }

  const getCell = (row, index) => index >= 0 ? normalizeCell(row[index]) : '';
  const records = [];
  const workingDayValues = [];
  let invalidDistanceRows = 0;
  let skippedRows = 0;

  rawRows.forEach((row) => {
    if (!row.some((cell) => normalizeCell(cell) !== '')) {
      skippedRows += 1;
      return;
    }

    const explicitVehicle = getCell(row, indexes.vehicle);
    const publicVehicle = getCell(row, indexes.publicVehicle);
    const privateVehicle = getCell(row, indexes.privateVehicle);
    const motorcycleType = getCell(row, indexes.motorcycleType);
    const rawMainMode = getCell(row, indexes.mainMode);
    const vehicle = explicitVehicle || publicVehicle || privateVehicle || motorcycleType || rawMainMode || 'ไม่ระบุ';
    const mainMode = rawMainMode || inferMainMode(vehicle);
    const rawDistance = parseNumber(getCell(row, indexes.distanceKm));
    const adjustedDistance = parseNumber(getCell(row, indexes.adjustedDistanceKm));
    const fuelConsumption = parseNumber(getCell(row, indexes.fuelConsumption));
    const adjustedFuelConsumption = parseNumber(getCell(row, indexes.adjustedFuelConsumption));
    const emissionFactor = parseNumber(getCell(row, indexes.emissionFactor));
    const surveyGHGFromColumn = parseNumber(getCell(row, indexes.surveyGHG));
    const adjustedGHGFromColumn = parseNumber(getCell(row, indexes.adjustedGHG));
    const surveyGHG = Number.isFinite(fuelConsumption) && Number.isFinite(emissionFactor)
      ? fuelConsumption * emissionFactor / 1000
      : surveyGHGFromColumn;
    let adjustedGHG = Number.isFinite(adjustedFuelConsumption) && Number.isFinite(emissionFactor)
      ? adjustedFuelConsumption * emissionFactor / 1000
      : adjustedGHGFromColumn;
    const isWalking = /เดินเท้า|walk/i.test(`${mainMode} ${vehicle}`);

    if (!Number.isFinite(rawDistance)) invalidDistanceRows += 1;
    if (isWalking && !Number.isFinite(adjustedGHG)) adjustedGHG = 0;

    const workingDays = parseNumber(getCell(row, indexes.workingDays));
    if (Number.isFinite(workingDays)) workingDayValues.push(workingDays);

    const fuel = getCell(row, indexes.fuel)
      || getCell(row, indexes.privateFuel)
      || getCell(row, indexes.motorcycleFuel)
      || 'NONE';

    records.push({
      location: getCell(row, indexes.location) || 'ไม่ระบุ',
      department: getCell(row, indexes.department) || 'ไม่ระบุ',
      mainMode,
      vehicle,
      fuel: fuel.toUpperCase(),
      carpool: getCell(row, indexes.carpool) || 'ไม่ระบุ',
      carpoolCount: parseNumber(getCell(row, indexes.carpoolCount)),
      distanceKm: Number.isFinite(rawDistance) ? rawDistance : 0,
      adjustedDistanceKm: Number.isFinite(adjustedDistance)
        ? adjustedDistance
        : (Number.isFinite(rawDistance) ? rawDistance : 0),
      fuelConsumption,
      adjustedFuelConsumption,
      emissionFactor,
      surveyGHG,
      adjustedGHG,
      ghgStatus: Number.isFinite(adjustedGHG)
        ? (isWalking && adjustedGHG === 0 ? 'zero_walk' : 'calculated')
        : 'missing_factor'
    });
  });

  if (!records.length) throw new Error('ไม่พบแถวข้อมูลที่ใช้งานได้ในไฟล์ CSV');

  return {
    records,
    meta: {
      title: 'GHG Scope 3: Employee Commuting Dashboard',
      reportYearBE: inferReportYear(filename),
      workingDaysPerYear: mostFrequentNumber(workingDayValues, state.defaultMeta.workingDaysPerYear || 242),
      sourceRows: records.length,
      rawRows: rawRows.length,
      skippedRows,
      invalidDistanceRows,
      uploadedFilename: filename,
      delimiter: parsed.delimiter === '\t' ? 'TAB' : parsed.delimiter,
      privacy: 'Name, email and detailed affiliation columns are ignored during browser-side processing.',
      methodNote: hasPreciseAdjustedInputs
        ? 'Adjusted GHG is recalculated as ADJ. (SCALE UP) FUEL CONSUMPTION PER YEAR × EF_FACTOR ÷ 1000. The rounded Adjusted GHG column is used only as a fallback.'
        : 'Main KPI uses the Adjusted GHG column supplied in the uploaded CSV because precise fuel-consumption and emission-factor inputs were not both available. Walking with a blank value is treated as 0 tCO2e.'
    }
  };
}

async function decodeCSVFile(file) {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const utf8ReplacementCount = (text.match(/\uFFFD/g) || []).length;

  if (utf8ReplacementCount > 5) {
    try {
      const windows874 = new TextDecoder('windows-874', { fatal: false }).decode(buffer);
      const alternateReplacementCount = (windows874.match(/\uFFFD/g) || []).length;
      if (alternateReplacementCount < utf8ReplacementCount) text = windows874;
    } catch (_) {
      // Some older browsers may not expose windows-874. UTF-8 remains the fallback.
    }
  }
  return text.replace(/^\uFEFF/, '');
}

function populateSelect(id, values) {
  const element = qs(id);
  element.innerHTML = '<option value="all">ทั้งหมด</option>';
  values
    .filter((value) => normalizeCell(value) !== '')
    .sort((a, b) => a.localeCompare(b, 'th'))
    .forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      element.appendChild(option);
    });
}

function initializeFilters() {
  populateSelect('locationFilter', [...new Set(state.all.map((row) => row.location))]);
  populateSelect('departmentFilter', [...new Set(state.all.map((row) => row.department))]);
  populateSelect('modeFilter', [...new Set(state.all.map((row) => row.mainMode))]);
  populateSelect('fuelFilter', [...new Set(state.all.map((row) => row.fuel))]);
  populateSelect('carpoolFilter', [...new Set(state.all.map((row) => row.carpool))]);

  if (!state.filterListenersBound) {
    Object.entries(FILTER_CONFIG).forEach(([id, key]) => qs(id).addEventListener('change', (event) => {
      state.filters[key] = event.target.value;
      applyFilters();
    }));
    state.filterListenersBound = true;
  }
}

function updateSourceUI() {
  const rows = state.all.length;
  const workingDays = state.meta.workingDaysPerYear || 242;
  const skipped = state.meta.skippedRows ? ` • ข้าม ${fmt.format(state.meta.skippedRows)} แถว` : '';
  const invalidDistance = state.meta.invalidDistanceRows ? ` • ระยะทางผิดรูปแบบ ${fmt.format(state.meta.invalidDistanceRows)} แถว` : '';
  qs('databaseName').textContent = state.source.kind === 'upload' ? state.source.name : 'ฐานข้อมูลเริ่มต้น';
  qs('databaseMeta').textContent = `${fmt.format(rows)} รายการ • ${fmt.format(workingDays)} วัน/ปี${skipped}${invalidDistance}`;
  qs('databaseMeta').classList.remove('error');
  qs('restoreDefaultButton').hidden = state.source.kind === 'default';
  qs('sourceLabel').textContent = `Source: ${state.source.name}`;
  qs('sourceLabel').title = state.source.name;
  qs('workingDays').textContent = fmt.format(workingDays);
  qs('dataYearBadge').textContent = state.meta.reportYearBE
    ? `ปีข้อมูล ${state.meta.reportYearBE}`
    : (state.source.kind === 'upload' ? 'ข้อมูล CSV ที่อัปโหลด' : 'ปีข้อมูล 2568');
}

function setDatabase(records, meta, source) {
  state.all = records;
  state.filtered = [...records];
  state.meta = meta;
  state.source = source;
  state.filters = { location: 'all', department: 'all', mainMode: 'all', fuel: 'all', carpool: 'all' };
  state.tableQuery = '';
  qs('tableSearch').value = '';
  initializeFilters();
  Object.keys(FILTER_CONFIG).forEach((id) => { qs(id).value = 'all'; });
  updateSourceUI();
  renderAll();
}

function applyFilters() {
  state.filtered = state.all.filter((row) => Object.entries(state.filters).every(([key, value]) =>
    value === 'all' || row[key] === value
  ));
  renderAll();
}

function renderAll() {
  renderStatus();
  renderQuality();
  renderKPIs();
  renderModeDonut();
  renderFuelChart();
  renderLocations();
  renderCarpool();
  renderVehicles();
  renderDistance();
  renderDepartments();
  renderInsights();
  renderTable();
}

function renderStatus() {
  const active = Object.entries(state.filters).filter(([, value]) => value !== 'all');
  const labels = { location: 'สถานที่', department: 'ฝ่ายงาน', mainMode: 'รูปแบบ', fuel: 'เชื้อเพลิง', carpool: 'Car Pool' };
  qs('filterStatus').textContent = active.length
    ? `กำลังแสดง ${fmt.format(state.filtered.length)} รายการ • ${active.map(([key, value]) => `${labels[key]}: ${value}`).join(' • ')}`
    : `แสดงข้อมูลทั้งหมด ${fmt.format(state.filtered.length)} รายการ`;
}

function renderQuality() {
  const rows = state.filtered;
  const missing = rows.filter((row) => row.ghgStatus === 'missing_factor');
  const railMissing = missing.filter((row) => /รถไฟฟ้า|bts|mrt/i.test(row.vehicle)).length;
  const walk = rows.filter((row) => row.ghgStatus === 'zero_walk').length;
  const calculated = rows.filter((row) => row.ghgStatus === 'calculated').length;
  const invalidDistanceRows = state.meta.invalidDistanceRows || 0;

  qs('qualityText').textContent = missing.length
    ? `พบ ${fmt.format(missing.length)} รายการที่ยังไม่มีค่า Adjusted GHG${railMissing ? ` • เป็น BTS/MRT ${fmt.format(railMissing)} รายการ` : ''} • เดินเท้า ${fmt.format(walk)} รายการแสดงเป็น 0 tCO₂e`
    : `ข้อมูลที่เลือกมีค่า Adjusted GHG ครบถ้วน • เดินเท้า ${fmt.format(walk)} รายการแสดงเป็น 0 tCO₂e`;

  qs('dialogContent').innerHTML = `
    <p><strong>สถานะข้อมูลที่เลือก</strong></p>
    <ul>
      <li>คำนวณค่า Adjusted GHG แล้ว: <strong>${fmt.format(calculated)}</strong> รายการ</li>
      <li>เดินเท้า (กำหนดเป็น 0 tCO₂e): <strong>${fmt.format(walk)}</strong> รายการ</li>
      <li>ไม่มีค่า Adjusted GHG และไม่ถูกนำไปรวม: <strong>${fmt.format(missing.length)}</strong> รายการ</li>
      ${railMissing ? `<li>ในจำนวนที่ไม่มีค่า เป็น BTS/MRT: <strong>${fmt.format(railMissing)}</strong> รายการ</li>` : ''}
      ${invalidDistanceRows ? `<li>ระยะทางที่อ่านเป็นตัวเลขไม่ได้และกำหนดเป็น 0 km ในไฟล์ที่อัปโหลด: <strong>${fmt.format(invalidDistanceRows)}</strong> แถว</li>` : ''}
    </ul>
    <p>ค่า KPI หลักคำนวณจาก <strong>ADJ. (SCALE UP) FUEL CONSUMPTION PER YEAR × EF_FACTOR ÷ 1,000</strong> เมื่อมีคอลัมน์ครบ และใช้คอลัมน์ Adjusted GHG เป็นค่า fallback เท่านั้น</p>
    <p>${escapeHtml(state.meta.methodNote || 'Dashboard ใช้ค่าที่คำนวณมาแล้วจากฐานข้อมูล โดยไม่คำนวณ Emission Factor เพิ่มในหน้าเว็บไซต์')}</p>
    ${state.source.kind === 'upload' ? '<p><strong>Privacy:</strong> ไฟล์ CSV ถูกอ่านและประมวลผลใน Browser ของผู้ใช้เท่านั้น ชื่อ อีเมล และคอลัมน์ที่ไม่ใช้จะไม่ถูกเก็บในตัวแปรข้อมูลของ Dashboard</p>' : ''}`;
}

function renderKPIs() {
  const rows = state.filtered;
  const adjusted = sum(rows, 'adjustedGHG');
  const survey = sum(rows, 'surveyGHG');
  qs('totalAdjustedGHG').textContent = fmt2.format(adjusted);
  qs('surveyGHG').textContent = fmt.format(survey);
  qs('respondents').textContent = fmt.format(rows.length);
  qs('avgDistance').textContent = fmt1.format(mean(rows, 'distanceKm'));
  qs('medianDistance').textContent = `มัธยฐาน ${fmt1.format(median(rows.map((row) => row.distanceKm)))} km`;
  qs('avgGHG').textContent = rows.length ? fmt.format(adjusted / rows.length) : '0';
  qs('scaleRatio').textContent = survey ? `×${fmt.format(adjusted / survey)}` : '—';
  qs('adjustedFoot').textContent = `เพิ่มจาก Survey ${survey ? pct((adjusted / survey - 1) * 100) : '—'}`;
  qs('respondentFoot').textContent = `คิดเป็น ${pct(state.all.length ? rows.length / state.all.length * 100 : 0)} ของฐานข้อมูล`;
}

function renderModeDonut() {
  const data = groupBy(state.filtered, 'mainMode').sort((a, b) => b.adjustedGHG - a.adjustedGHG);
  const total = data.reduce((acc, item) => acc + item.adjustedGHG, 0);
  let cursor = 0;
  const segments = [];
  data.forEach((item, index) => {
    const degrees = total ? item.adjustedGHG / total * 360 : 0;
    segments.push(`${COLORS[index % COLORS.length]} ${cursor}deg ${cursor + degrees}deg`);
    cursor += degrees;
  });
  qs('modeDonut').style.background = total ? `conic-gradient(${segments.join(',')})` : 'var(--line)';
  qs('donutTotal').textContent = fmt2.format(total);
  qs('modeLegend').innerHTML = data.map((item, index) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${COLORS[index % COLORS.length]}"></span>
      <span class="legend-label">${escapeHtml(item.name)}</span>
      <span class="legend-value">${fmt.format(item.adjustedGHG)} <small>(${total ? pct(item.adjustedGHG / total * 100) : '0%'})</small></span>
    </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderFuelChart() {
  const data = groupBy(state.filtered, 'fuel').sort((a, b) => b.adjustedGHG - a.adjustedGHG);
  const max = Math.max(...data.map((item) => item.adjustedGHG), 1);
  const total = data.reduce((acc, item) => acc + item.adjustedGHG, 0);
  qs('fuelChart').innerHTML = data.map((item) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(item.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${item.adjustedGHG / max * 100}%"></div></div>
      <div class="bar-value">${fmt.format(item.adjustedGHG)} <span>${total ? pct(item.adjustedGHG / total * 100) : ''}</span></div>
    </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderLocations() {
  const data = groupBy(state.filtered, 'location').sort((a, b) => b.adjustedGHG - a.adjustedGHG);
  qs('locationCards').innerHTML = data.map((item) => `
    <div class="location-card">
      <div class="loc-top"><h4>${escapeHtml(item.name)}</h4><span class="loc-count">${fmt.format(item.count)} คน</span></div>
      <strong>${fmt.format(item.adjustedGHG)}</strong>
      <div class="loc-meta"><span>tCO₂e/ปี</span><span>${fmt.format(item.avgGHG)} ต่อคน</span></div>
    </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderCarpool() {
  const data = groupBy(state.filtered, 'carpool');
  const yes = data.find((item) => item.name === 'มี') || { count: 0, avgGHG: 0 };
  const no = data.find((item) => item.name === 'ไม่มี') || { count: 0, avgGHG: 0 };
  const total = yes.count + no.count;
  const saving = no.avgGHG > 0 ? (1 - yes.avgGHG / no.avgGHG) * 100 : 0;
  qs('carpoolCard').innerHTML = `
    <div class="carpool-stat"><div class="row"><span>มี Car Pool</span><strong>${fmt.format(yes.count)} คน</strong></div><div class="compare-bar"><div style="width:${total ? yes.count / total * 100 : 0}%"></div></div><div class="row" style="margin-top:7px"><span>GHG เฉลี่ย</span><span>${fmt.format(yes.avgGHG)} tCO₂e/คน</span></div></div>
    <div class="carpool-stat"><div class="row"><span>ไม่มี Car Pool</span><strong>${fmt.format(no.count)} คน</strong></div><div class="compare-bar"><div style="width:${total ? no.count / total * 100 : 0}%;background:var(--primary)"></div></div><div class="row" style="margin-top:7px"><span>GHG เฉลี่ย</span><span>${fmt.format(no.avgGHG)} tCO₂e/คน</span></div></div>
    <div class="saving-note">ค่าเฉลี่ย GHG ของกลุ่ม Car Pool ต่ำกว่า ${saving > 0 ? pct(saving) : '—'} เมื่อเทียบกับกลุ่มที่เดินทางคนเดียวในข้อมูลที่เลือก</div>`;
}

function renderVehicles() {
  const data = groupBy(state.filtered, 'vehicle').sort((a, b) => b.adjustedGHG - a.adjustedGHG).slice(0, 10);
  const max = Math.max(...data.map((item) => item.adjustedGHG), 1);
  qs('vehicleChart').innerHTML = data.map((item) => `
    <div class="hbar-row">
      <div class="hbar-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${item.adjustedGHG / max * 100}%"></div></div>
      <div class="hbar-value">${fmt.format(item.adjustedGHG)}</div>
    </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderDistance() {
  const bins = [
    { label: '≤10 km', min: -1, max: 10 },
    { label: '11–20', min: 10, max: 20 },
    { label: '21–40', min: 20, max: 40 },
    { label: '41–60', min: 40, max: 60 },
    { label: '61–100', min: 60, max: 100 },
    { label: '>100', min: 100, max: Infinity }
  ];
  const data = bins.map((bin) => {
    const items = state.filtered.filter((row) => row.distanceKm > bin.min && row.distanceKm <= bin.max);
    return { ...bin, count: items.length, value: sum(items, 'adjustedGHG') };
  });
  const max = Math.max(...data.map((item) => item.value), 1);
  qs('distanceChart').innerHTML = data.map((item) => `
    <div class="column-item">
      <div class="column-space"><div class="column-value">${fmt.format(item.value)}</div><div class="column-bar" style="height:${Math.max(3, item.value / max * 190)}px"></div></div>
      <div class="column-label">${item.label}<br><span>${fmt.format(item.count)} คน</span></div>
    </div>`).join('');
}

function renderDepartments() {
  const data = groupBy(state.filtered, 'department').sort((a, b) => b.adjustedGHG - a.adjustedGHG).slice(0, 8);
  const max = Math.max(...data.map((item) => item.adjustedGHG), 1);
  qs('departmentChart').innerHTML = data.map((item, index) => `
    <div class="rank-item">
      <div class="rank-no">${index + 1}</div>
      <div class="rank-info"><div class="rank-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div><div class="rank-track"><div style="width:${item.adjustedGHG / max * 100}%"></div></div></div>
      <div class="rank-value">${fmt.format(item.adjustedGHG)}<span>${fmt.format(item.count)} คน</span></div>
    </div>`).join('') || '<div class="empty-state">ไม่มีข้อมูล</div>';
}

function renderInsights() {
  const rows = state.filtered;
  const total = sum(rows, 'adjustedGHG');
  const fuel = groupBy(rows, 'fuel').sort((a, b) => b.adjustedGHG - a.adjustedGHG)[0] || { name: '—', adjustedGHG: 0 };
  const mode = groupBy(rows, 'mainMode').sort((a, b) => b.adjustedGHG - a.adjustedGHG)[0] || { name: '—', adjustedGHG: 0 };
  const longDistance = rows.filter((row) => row.distanceKm > 60);
  const longDistanceGHG = sum(longDistance, 'adjustedGHG');
  const ev = rows.filter((row) => row.fuel === 'EV');
  const fossil = rows.filter((row) => ['GASOLINE', 'DIESEL', 'LPG', 'CNG'].includes(row.fuel));
  const evAverage = ev.length ? sum(ev, 'adjustedGHG') / ev.length : 0;
  const fossilAverage = fossil.length ? sum(fossil, 'adjustedGHG') / fossil.length : 0;
  const cards = [
    [`${fuel.name} เป็นแหล่งหลัก`, `${fmt.format(fuel.adjustedGHG)} tCO₂e หรือ ${total ? pct(fuel.adjustedGHG / total * 100) : '0%'} ของ GHG รวม เหมาะเป็นกลุ่มเป้าหมายหลักของมาตรการลดการปล่อย`],
    [`${mode.name} มีสัดส่วนสูงสุด`, `คิดเป็น ${total ? pct(mode.adjustedGHG / total * 100) : '0%'} ของ GHG รวม ควรเน้นทางเลือก Public Transit, Shuttle, Flexible Work และ Car Pool`],
    [`ผู้เดินทางเกิน 60 km มี ${fmt.format(longDistance.length)} คน`, `กลุ่มนี้สร้าง ${fmt.format(longDistanceGHG)} tCO₂e หรือ ${total ? pct(longDistanceGHG / total * 100) : '0%'} ของยอดรวม แม้มีจำนวนไม่มาก`],
    [`EV ต่ำกว่ารถเชื้อเพลิงเฉลี่ย ${fossilAverage ? pct(Math.max(0, (1 - evAverage / fossilAverage) * 100)) : '—'}`, `EV เฉลี่ย ${fmt.format(evAverage)} เทียบกับรถเชื้อเพลิง ${fmt.format(fossilAverage)} tCO₂e/คน/ปี จากวิธีคำนวณในชุดข้อมูลนี้`]
  ];
  qs('insightsGrid').innerHTML = cards.map((card, index) => `
    <div class="insight-card"><span class="insight-index">INSIGHT 0${index + 1}</span><strong>${escapeHtml(card[0])}</strong><p>${escapeHtml(card[1])}</p></div>`).join('');
}

function renderTable() {
  const total = sum(state.filtered, 'adjustedGHG');
  let data = groupBy(state.filtered, 'vehicle').sort((a, b) => b.adjustedGHG - a.adjustedGHG);
  if (state.tableQuery) data = data.filter((item) => item.name.toLowerCase().includes(state.tableQuery.toLowerCase()));
  qs('tableCount').textContent = `${fmt.format(data.length)} รายการ`;
  qs('detailTable').innerHTML = data.map((item) => `
    <tr>
      <td title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
      <td>${fmt.format(item.count)}</td>
      <td>${fmt1.format(item.avgDistance)} km</td>
      <td>${fmt.format(item.adjustedGHG)}</td>
      <td>${fmt.format(item.avgGHG)}</td>
      <td><div class="share-cell"><div class="mini-bar"><div style="width:${total ? item.adjustedGHG / total * 100 : 0}%"></div></div>${total ? pct(item.adjustedGHG / total * 100) : '0%'}</div></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty-state">ไม่พบข้อมูล</td></tr>';
}

function resetFilters() {
  state.filters = { location: 'all', department: 'all', mainMode: 'all', fuel: 'all', carpool: 'all' };
  Object.keys(FILTER_CONFIG).forEach((id) => { qs(id).value = 'all'; });
  applyFilters();
}

function protectCSVCell(value) {
  const stringValue = String(value ?? '');
  return /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;
}

function exportCSV() {
  const total = sum(state.filtered, 'adjustedGHG');
  const rows = groupBy(state.filtered, 'vehicle').sort((a, b) => b.adjustedGHG - a.adjustedGHG);
  const csv = [
    ['ประเภทยานพาหนะ', 'จำนวนผู้ตอบ', 'ระยะทางเฉลี่ย_km', 'Adjusted_GHG_tCO2e', 'GHG_เฉลี่ยต่อคน', 'สัดส่วนร้อยละ'],
    ...rows.map((item) => [item.name, item.count, item.avgDistance.toFixed(2), item.adjustedGHG.toFixed(4), item.avgGHG.toFixed(4), (total ? item.adjustedGHG / total * 100 : 0).toFixed(2)])
  ].map((row) => row.map((value) => `"${protectCSVCell(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ghg-employee-commuting-summary.csv';
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('ส่งออกไฟล์ CSV แล้ว');
}

function showToast(message, type = 'success') {
  const element = qs('toast');
  element.textContent = message;
  element.classList.toggle('error', type === 'error');
  element.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => element.classList.remove('show'), type === 'error' ? 5200 : 3000);
}

function setUploadBusy(isBusy) {
  qs('uploadButton').disabled = isBusy;
  qs('databaseDropzone').disabled = isBusy;
  qs('databaseDropzone').classList.toggle('loading', isBusy);
  if (isBusy) {
    qs('databaseMeta').textContent = 'กำลังอ่านและตรวจสอบไฟล์ CSV…';
    qs('databaseMeta').classList.remove('error');
  }
}

async function handleCSVFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    qs('csvFileInput').value = '';
    showToast('กรุณาเลือกไฟล์นามสกุล .csv', 'error');
    return;
  }
  if (file.size > MAX_CSV_SIZE_BYTES) {
    qs('csvFileInput').value = '';
    showToast('ไฟล์มีขนาดเกิน 25 MB กรุณาลดขนาดไฟล์ก่อนอัปโหลด', 'error');
    return;
  }

  setUploadBusy(true);
  try {
    const text = await decodeCSVFile(file);
    const parsed = parseCSV(text);
    const converted = convertCSVToRecords(parsed, file.name);
    setDatabase(converted.records, converted.meta, { kind: 'upload', name: file.name });
    showToast(`โหลด ${fmt.format(converted.records.length)} รายการจาก CSV สำเร็จ`);
    if (window.innerWidth <= 960) qs('sidebar').classList.remove('open');
  } catch (error) {
    console.error(error);
    qs('databaseMeta').textContent = error.message || 'ไม่สามารถอ่านไฟล์ CSV ได้';
    qs('databaseMeta').classList.add('error');
    showToast(error.message || 'ไม่สามารถอ่านไฟล์ CSV ได้', 'error');
  } finally {
    setUploadBusy(false);
    qs('csvFileInput').value = '';
  }
}

function restoreDefaultDatabase() {
  setDatabase(state.defaultRecords, state.defaultMeta, { kind: 'default', name: 'แบบสอบถามการเดินทางพนักงาน ปี 2568' });
  showToast('กลับไปใช้ฐานข้อมูลเริ่มต้นแล้ว');
}

async function init() {
  try {
    const embeddedData = window.__COMMUTING_DATA__;
    const data = embeddedData || await (async () => {
      const response = await fetch('./data/commuting.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })();
    state.defaultMeta = data.meta;
    state.defaultRecords = data.records;
    setDatabase(data.records, data.meta, { kind: 'default', name: 'แบบสอบถามการเดินทางพนักงาน ปี 2568' });
  } catch (error) {
    console.error(error);
    qs('filterStatus').textContent = 'ไม่สามารถโหลดไฟล์ข้อมูลได้';
    qs('databaseMeta').textContent = 'โหลดฐานข้อมูลเริ่มต้นไม่สำเร็จ';
    qs('databaseMeta').classList.add('error');
    document.querySelector('.dashboard-grid').innerHTML = '<article class="panel panel-span-12"><div class="empty-state">โหลดข้อมูลไม่สำเร็จ กรุณาเปิดเว็บไซต์ผ่าน Web Server หรือ Deploy บน Vercel</div></article>';
  }
}

qs('resetFilters').addEventListener('click', resetFilters);
qs('exportButton').addEventListener('click', exportCSV);
qs('printButton').addEventListener('click', () => window.print());
qs('tableSearch').addEventListener('input', (event) => { state.tableQuery = event.target.value.trim(); renderTable(); });
qs('qualityDetails').addEventListener('click', () => qs('qualityDialog').showModal());
qs('closeDialog').addEventListener('click', () => qs('qualityDialog').close());
qs('menuButton').addEventListener('click', () => qs('sidebar').classList.toggle('open'));
qs('uploadButton').addEventListener('click', () => qs('csvFileInput').click());
qs('databaseDropzone').addEventListener('click', () => qs('csvFileInput').click());
qs('csvFileInput').addEventListener('change', (event) => handleCSVFile(event.target.files?.[0]));
qs('restoreDefaultButton').addEventListener('click', restoreDefaultDatabase);

['dragenter', 'dragover'].forEach((eventName) => qs('databaseDropzone').addEventListener(eventName, (event) => {
  event.preventDefault();
  event.stopPropagation();
  qs('databaseDropzone').classList.add('dragover');
}));
['dragleave', 'drop'].forEach((eventName) => qs('databaseDropzone').addEventListener(eventName, (event) => {
  event.preventDefault();
  event.stopPropagation();
  qs('databaseDropzone').classList.remove('dragover');
}));
qs('databaseDropzone').addEventListener('drop', (event) => handleCSVFile(event.dataTransfer?.files?.[0]));

document.addEventListener('click', (event) => {
  if (window.innerWidth <= 960 && qs('sidebar').classList.contains('open') && !qs('sidebar').contains(event.target) && event.target !== qs('menuButton')) {
    qs('sidebar').classList.remove('open');
  }
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('ghg-theme'); } catch (_) { savedTheme = null; }
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
qs('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ghg-theme', next); } catch (_) { /* Storage can be unavailable in previews. */ }
});

init();
