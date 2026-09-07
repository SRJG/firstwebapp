// routes/pensions.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/pensions - 펜션 목록(탭) 조회
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM pensions ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('펜션 목록 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '펜션 목록 조회 실패', error: err.message });
  }
});

module.exports = router;