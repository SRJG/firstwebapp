// public/pricing.js
// 펜션별 요금 계산 로직 (브라우저의 app.js와 Node 재계산 스크립트에서 공용으로 사용)

// 펜션별 1박 요금(요일별) + 추가요금 없이 받을 수 있는 기준 인원
const PENSION_PRICING = {
  '사랑채': { baseGuests: 4, weekday: 300000, fri: 350000, sat: 380000, sun: 320000 },
  '별채':   { baseGuests: 3, weekday: 180000, fri: 230000, sat: 250000, sun: 200000 },
  '바깥채': { baseGuests: 2, weekday: 180000, fri: 230000, sat: 250000, sun: 200000 },
};

const EXTRA_GUEST_FEE = 20000; // 기준 인원 초과 1인당, 1박마다
const BBQ_BASE_PRICE = 30000;  // 바베큐 기본요금 (4인 기준)
const BBQ_BASE_GUESTS = 4;

// 특정 날짜(YYYY-MM-DD)가 속한 펜션의 1박 요금 (월~목 / 금 / 토 / 일)
function getNightlyRate(pensionName, dateStr) {
  const cfg = PENSION_PRICING[pensionName];
  if (!cfg) return 0;
  const day = new Date(dateStr).getDay(); // 0=일, 5=금, 6=토
  if (day === 5) return cfg.fri;
  if (day === 6) return cfg.sat;
  if (day === 0) return cfg.sun;
  return cfg.weekday;
}

// 체크인~체크아웃(체크아웃 당일은 숙박이 아니므로 제외) 전체 숙박 요금
// = 박마다 (그날 1박 요금 + 기준 인원 초과 인원 수 * 20,000원) 합산
// numGuests가 없으면 해당 펜션의 기준 인원으로 간주(추가요금 없음)
function calcStayPrice(pensionName, checkIn, checkOut, numGuests) {
  const cfg = PENSION_PRICING[pensionName];
  if (!cfg || !checkIn || !checkOut) return 0;

  const guests = numGuests || cfg.baseGuests;
  const extraGuests = Math.max(0, guests - cfg.baseGuests);

  let total = 0;
  let cur = new Date(checkIn);
  const end = new Date(checkOut);
  while (cur < end) {
    const dateStr = cur.toISOString().slice(0, 10);
    total += getNightlyRate(pensionName, dateStr) + extraGuests * EXTRA_GUEST_FEE;
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

// 바베큐 요금: 기본 30,000원(4인 기준) + 4인 초과 시 확정된 추가금액(extra)
function calcBbqPrice(numGuests, extra) {
  const extraAmount = extra || 0;
  return BBQ_BASE_PRICE + extraAmount;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PENSION_PRICING,
    EXTRA_GUEST_FEE,
    BBQ_BASE_PRICE,
    BBQ_BASE_GUESTS,
    getNightlyRate,
    calcStayPrice,
    calcBbqPrice,
  };
}
