// routes/dailyRates.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/daily-rates?pension_id=1&start=2026-09-01&end=2026-09-30
// start, end 둘 다 포함해서 조회 (조회용이라 굳이 exclusive로 안 함)
router.get('/', async (req, res) => {
  const { pension_id, start, end } = req.query;

  if (!pension_id || !start || !end) {
    return res.status(400).json({
      success: false,
      message: 'pension_id, start, end 쿼리 파라미터가 필요합니다.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT date, price FROM daily_rates
       WHERE pension_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [pension_id, start, end]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('요금 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '요금 조회 실패', error: err.message });
  }
});

// POST /api/daily-rates
// body: { pension_id: 1, dates: ['2026-09-10', '2026-09-11', ...], price: 100000 }
// 선택한 날짜들에 동일한 1박 요금을 일괄 저장 (있으면 갱신, 없으면 생성)
router.post('/', async (req, res) => {
  const { pension_id, dates, price } = req.body;

  if (!pension_id || !Array.isArray(dates) || dates.length === 0 || price === undefined || price === null) {
    return res.status(400).json({
      success: false,
      message: 'pension_id, dates(배열), price가 필요합니다.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const date of dates) {
      await client.query(
        `INSERT INTO daily_rates (pension_id, date, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (pension_id, date)
         DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
        [pension_id, date, price]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `${dates.length}일의 요금이 저장되었습니다.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('요금 저장 오류:', err.message);
    res.status(500).json({ success: false, message: '요금 저장 실패', error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
