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

// 'YYYY-MM-DD' 문자열이나 Date 객체를 모두 "로컬 자정" Date 객체로 통일해서 반환.
// (문자열을 new Date()로 바로 파싱하면 UTC 자정으로 해석되고, DB에서 오는 Date 객체는
//  로컬 자정인 경우가 많아 이 둘을 섞어 쓰면 요일이 하루 밀리는 문제가 생길 수 있음.
//  그래서 항상 연/월/일 숫자만 뽑아 new Date(y, m-1, d)로 다시 만들어 통일한다.)
function toLocalMidnight(input) {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const [y, m, d] = String(input).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 로컬 자정 Date 객체 -> 'YYYY-MM-DD' 문자열 (daily_rates 예외 가격 조회용 key)
function toDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 특정 날짜(문자열 또는 Date)가 속한 펜션의 1박 요금 (월~목 / 금 / 토 / 일)
function getNightlyRate(pensionName, dateInput) {
  const cfg = PENSION_PRICING[pensionName];
  if (!cfg) return 0;
  const day = toLocalMidnight(dateInput).getDay(); // 0=일, 5=금, 6=토
  if (day === 5) return cfg.fri;
  if (day === 6) return cfg.sat;
  if (day === 0) return cfg.sun;
  return cfg.weekday;
}

// 체크인~체크아웃(체크아웃 당일은 숙박이 아니므로 제외) 전체 숙박 요금
// = 박마다 (그날 1박 요금 + 기준 인원 초과 인원 수 * 20,000원) 합산
// numGuests가 없으면 해당 펜션의 기준 인원으로 간주(추가요금 없음)
//
// overrides: { 'YYYY-MM-DD': price } 형태의 예외 가격(성수기/명절 등, daily_rates 테이블에서 옴).
// 특정 날짜에 값이 있으면 요일 요금표보다 그 값을 우선 사용한다.
function calcStayPrice(pensionName, checkIn, checkOut, numGuests, overrides) {
  const cfg = PENSION_PRICING[pensionName];
  if (!cfg || !checkIn || !checkOut) return 0;

  const guests = numGuests || cfg.baseGuests;
  const extraGuests = Math.max(0, guests - cfg.baseGuests);
  const ov = overrides || {};

  let total = 0;
  let cur = toLocalMidnight(checkIn);
  const end = toLocalMidnight(checkOut);
  while (cur < end) {
    const dateKey = toDateKey(cur);
    const nightlyRate = ov[dateKey] !== undefined ? ov[dateKey] : getNightlyRate(pensionName, cur);
    total += nightlyRate + extraGuests * EXTRA_GUEST_FEE;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
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
    toLocalMidnight,
    toDateKey,
    getNightlyRate,
    calcStayPrice,
    calcBbqPrice,
  };
}
