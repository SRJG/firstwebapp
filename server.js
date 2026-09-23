// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');
const { requireLogin, requireRole, blockFacilityWrite } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const adminsRouter = require('./routes/admins');
const pensionsRouter = require('./routes/pensions');
const reservationsRouter = require('./routes/reservations');
const dailyRatesRouter = require('./routes/dailyRates');

const app = express();
app.use(express.json({ limit: '10mb' })); // 백업 복원 시 큰 JSON 파일을 받을 수 있도록 넉넉하게 설정

// 로그인 세션을 PostgreSQL에 저장 (pm2로 서버를 재시작해도 로그인이 풀리지 않도록)
app.use(session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'pension-app-dev-secret-please-change',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // 현재 http로 운영 중이라 false. 나중에 https로 바꾸면 true로 변경할 것.
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
  },
}));

// 로그인 페이지 관련 몇 개 경로를 제외하고 사이트 전체에 로그인을 요구
app.use(requireLogin);

// 관리자(회원 관리) 화면은 시스템 관리자만 볼 수 있음 (다른 등급이면 메인 화면으로)
// 정산 화면은 시스템 관리자 + 예약 관리자까지 볼 수 있음 (시설 관리자는 메인 화면으로)
app.use((req, res, next) => {
  if (req.path === '/admin.html' && (!req.session || req.session.role !== 'system')) {
    return res.redirect('/');
  }
  if (req.path === '/settlement.html' && (!req.session || !['system', 'reservation'].includes(req.session.role))) {
    return res.redirect('/');
  }
  next();
});

app.use(express.static('public'));

// API 라우터 연결
app.use('/api/auth', authRouter);
app.use('/api/admins', requireRole('system'), adminsRouter); // 회원 관리는 시스템 관리자 전용
app.use('/api/pensions', pensionsRouter);
app.use('/api/reservations', blockFacilityWrite, reservationsRouter); // 시설 관리자는 조회만
app.use('/api/daily-rates', blockFacilityWrite, dailyRatesRouter);   // 시설 관리자는 조회만

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

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  경고: .env에 SESSION_SECRET이 설정되어 있지 않습니다. 임시 기본값을 사용 중이니 .env에 추가해주세요.');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   DB 연결 테스트: http://localhost:${PORT}/db-test`);
});
