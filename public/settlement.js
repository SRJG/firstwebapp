// public/settlement.js
// 정산 페이지: 월을 고르면 방(펜션)별 이용 팀수/이용 인원수/바베큐 횟수/총 요금/미수령 금액과
// 세 방 전체 합계를 보여준다. 시스템 관리자 + 예약 관리자만 접근 가능(서버에서도 이중으로 막음).

// 세션이 만료되어 401이 오면 로그인 페이지로 자동 이동 (다른 화면들과 동일한 공통 처리)
const _fetch = window.fetch;
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return new Promise(() => {});
  }
  return res;
};

document.getElementById('logoutBtn').onclick = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
};

function formatNumber(n) {
  if (n === '' || n === null || n === undefined) return '';
  return Number(n).toLocaleString('ko-KR');
}

const monthLabelEl = document.getElementById('settlementMonthLabel');
const tableBody = document.getElementById('settlementTableBody');
const totalFoot = document.getElementById('settlementTotalFoot');
const prevBtn = document.getElementById('settlementPrevMonth');
const nextBtn = document.getElementById('settlementNextMonth');

const now = new Date();
const state = { year: now.getFullYear(), month: now.getMonth() + 1 };

function buildRow(label, s) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${label}</td>
    <td>${formatNumber(s.team_count)}</td>
    <td>${formatNumber(s.guest_count)}</td>
    <td>${formatNumber(s.bbq_count)}</td>
    <td>₩${formatNumber(s.total_amount)}</td>
    <td>₩${formatNumber(s.unpaid_amount)}</td>
  `;
  return tr;
}

async function loadSettlement() {
  monthLabelEl.textContent = `${state.year}년 ${state.month}월`;
  tableBody.innerHTML = '<tr><td colspan="6" class="settlement-empty">불러오는 중...</td></tr>';
  totalFoot.innerHTML = '';

  let data;
  try {
    const res = await fetch(`/api/reservations/settlement?year=${state.year}&month=${state.month}`);
    if (!res.ok) throw new Error('정산 조회 요청 실패');
    data = await res.json();
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="6" class="settlement-empty">불러오기 실패. 새로고침해주세요.</td></tr>';
    console.error('정산 조회 실패:', err);
    return;
  }

  tableBody.innerHTML = '';
  data.pensions.forEach((p) => {
    tableBody.appendChild(buildRow(p.pension_name, p));
  });

  const totalRow = buildRow('전체 합계', data.totals);
  totalRow.className = 'settlement-total-row';
  totalFoot.innerHTML = '';
  totalFoot.appendChild(totalRow);
}

prevBtn.onclick = () => {
  state.month -= 1;
  if (state.month < 1) { state.month = 12; state.year -= 1; }
  loadSettlement();
};
nextBtn.onclick = () => {
  state.month += 1;
  if (state.month > 12) { state.month = 1; state.year += 1; }
  loadSettlement();
};

loadSettlement();
