// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
  }
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    res.json({ success: true, username: admin.username });
  } catch (err) {
    console.error('로그인 오류:', err.message);
    res.status(500).json({ success: false, message: '로그인 처리 중 오류가 발생했습니다.', error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/me - 현재 로그인 상태 확인 (로그인 안 돼있으면 requireLogin 미들웨어에서 이미 401 처리됨)
router.get('/me', (req, res) => {
  res.json({ loggedIn: true, username: req.session.username });
});

module.exports = router;
