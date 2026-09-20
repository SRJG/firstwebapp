// routes/reservations.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// 응답에 남은 금액(remaining_amount)을 계산해서 붙여주는 헬퍼
function withRemaining(row) {
  return { ...row, remaining_amount: row.total_price - row.paid_amount };
}

// 같은 방(pension_id)에 하룻밤이라도 겹치는 다른 예약이 있는지 확인 (한 방=하룻밤=한 팀).
// excludeId를 주면 그 예약 자신은 비교 대상에서 제외 (수정 시 자기 자신과는 항상 겹치므로).
async function findOverlappingReservation(pensionId, checkIn, checkOut, excludeId) {
  const result = await pool.query(
    `SELECT id, guest_name, check_in, check_out FROM reservations
     WHERE pension_id = $1 AND check_in < $3 AND check_out > $2
       AND ($4::int IS NULL OR id != $4)
     LIMIT 1`,
    [pensionId, checkIn, checkOut, excludeId || null]
  );
  return result.rows[0] || null;
}

// GET /api/reservations?pension_id=1&year=2026&month=9
// 특정 펜션의 특정 월과 겹치는 예약 목록 조회
router.get('/', async (req, res) => {
  const { pension_id, year, month } = req.query;

  if (!pension_id || !year || !month) {
    return res.status(400).json({
      success: false,
      message: 'pension_id, year, month 쿼리 파라미터가 필요합니다.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM reservations
       WHERE pension_id = $1
         AND check_in <= (date_trunc('month', $2::date) + interval '1 month' - interval '1 day')
         AND check_out >= date_trunc('month', $2::date)
       ORDER BY check_in`,
      [pension_id, `${year}-${String(month).padStart(2, '0')}-01`]
    );
    res.json(result.rows.map(withRemaining));
  } catch (err) {
    console.error('예약 목록 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '예약 목록 조회 실패', error: err.message });
  }
});

// GET /api/reservations/years
// 전체 펜션을 통틀어 예약 데이터가 존재하는 연도 범위(최소~최대)를 반환한다.
// 달력 상단의 "연도" 드롭다운에서 과거 이동 가능 범위를 정할 때 사용.
// ⚠️ '/:id' 라우트보다 위에 있어야 함 (안 그러면 'years'가 id로 잘못 매칭됨)
router.get('/years', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT MIN(check_in) AS min_date, MAX(check_out) AS max_date FROM reservations'
    );
    const row = result.rows[0];
    res.json({
      minYear: row.min_date ? Number(String(row.min_date).slice(0, 4)) : null,
      maxYear: row.max_date ? Number(String(row.max_date).slice(0, 4)) : null,
    });
  } catch (err) {
    console.error('연도 범위 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '연도 범위 조회 실패', error: err.message });
  }
});

// GET /api/reservations/today?date=YYYY-MM-DD
// 모든 펜션에 대해, 기준 날짜(date, 없으면 서버 날짜)에 묵고 있는 예약과
// 그 다음으로 예정된 예약(가장 가까운 미래 예약)을 함께 반환한다.
// ⚠️ '/:id' 라우트보다 위에 있어야 함 (안 그러면 'today'가 id로 잘못 매칭됨)
router.get('/today', async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const pensionsRes = await pool.query('SELECT id, name FROM pensions ORDER BY id');

    const result = await Promise.all(pensionsRes.rows.map(async (pension) => {
      const todayRes = await pool.query(
        `SELECT * FROM reservations
         WHERE pension_id = $1 AND check_in <= $2 AND check_out > $2
         ORDER BY check_in LIMIT 1`,
        [pension.id, dateStr]
      );
      const nextRes = await pool.query(
        `SELECT * FROM reservations
         WHERE pension_id = $1 AND check_in > $2
         ORDER BY check_in LIMIT 1`,
        [pension.id, dateStr]
      );
      return {
        pension_id: pension.id,
        pension_name: pension.name,
        today: todayRes.rows[0] ? withRemaining(todayRes.rows[0]) : null,
        next: nextRes.rows[0] ? withRemaining(nextRes.rows[0]) : null,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('오늘의 예약 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '오늘의 예약 조회 실패', error: err.message });
  }
});

// GET /api/reservations/:id - 단일 예약 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
    }
    res.json(withRemaining(result.rows[0]));
  } catch (err) {
    console.error('예약 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '예약 조회 실패', error: err.message });
  }
});

// POST /api/reservations - 새 예약 등록
router.post('/', async (req, res) => {
  const {
    pension_id, guest_name, phone, check_in, check_out,
    num_guests, total_price, paid_amount, bbq_requested, memo,
  } = req.body;

  if (!pension_id || !guest_name || !check_in || !check_out) {
    return res.status(400).json({
      success: false,
      message: 'pension_id, guest_name, check_in, check_out은 필수입니다.',
    });
  }
  if (check_out <= check_in) {
    return res.status(400).json({
      success: false,
      message: '체크아웃 날짜는 체크인 날짜보다 늦어야 합니다.',
    });
  }

  try {
    const overlap = await findOverlappingReservation(pension_id, check_in, check_out, null);
    if (overlap) {
      return res.status(409).json({
        success: false,
        message: `같은 기간에 이미 예약이 있습니다: ${overlap.guest_name}님 (${overlap.check_in} ~ ${overlap.check_out}). 한 방에는 하룻밤에 한 팀만 예약할 수 있습니다.`,
      });
    }

    const result = await pool.query(
      `INSERT INTO reservations
        (pension_id, guest_name, phone, check_in, check_out, num_guests, total_price, paid_amount, bbq_requested, memo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        pension_id, guest_name, phone || null, check_in, check_out,
        num_guests || null, total_price || 0, paid_amount || 0,
        bbq_requested || false, memo || null,
      ]
    );
    res.status(201).json(withRemaining(result.rows[0]));
  } catch (err) {
    console.error('예약 등록 오류:', err.message);
    res.status(500).json({ success: false, message: '예약 등록 실패', error: err.message });
  }
});

// PUT /api/reservations/:id - 예약 수정
router.put('/:id', async (req, res) => {
  const {
    guest_name, phone, check_in, check_out,
    num_guests, total_price, paid_amount, bbq_requested, memo,
  } = req.body;

  try {
    const currentRes = await pool.query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
    }
    const current = currentRes.rows[0];
    const finalCheckIn = check_in || current.check_in;
    const finalCheckOut = check_out || current.check_out;

    if (finalCheckOut <= finalCheckIn) {
      return res.status(400).json({
        success: false,
        message: '체크아웃 날짜는 체크인 날짜보다 늦어야 합니다.',
      });
    }

    const overlap = await findOverlappingReservation(current.pension_id, finalCheckIn, finalCheckOut, req.params.id);
    if (overlap) {
      return res.status(409).json({
        success: false,
        message: `같은 기간에 이미 다른 예약이 있습니다: ${overlap.guest_name}님 (${overlap.check_in} ~ ${overlap.check_out}). 한 방에는 하룻밤에 한 팀만 예약할 수 있습니다.`,
      });
    }

    const result = await pool.query(
      `UPDATE reservations SET
        guest_name = COALESCE($1, guest_name),
        phone = COALESCE($2, phone),
        check_in = COALESCE($3, check_in),
        check_out = COALESCE($4, check_out),
        num_guests = COALESCE($5, num_guests),
        total_price = COALESCE($6, total_price),
        paid_amount = COALESCE($7, paid_amount),
        bbq_requested = COALESCE($8, bbq_requested),
        memo = COALESCE($9, memo),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [guest_name, phone, check_in, check_out, num_guests, total_price, paid_amount, bbq_requested, memo, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
    }
    res.json(withRemaining(result.rows[0]));
  } catch (err) {
    console.error('예약 수정 오류:', err.message);
    res.status(500).json({ success: false, message: '예약 수정 실패', error: err.message });
  }
});

// DELETE /api/reservations/:id - 예약 삭제
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reservations WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '예약이 삭제되었습니다.', id: result.rows[0].id });
  } catch (err) {
    console.error('예약 삭제 오류:', err.message);
    res.status(500).json({ success: false, message: '예약 삭제 실패', error: err.message });
  }
});

module.exports = router;
