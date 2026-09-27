// backup.js
// 예약/요금 데이터를 백업용 JSON 객체로 만드는 공용 함수.
// 관리자 페이지의 "백업 다운로드" 버튼(routes/admins.js)과 매일 새벽 자동 백업
// (backup-scheduler.js) 양쪽에서 이 함수를 그대로 가져다 쓴다.
//
// 펜션(pensions)은 참고용으로만 포함하고, 예약/요금은 pension_id 대신 pension_name으로
// 저장해서 나중에 복원할 때 DB의 펜션 id가 지금과 달라도(순서가 바뀌어도) 이름으로 다시
// 연결할 수 있게 한다. 관리자 계정(admins)은 비밀번호 해시가 포함되므로 백업에서 제외한다.
const pool = require('./db');

async function buildBackupData() {
  const pensionsResult = await pool.query('SELECT id, name FROM pensions ORDER BY id');
  const pensionNameById = {};
  pensionsResult.rows.forEach((p) => { pensionNameById[p.id] = p.name; });

  const reservationsResult = await pool.query(
    `SELECT pension_id, guest_name, phone, check_in, check_out, num_guests,
            total_price, paid_amount, bbq_requested, memo, created_at, updated_at
     FROM reservations ORDER BY check_in`
  );
  const dailyRatesResult = await pool.query(
    'SELECT pension_id, date, price FROM daily_rates ORDER BY date'
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    pensions: pensionsResult.rows.map((p) => ({ name: p.name })),
    reservations: reservationsResult.rows.map((r) => ({
      pension_name: pensionNameById[r.pension_id],
      guest_name: r.guest_name,
      phone: r.phone,
      check_in: r.check_in,
      check_out: r.check_out,
      num_guests: r.num_guests,
      total_price: r.total_price,
      paid_amount: r.paid_amount,
      bbq_requested: r.bbq_requested,
      memo: r.memo,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    dailyRates: dailyRatesResult.rows.map((d) => ({
      pension_name: pensionNameById[d.pension_id],
      date: d.date,
      price: d.price,
    })),
  };
}

module.exports = { buildBackupData };
