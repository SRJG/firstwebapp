// public/admin.js
// 세션이 만료되어 401이 오면 로그인 페이지로 자동 이동
const _fetch = window.fetch;
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return new Promise(() => {}); // 리다이렉트 중이므로 이후 처리 막음
  }
  return res;
};

const tableBody = document.getElementById('adminTableBody');
const addForm = document.getElementById('addAdminForm');
const addError = document.getElementById('addAdminError');

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadAdmins() {
  const res = await fetch('/api/admins');
  const admins = await res.json();
  tableBody.innerHTML = '';
  admins.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.username}</td>
      <td>${formatDate(a.created_at)}</td>
      <td></td>
    `;
    const actionTd = tr.children[2];

    const pwBtn = document.createElement('button');
    pwBtn.textContent = '비밀번호 변경';
    pwBtn.onclick = () => openPasswordModal(a.id);
    actionTd.appendChild(pwBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '삭제';
    delBtn.className = 'danger';
    delBtn.onclick = () => deleteAdmin(a.id, a.username);
    actionTd.appendChild(delBtn);

    tableBody.appendChild(tr);
  });
}

async function deleteAdmin(id, username) {
  if (!confirm(`'${username}' 계정을 삭제할까요?`)) return;
  const res = await fetch(`/api/admins/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || !data.success) {
    alert(data.message || '삭제에 실패했습니다.');
    return;
  }
  loadAdmins();
}

addForm.onsubmit = async (e) => {
  e.preventDefault();
  addError.classList.add('hidden');
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;

  const res = await fetch('/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    addError.textContent = data.message || '추가에 실패했습니다.';
    addError.classList.remove('hidden');
    return;
  }
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  loadAdmins();
};

// ---- 비밀번호 변경 모달 ----
const pwOverlay = document.getElementById('passwordModalOverlay');
const pwForm = document.getElementById('passwordForm');
const pwError = document.getElementById('passwordError');
const pwTargetId = document.getElementById('passwordTargetId');

function openPasswordModal(id) {
  pwError.classList.add('hidden');
  pwTargetId.value = id;
  document.getElementById('newPasswordInput').value = '';
  pwOverlay.classList.remove('hidden');
}
document.getElementById('closePasswordModal').onclick = () => pwOverlay.classList.add('hidden');

pwForm.onsubmit = async (e) => {
  e.preventDefault();
  pwError.classList.add('hidden');
  const id = pwTargetId.value;
  const password = document.getElementById('newPasswordInput').value;

  const res = await fetch(`/api/admins/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    pwError.textContent = data.message || '변경에 실패했습니다.';
    pwError.classList.remove('hidden');
    return;
  }
  pwOverlay.classList.add('hidden');
};

document.getElementById('logoutBtn').onclick = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
};

loadAdmins();
