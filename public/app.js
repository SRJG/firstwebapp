// public/app.js
const state = {
  pensions: [],
  currentPensionId: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1, // 1~12
  reservations: [],
};

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
      loadCalendar();
    };
    tabsEl.appendChild(btn);
  });
}

// ---- 달력 데이터 로드 ----
async function loadCalendar() {
  monthLabelEl.textContent = `${state.year}년 ${state.month}월`;
  const url = `/api/reservations?pension_id=${state.currentPensionId}&year=${state.year}&month=${state.month}`;
  const res = await fetch(url);
  state.reservations = await res.json();
  renderGrid();
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

    const dayNum = document.createElement('div');
    dayNum.className = 'day-number';
    dayNum.textContent = d;
    cell.appendChild(dayNum);

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
        openModal(r);
      };
      cell.appendChild(tag);
    });

    // 빈 날짜 클릭 시 새 예약 등록 (해당 날짜를 체크인으로)
    cell.onclick = () => {
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

// ---- 모달 ----
function openModal(reservation, presetDate) {
  form.reset();
  document.getElementById('remainingAmount').textContent = '0';

  if (reservation) {
    document.getElementById('modalTitle').textContent = '예약 상세';
    document.getElementById('resId').value = reservation.id;
    document.getElementById('guestName').value = reservation.guest_name;
    document.getElementById('phone').value = reservation.phone || '';
    document.getElementById('checkIn').value = reservation.check_in;
    document.getElementById('checkOut').value = reservation.check_out;
    document.getElementById('numGuests').value = reservation.num_guests || '';
    document.getElementById('totalPrice').value = reservation.total_price;
    document.getElementById('paidAmount').value = reservation.paid_amount;
    document.getElementById('bbqRequested').checked = reservation.bbq_requested;
    document.getElementById('memo').value = reservation.memo || '';
    document.getElementById('remainingAmount').textContent = reservation.remaining_amount;
    deleteBtn.classList.remove('hidden');
  } else {
    document.getElementById('modalTitle').textContent = '새 예약';
    document.getElementById('resId').value = '';
    if (presetDate) document.getElementById('checkIn').value = presetDate;
    deleteBtn.classList.add('hidden');
  }

  modalOverlay.classList.remove('hidden');
}

document.getElementById('addBtn').onclick = () => openModal(null);
document.getElementById('closeModal').onclick = () => modalOverlay.classList.add('hidden');

// 총액/받은 금액 바뀔 때 남은 금액 실시간 계산
['totalPrice', 'paidAmount'].forEach((id) => {
  document.getElementById(id).addEventListener('input', () => {
    const total = Number(document.getElementById('totalPrice').value) || 0;
    const paid = Number(document.getElementById('paidAmount').value) || 0;
    document.getElementById('remainingAmount').textContent = total - paid;
  });
});

// ---- 저장 (등록 or 수정) ----
form.onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('resId').value;

  const payload = {
    pension_id: state.currentPensionId,
    guest_name: document.getElementById('guestName').value,
    phone: document.getElementById('phone').value,
    check_in: document.getElementById('checkIn').value,
    check_out: document.getElementById('checkOut').value,
    num_guests: Number(document.getElementById('numGuests').value) || null,
    total_price: Number(document.getElementById('totalPrice').value) || 0,
    paid_amount: Number(document.getElementById('paidAmount').value) || 0,
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