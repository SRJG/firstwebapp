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

// GET /api/admins/backup - 전체 예약 데이터 백업(다운로드용 JSON)
// 펜션(pensions)은 참고용으로만 포함하고, 예약/요금은 pension_id 대신 pension_name으로 저장해서
// 나중에 복원할 때 DB의 펜션 id가 지금과 달라도(순서가 바뀌어도) 이름으로 다시 연결할 수 있게 한다.
// 관리자 계정(admins)은 비밀번호 해시가 포함되므로 보안상 백업에서 제외한다.
router.get('/backup', async (req, res) => {
  try {
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

    const backup = {
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

    const filename = `pension-backup-${backup.exportedAt.slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('백업 생성 오류:', err.message);
    res.status(500).json({ success: false, message: '백업 생성 실패', error: err.message });
  }
});

// POST /api/admins/restore - 백업 파일로 예약/요금 데이터 복원
// ⚠️ 되돌릴 수 없음: 현재 reservations, daily_rates 데이터를 모두 지우고 백업 내용으로 교체한다.
// (pensions, admins 테이블은 건드리지 않음)
router.post('/restore', async (req, res) => {
  const backup = req.body;

  if (!backup || !Array.isArray(backup.reservations) || !Array.isArray(backup.dailyRates)) {
    return res.status(400).json({
      success: false,
      message: '올바른 백업 파일이 아닙니다. (reservations, dailyRates 형식이 필요합니다)',
    });
  }

  const client = await pool.connect();
  try {
    // 백업 안의 pension_name들이 현재 DB에 전부 존재하는지 먼저 확인 (하나라도 없으면 복원 중단)
    const pensionsResult = await client.query('SELECT id, name FROM pensions');
    const pensionIdByName = {};
    pensionsResult.rows.forEach((p) => { pensionIdByName[p.name] = p.id; });

    const usedNames = new Set([
      ...backup.reservations.map((r) => r.pension_name),
      ...backup.dailyRates.map((d) => d.pension_name),
    ]);
    const missingNames = [...usedNames].filter((name) => !pensionIdByName[name]);
    if (missingNames.length > 0) {
      return res.status(400).json({
        success: false,
        message: `현재 시스템에 없는 펜션이 백업에 포함되어 있습니다: ${missingNames.join(', ')}`,
      });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM daily_rates');
    await client.query('DELETE FROM reservations');

    for (const r of backup.reservations) {
      await client.query(
        `INSERT INTO reservations
          (pension_id, guest_name, phone, check_in, check_out, num_guests, total_price, paid_amount, bbq_requested, memo, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, NOW()), COALESCE($12, NOW()))`,
        [
          pensionIdByName[r.pension_name], r.guest_name, r.phone || null, r.check_in, r.check_out,
          r.num_guests || null, r.total_price || 0, r.paid_amount || 0,
          r.bbq_requested || false, r.memo || null, r.created_at || null, r.updated_at || null,
        ]
      );
    }

    for (const d of backup.dailyRates) {
      await client.query(
        `INSERT INTO daily_rates (pension_id, date, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (pension_id, date) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()`,
        [pensionIdByName[d.pension_name], d.date, d.price || 0]
      );
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `복원 완료: 예약 ${backup.reservations.length}건, 요금 ${backup.dailyRates.length}건`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('백업 복원 오류:', err.message);
    res.status(500).json({ success: false, message: '백업 복원 실패', error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
