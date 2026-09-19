// routes/admins.js
// 로그인 가능한 관리자(회원) 계정 관리. 이 라우터는 server.js에서 requireLogin + requireRole('system')
// 뒤에 연결되므로, 여기 도달했다는 것 자체가 이미 로그인된 "시스템 관리자"라는 뜻이다.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');

const VALID_ROLES = ['system', 'reservation', 'facility'];

// GET /api/admins - 관리자 계정 목록 (비밀번호 해시는 응답에서 제외)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('관리자 목록 조회 오류:', err.message);
    res.status(500).json({ success: false, message: '관리자 목록 조회 실패', error: err.message });
  }
});

// POST /api/admins - 관리자 계정 추가
router.post('/', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '아이디와 비밀번호가 필요합니다.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '등급을 올바르게 선택해주세요.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username, hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: '이미 존재하는 아이디입니다.' });
    }
    console.error('관리자 추가 오류:', err.message);
    res.status(500).json({ success: false, message: '관리자 추가 실패', error: err.message });
  }
});

// PUT /api/admins/:id/password - 비밀번호 변경
router.put('/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: '비밀번호는 4자 이상이어야 합니다.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING id, username',
      [hash, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('비밀번호 변경 오류:', err.message);
    res.status(500).json({ success: false, message: '비밀번호 변경 실패', error: err.message });
  }
});

// PUT /api/admins/:id/role - 등급 변경 (마지막 남은 시스템 관리자는 다른 등급으로 못 바꾸게 막음)
router.put('/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '등급을 올바르게 선택해주세요.' });
  }
  try {
    const targetResult = await pool.query('SELECT id, role FROM admins WHERE id = $1', [req.params.id]);
    const target = targetResult.rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
    }
    if (target.role === 'system' && role !== 'system') {
      const countResult = await pool.query("SELECT COUNT(*) FROM admins WHERE role = 'system'");
      if (Number(countResult.rows[0].count) <= 1) {
        return res.status(400).json({ success: false, message: '마지막 남은 시스템 관리자의 등급은 바꿀 수 없습니다.' });
      }
    }
    const result = await pool.query(
      'UPDATE admins SET role = $1 WHERE id = $2 RETURNING id, username, role',
      [role, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('등급 변경 오류:', err.message);
    res.status(500).json({ success: false, message: '등급 변경 실패', error: err.message });
  }
});

// DELETE /api/admins/:id - 관리자 계정 삭제
// (전체 계정 중 마지막 한 명이거나, 마지막 남은 시스템 관리자면 삭제 불가 - 로그인/관리 못하게 되는 상황 방지)
router.delete('/:id', async (req, res) => {
  try {
    const targetResult = await pool.query('SELECT id, role FROM admins WHERE id = $1', [req.params.id]);
    const target = targetResult.rows[0];
    if (!target) {
      return res.status(404).json({ success: false, message: '계정을 찾을 수 없습니다.' });
    }

    const countResult = await pool.query('SELECT COUNT(*) FROM admins');
    if (Number(countResult.rows[0].count) <= 1) {
      return res.status(400).json({ success: false, message: '마지막 남은 관리자 계정은 삭제할 수 없습니다.' });
    }
    if (target.role === 'system') {
      const systemCountResult = await pool.query("SELECT COUNT(*) FROM admins WHERE role = 'system'");
      if (Number(systemCountResult.rows[0].count) <= 1) {
        return res.status(400).json({ success: false, message: '마지막 남은 시스템 관리자는 삭제할 수 없습니다.' });
      }
    }

    const result = await pool.query('DELETE FROM admins WHERE id = $1 RETURNING id', [req.params.id]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('관리자 삭제 오류:', err.message);
    res.status(500).json({ success: false, message: '관리자 삭제 실패', error: err.message });
  }
});

module.exports = router;
