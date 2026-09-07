// server.js
require('dotenv').config();
const express = require('express');
const pool = require('./db');
const pensionsRouter = require('./routes/pensions');
const reservationsRouter = require('./routes/reservations');

const app = express();
app.use(express.json()); // POST/PUT 요청의 JSON body 파싱

// 서버 상태 확인용 기본 라우트
app.get('/', (req, res) => {
  res.send('서버가 정상적으로 실행 중입니다.');
});

// DB 연결 테스트 라우트
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({ success: true, message: 'PostgreSQL 연결 성공!', dbTime: result.rows[0].current_time });
  } catch (err) {
    console.error('DB 연결 오류:', err.message);
    res.status(500).json({ success: false, message: 'PostgreSQL 연결 실패', error: err.message });
  }
});

// API 라우터 연결
app.use('/api/pensions', pensionsRouter);
app.use('/api/reservations', reservationsRouter);

// 서버 시작 시 DB 연결도 즉시 한 번 확인
pool.connect()
  .then((client) => {
    console.log('✅ PostgreSQL 서버 연결 확인됨 (최초 연결 성공)');
    client.release();
  })
  .catch((err) => {
    console.error('❌ PostgreSQL 최초 연결 실패:', err.message);
    console.error('   .env 파일의 DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME을 확인하세요.');
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   DB 연결 테스트: http://localhost:${PORT}/db-test`);
});
