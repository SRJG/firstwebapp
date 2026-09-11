// public/app.js

// 숫자 ↔ 쉼표 포맷 변환 헬퍼
function formatNumber(n) {
  if (n === '' || n === null || n === undefined) return '';
  return Number(n).toLocaleString('ko-KR');
}
function parseNumber(str) {
  if (!str) return 0;
  return Number(String(str).replace(/,/g, '')) || 0;
}

// 전화번호 자동 포맷 (010-0000-0000)
function formatPhone(value) {
  // 숫자만 남기기
  let digits = value.replace(/\D/g, '');

  // 010으로 시작하지 않으면 앞에 붙여줌
  if (!digits.startsWith('010')) {
    digits = '010' + digits;
  }
  digits = digits.slice(0, 11); // 010 + 8자리 = 최대 11자리

  const rest = digits.slice(3); // 010 뒤 나머지 숫자
  if (rest.length <= 4) {
    return rest ? `010-${rest}` : '010-';
  }
  return `010-${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
}

const state = {
  pensions: [],
  currentPensionId: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1, // 1~12
  reservations: [],
  dailyRates: {}, // { 'YYYY-MM-DD': price } - 현재 화면에 보이는 달의 날짜별 요금
  viewMode: 'calendar', // 'calendar' | 'list'
};

// 예약 등록/수정 모달이 "신규 등록"인지 여부 (신규일 때만 요금 자동 채우기 동작)
let isCreatingNew = true;

const tabsEl = document.getElementById('tabs');
const gridEl = document.getElementById('calendarGrid');
const monthLabelEl = document.getElementById('monthLabel');
const modalOverlay = document.getElementById('modalOverlay');
const form = document.getElementById('reservationForm');
const deleteBtn = document.getElementById('deleteBtn');

// ---- 초기화 ----
async function init() {
  const res = await fetch('/api/pensions');
  state.pensions = await res.json();
  state.currentPensionId = state.pensions[0]?.id;
  renderTabs();
  await loadCalendar();
}

function renderTabs() {
  tabsEl.innerHTML = '';
  state.pensions.forEach((p) => {
    const btn = document.createElement('button');
    btn.textContent = p.name;
    btn.className = p.id === state.currentPensionId ? 'active' : '';
    btn.onclick = () => {
      state.currentPensionId = p.id;
      renderTabs();
      exitPriceMode();
      loadCalendar();
    };
    tabsEl.appendChild(btn);
  });
}

// ---- 달력 데이터 로드 (예약 + 날짜별 요금) ----
async function loadCalendar() {
  monthLabelEl.textContent = `${state.year}년 ${state.month}월`;

  const resvUrl = `/api/reservations?pension_id=${state.currentPensionId}&year=${state.year}&month=${state.month}`;
  const resvRes = await fetch(resvUrl);
  state.reservations = await resvRes.json();

  const monthStart = `${state.year}-${String(state.month).padStart(2, '0')}-01`;
  const lastDay = new Date(state.year, state.month, 0).getDate();
  const monthEnd = `${state.year}-${String(state.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const ratesUrl = `/api/daily-rates?pension_id=${state.currentPensionId}&start=${monthStart}&end=${monthEnd}`;
  const ratesRes = await fetch(ratesUrl);
  const rates = await ratesRes.json();
  state.dailyRates = {};
  rates.forEach((r) => { state.dailyRates[r.date] = r.price; });

  renderGrid();
  if (state.viewMode === 'list') renderListView();
}

function renderGrid() {
  gridEl.innerHTML = '';
  const firstDay = new Date(state.year, state.month - 1, 1);
  const daysInMonth = new Date(state.year, state.month, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=일요일

  // 앞쪽 빈 칸
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    gridEl.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${state.year}-${String(state.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (priceMode.active && priceMode.selectedDates.has(dateStr)) {
      cell.classList.add('price-selected');
    }

    const dayNum = document.createElement('div');
    dayNum.className = 'day-number';
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    // 저장된 날짜별 요금이 있으면 작은 텍스트로 표시
    if (state.dailyRates[dateStr] !== undefined) {
      const rateEl = document.createElement('div');
      rateEl.className = 'day-rate';
      rateEl.textContent = `₩${formatNumber(state.dailyRates[dateStr])}`;
      cell.appendChild(rateEl);
    }

    // 이 날짜가 포함된 예약 찾기 (check_in <= date < check_out)
    const matches = state.reservations.filter(
      (r) => r.check_in <= dateStr && dateStr < r.check_out
    );

    matches.forEach((r) => {
      const tag = document.createElement('div');
      tag.className = 'reservation-tag' + (r.bbq_requested ? ' bbq' : '');
      tag.textContent = r.guest_name;
      tag.onclick = (e) => {
        e.stopPropagation();
        if (priceMode.active) return; // 요금 입력 모드 중엔 예약 상세를 열지 않음
        openModal(r);
      };
      cell.appendChild(tag);
    });

    cell.onclick = () => {
      if (priceMode.active) {
        togglePriceSelect(dateStr, cell);
        return;
      }
      // 빈 날짜 클릭 시 새 예약 등록 (해당 날짜를 체크인으로)
      if (matches.length === 0) openModal(null, dateStr);
    };

    gridEl.appendChild(cell);
  }
}

// ---- 월 이동 ----
document.getElementById('prevMonth').onclick = () => {
  state.month -= 1;
  if (state.month < 1) { state.month = 12; state.year -= 1; }
  loadCalendar();
};
document.getElementById('nextMonth').onclick = () => {
  state.month += 1;
  if (state.month > 12) { state.month = 1; state.year += 1; }
  loadCalendar();
};

// ---- 요금 입력 모드 ----
const priceMode = {
  active: false,
  selectedDates: new Set(),
};

const priceModeBtn = document.getElementById('priceModeBtn');
const priceModePanel = document.getElementById('priceModePanel');
const priceModeInfo = document.getElementById('priceModeInfo');
const priceModeInput = document.getElementById('priceModeInput');
const priceModeApplyBtn = document.getElementById('priceModeApply');
const priceModeCancelBtn = document.getElementById('priceModeCancel');

function exitPriceMode() {
  priceMode.active = false;
  priceMode.selectedDates.clear();
  priceModeBtn.classList.remove('active');
  priceModePanel.classList.add('hidden');
  priceModeInput.value = '';
  priceModeInfo.textContent = '0일 선택됨';
  renderGrid();
}

priceModeBtn.onclick = () => {
  if (priceMode.active) {
    exitPriceMode();
    return;
  }
  priceMode.active = true;
  priceModeBtn.classList.add('active');
  priceModePanel.classList.remove('hidden');
  priceModeInfo.textContent = '0일 선택됨';
};

priceModeCancelBtn.onclick = exitPriceMode;

function togglePriceSelect(dateStr, cell) {
  if (priceMode.selectedDates.has(dateStr)) {
    priceMode.selectedDates.delete(dateStr);
    cell.classList.remove('price-selected');
  } else {
    priceMode.selectedDates.add(dateStr);
    cell.classList.add('price-selected');
  }
  priceModeInfo.textContent = `${priceMode.selectedDates.size}일 선택됨`;
}

priceModeInput.addEventListener('input', () => {
  const raw = parseNumber(priceModeInput.value);
  priceModeInput.value = formatNumber(raw);
  priceModeInput.setSelectionRange(priceModeInput.value.length, priceModeInput.value.length);
});

priceModeApplyBtn.onclick = async () => {
  if (priceMode.selectedDates.size === 0) {
    alert('요금을 적용할 날짜를 먼저 선택해주세요.');
    return;
  }
  const price = parseNumber(priceModeInput.value);
  if (!price) {
    alert('요금을 입력해주세요.');
    return;
  }

  const dates = Array.from(priceMode.selectedDates);
  const res = await fetch('/api/daily-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pension_id: state.currentPensionId, dates, price }),
  });

  if (res.ok) {
    exitPriceMode();
    loadCalendar();
  } else {
    alert('요금 저장 실패. 콘솔을 확인해주세요.');
    console.error(await res.text());
  }
};

// ---- 모달 ----
function openModal(reservation, presetDate) {
  form.reset();
  document.getElementById('remainingAmount').textContent = '0';
  isCreatingNew = !reservation;

  if (reservation) {
    document.getElementById('modalTitle').textContent = '예약 상세';
    document.getElementById('resId').value = reservation.id;
    document.getElementById('guestName').value = reservation.guest_name;
    document.getElementById('phone').value = reservation.phone || '';
    document.getElementById('numGuests').value = reservation.num_guests || '';
    document.getElementById('totalPrice').value = formatNumber(reservation.total_price);
    document.getElementById('paidAmount').value = formatNumber(reservation.paid_amount);
    document.getElementById('bbqRequested').checked = reservation.bbq_requested;
    document.getElementById('memo').value = reservation.memo || '';
    document.getElementById('remainingAmount').textContent = formatNumber(reservation.remaining_amount);
    deleteBtn.classList.remove('hidden');

    pickerState.selectingCheckIn = reservation.check_in;
    pickerState.selectingCheckOut = reservation.check_out;
    const [y, m] = reservation.check_in.split('-').map(Number);
    pickerState.year = y;
    pickerState.month = m;
  } else {
    document.getElementById('modalTitle').textContent = '새 예약';
    document.getElementById('resId').value = '';
    document.getElementById('phone').value = '010-';
    deleteBtn.classList.add('hidden');

    if (presetDate) {
      const nextDay = new Date(presetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      pickerState.selectingCheckIn = presetDate;
      pickerState.selectingCheckOut = nextDay.toISOString().slice(0, 10);
      const [y, m] = presetDate.split('-').map(Number);
      pickerState.year = y;
      pickerState.month = m;
    } else {
      pickerState.selectingCheckIn = null;
      pickerState.selectingCheckOut = null;
      const today = new Date();
      pickerState.year = today.getFullYear();
      pickerState.month = today.getMonth() + 1;
    }
  }

  syncPickerToForm();
  renderPicker();
  updateDefaultPriceIfApplicable();
  modalOverlay.classList.remove('hidden');
}

document.getElementById('closeModal').onclick = () => modalOverlay.classList.add('hidden');

// ---- 화면 전환 (달력 ↔ 예약 목록) ----
const calendarViewEl = document.getElementById('calendarView');
const listViewEl = document.getElementById('listView');
const listViewBody = document.getElementById('listViewBody');
const viewToggleBtn = document.getElementById('viewToggleBtn');

function renderListView() {
  listViewBody.innerHTML = '';

  if (state.reservations.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="list-empty">이번 달 예약이 없습니다.</td>';
    listViewBody.appendChild(tr);
    return;
  }

  const sorted = [...state.reservations].sort((a, b) => a.check_in.localeCompare(b.check_in));
  sorted.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.guest_name}${r.bbq_requested ? ' 🔥' : ''}</td>
      <td>${r.check_in} ~ ${r.check_out}</td>
      <td>${r.phone || '-'}</td>
      <td>${r.num_guests || '-'}</td>
      <td>₩${formatNumber(r.total_price)}</td>
      <td>₩${formatNumber(r.remaining_amount)}</td>
    `;
    tr.onclick = () => openModal(r);
    listViewBody.appendChild(tr);
  });
}

viewToggleBtn.onclick = () => {
  state.viewMode = state.viewMode === 'calendar' ? 'list' : 'calendar';
  if (state.viewMode === 'list') {
    calendarViewEl.classList.add('hidden');
    listViewEl.classList.remove('hidden');
    renderListView();
  } else {
    calendarViewEl.classList.remove('hidden');
    listViewEl.classList.add('hidden');
  }
};

// 총액/받은 금액 입력 시 쉼표 자동 포맷 + 남은 금액 실시간 계산
['totalPrice', 'paidAmount'].forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener('input', () => {
    const raw = parseNumber(input.value);
    input.value = formatNumber(raw);
    // 커서를 항상 끝으로 이동 (쉼표 추가로 인한 커서 튐 방지)
    input.setSelectionRange(input.value.length, input.value.length);

    const total = parseNumber(document.getElementById('totalPrice').value);
    const paid = parseNumber(document.getElementById('paidAmount').value);
    document.getElementById('remainingAmount').textContent = formatNumber(total - paid);
  });
});

// 전화번호 입력 시 자동 하이픈 포맷
const phoneInput = document.getElementById('phone');
phoneInput.addEventListener('input', () => {
  const formatted = formatPhone(phoneInput.value);
  phoneInput.value = formatted;
  phoneInput.setSelectionRange(formatted.length, formatted.length);
});
phoneInput.addEventListener('focus', () => {
  if (!phoneInput.value) {
    phoneInput.value = '010-';
    phoneInput.setSelectionRange(4, 4);
  }
});

// ---- 날짜 범위 선택기 (커스텀 미니 캘린더) ----
const pickerState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  selectingCheckIn: null,
  selectingCheckOut: null,
};

const pickerGrid = document.getElementById('pickerGrid');
const pickerMonthLabel = document.getElementById('pickerMonthLabel');
const dateRangeDisplay = document.getElementById('dateRangeDisplay');

function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function renderPicker() {
  pickerMonthLabel.textContent = `${pickerState.year}년 ${pickerState.month}월`;
  pickerGrid.innerHTML = '';

  const firstDay = new Date(pickerState.year, pickerState.month - 1, 1);
  const daysInMonth = new Date(pickerState.year, pickerState.month, 0).getDate();
  const startWeekday = firstDay.getDay();
  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'picker-cell empty';
    pickerGrid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(pickerState.year, pickerState.month, d);
    const cell = document.createElement('div');
    cell.className = 'picker-cell';
    cell.textContent = d;

    const isPast = dateStr < todayStr;
    if (isPast) cell.classList.add('past');

    const { selectingCheckIn: ci, selectingCheckOut: co } = pickerState;
    if (ci && dateStr === ci) cell.classList.add('range-start');
    if (co && dateStr === co) cell.classList.add('range-end');
    if (ci && co && dateStr > ci && dateStr < co) cell.classList.add('range-mid');

    if (!isPast) {
      cell.onclick = () => onPickerDateClick(dateStr);
    }
    pickerGrid.appendChild(cell);
  }
}

function onPickerDateClick(dateStr) {
  const { selectingCheckIn: ci, selectingCheckOut: co } = pickerState;

  if (!ci || (ci && co) || dateStr <= ci) {
    // 새로 시작하거나, 체크인보다 이전/같은 날을 누르면 체크인 다시 설정
    pickerState.selectingCheckIn = dateStr;
    pickerState.selectingCheckOut = null;
  } else {
    // 체크인이 있고 체크아웃이 없는 상태에서, 체크인보다 늦은 날 클릭 → 체크아웃 확정
    pickerState.selectingCheckOut = dateStr;
  }

  syncPickerToForm();
  renderPicker();
  updateDefaultPriceIfApplicable();
}

function syncPickerToForm() {
  const { selectingCheckIn: ci, selectingCheckOut: co } = pickerState;
  document.getElementById('checkIn').value = ci || '';
  document.getElementById('checkOut').value = co || '';

  if (ci && co) {
    dateRangeDisplay.textContent = `${ci} ~ ${co}`;
  } else if (ci) {
    dateRangeDisplay.textContent = `${ci} ~ (체크아웃 날짜를 선택하세요)`;
  } else {
    dateRangeDisplay.textContent = '체크인 날짜를 선택하세요';
  }
}

// 체크인/체크아웃이 모두 정해지면, 신규 예약에 한해 펜션별 요일/인원 기준 요금표로
// "총 요금" 칸에 기본값을 자동으로 채워준다. (기존 예약 수정 중에는 건드리지 않음)
// 이후에도 이 입력칸은 직접 수정할 수 있다.
function updateDefaultPriceIfApplicable() {
  if (!isCreatingNew) return;
  const { selectingCheckIn: ci, selectingCheckOut: co } = pickerState;
  if (!ci || !co) return;

  const pension = state.pensions.find((p) => p.id === state.currentPensionId);
  if (!pension) return;

  const numGuests = Number(document.getElementById('numGuests').value) || null;
  const bbqRequested = document.getElementById('bbqRequested').checked;

  const stayPrice = calcStayPrice(pension.name, ci, co, numGuests);
  const bbqPrice = bbqRequested ? calcBbqPrice(numGuests) : 0; // 4인 초과분은 저장 시 별도 확인
  const total = stayPrice + bbqPrice;

  const totalInput = document.getElementById('totalPrice');
  totalInput.value = formatNumber(total);
  const paid = parseNumber(document.getElementById('paidAmount').value);
  document.getElementById('remainingAmount').textContent = formatNumber(total - paid);
}

// 인원수 / 바베큐 여부가 바뀌어도 기본 요금을 다시 계산
document.getElementById('numGuests').addEventListener('input', updateDefaultPriceIfApplicable);
document.getElementById('bbqRequested').addEventListener('change', updateDefaultPriceIfApplicable);

document.getElementById('pickerPrevMonth').onclick = () => {
  pickerState.month -= 1;
  if (pickerState.month < 1) { pickerState.month = 12; pickerState.year -= 1; }
  renderPicker();
};
document.getElementById('pickerNextMonth').onclick = () => {
  pickerState.month += 1;
  if (pickerState.month > 12) { pickerState.month = 1; pickerState.year += 1; }
  renderPicker();
};

// ---- 저장 (등록 or 수정) ----
form.onsubmit = async (e) => {
  
  e.preventDefault();

const checkIn = document.getElementById('checkIn').value;
const checkOut = document.getElementById('checkOut').value;
if (!checkIn || !checkOut) {
  alert('체크인과 체크아웃 날짜를 모두 선택해주세요.');
  return;
}
if (checkOut <= checkIn) {
  alert('체크아웃 날짜는 체크인 날짜보다 늦어야 합니다.');
  return;
}

const id = document.getElementById('resId').value;

  // 신규 예약이고 바베큐를 요청했는데 인원이 4인을 초과하면,
  // 아직 정해지지 않은 추가 바베큐 요금을 저장 직전에 확인한다.
  const numGuestsForBbq = Number(document.getElementById('numGuests').value) || null;
  const bbqRequestedNow = document.getElementById('bbqRequested').checked;
  if (isCreatingNew && bbqRequestedNow && numGuestsForBbq && numGuestsForBbq > BBQ_BASE_GUESTS) {
    const answer = prompt(
      `바베큐 인원이 ${BBQ_BASE_GUESTS}인을 초과했습니다 (현재 ${numGuestsForBbq}명).\n` +
      `기본 요금(₩${formatNumber(BBQ_BASE_PRICE)}) 외에 추가로 받을 금액을 입력해주세요. (없으면 0)`,
      '0'
    );
    const extra = parseNumber(answer);
    if (extra > 0) {
      const totalInput = document.getElementById('totalPrice');
      const newTotal = parseNumber(totalInput.value) + extra;
      totalInput.value = formatNumber(newTotal);
      const paid = parseNumber(document.getElementById('paidAmount').value);
      document.getElementById('remainingAmount').textContent = formatNumber(newTotal - paid);
    }
  }

  const payload = {
    pension_id: state.currentPensionId,
    guest_name: document.getElementById('guestName').value,
    phone: document.getElementById('phone').value,
    check_in: document.getElementById('checkIn').value,
    check_out: document.getElementById('checkOut').value,
    num_guests: Number(document.getElementById('numGuests').value) || null,
    total_price: parseNumber(document.getElementById('totalPrice').value),
    paid_amount: parseNumber(document.getElementById('paidAmount').value),
    bbq_requested: document.getElementById('bbqRequested').checked,
    memo: document.getElementById('memo').value,
  };

  const url = id ? `/api/reservations/${id}` : '/api/reservations';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    modalOverlay.classList.add('hidden');
    loadCalendar();
  } else {
    alert('저장 실패. 콘솔을 확인해주세요.');
    console.error(await res.text());
  }
};

// ---- 삭제 ----
deleteBtn.onclick = async () => {
  const id = document.getElementById('resId').value;
  if (!id || !confirm('이 예약을 삭제하시겠습니까?')) return;

  const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
  if (res.ok) {
    modalOverlay.classList.add('hidden');
    loadCalendar();
  } else {
    alert('삭제 실패');
  }
};

init();
