// middleware/auth.js
// 로그인 여부 + 등급(권한)을 확인하는 미들웨어들.
// 등급: system(시스템 관리자, 전체 기능) / reservation(예약 관리자, 관리자 페이지 제외 전체) /
//       facility(시설 관리자, 조회만 가능)
const PUBLIC_PATHS = new Set(['/login.html', '/login.js', '/style.css', '/favicon.ico']);

// 로그인 페이지/관련 정적 파일과 로그인 API만 예외로 통과시키고,
// 나머지(달력 화면, 관리자 화면, 그 외 모든 API)는 전부 로그인해야 볼 수 있도록 막는다.
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

// 지정한 등급들만 통과. 그 외 등급이면 API는 403, 화면 요청은 메인 화면으로 돌려보낸다.
// (requireLogin 뒤에 붙여써서 로그인은 이미 됐다고 가정)
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && roles.includes(req.session.role)) {
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ success: false, message: '이 기능을 사용할 권한이 없습니다.' });
    }
    return res.redirect('/');
  };
}

// 시설 관리자(facility)는 조회(GET)만 가능하고, 그 외 방식(POST/PUT/DELETE)은 막는다.
// 단, "오늘의 예약" 화면에서 도착 여부/바베큐 실행 여부/받은 금액만 수정하는
// PATCH /api/reservations/:id/today-status 요청은 예외로 허용한다 (예약 정보 자체는 여전히 수정 불가).
const TODAY_STATUS_PATH_RE = /^\/\d+\/today-status$/;
function blockFacilityWrite(req, res, next) {
  const isTodayStatusUpdate = req.method === 'PATCH' && TODAY_STATUS_PATH_RE.test(req.path);
  if (req.session && req.session.role === 'facility' && req.method !== 'GET' && !isTodayStatusUpdate) {
    return res.status(403).json({ success: false, message: '시설 관리자는 조회만 가능하고 수정은 할 수 없습니다.' });
  }
  next();
}

module.exports = { requireLogin, requireRole, blockFacilityWrite };
