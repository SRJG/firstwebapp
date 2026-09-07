// routes/reservations.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// 응답에 남은 금액(remaining_amount)을 계산해서 붙여주는 헬퍼
function withRemaining(row) {
  return { ...row, remaining_amount: row.total_price - row.paid_amount };
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

  try {
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