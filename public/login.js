// public/login.js
const form = document.getElementById('loginForm');
const errorEl = document.getElementById('loginError');

form.onsubmit = async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      errorEl.textContent = data.message || '로그인에 실패했습니다.';
      errorEl.classList.remove('hidden');
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = '로그인 처리 중 오류가 발생했습니다.';
    errorEl.classList.remove('hidden');
    console.error('로그인 실패:', err);
  }
};
