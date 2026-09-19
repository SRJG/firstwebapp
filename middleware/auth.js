// middleware/auth.js
// 로그인 여부를 확인하는 미들웨어. 로그인 페이지/관련 정적 파일과 로그인 API만 예외로 통과시키고,
// 나머지(달력 화면, 관리자 화면, 그 외 모든 API)는 전부 로그인해야 볼 수 있도록 막는다.
const PUBLIC_PATHS = new Set(['/login.html', '/login.js', '/style.css', '/favicon.ico']);

function requireLogin(req, res, next) {
  if (req.path === '/api/auth/login' || PUBLIC_PATHS.has(req.path)) {
    return next();
  }
  if (req.session && req.session.adminId) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireLogin };
