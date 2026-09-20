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

const ROLE_LABELS = {
  system: '시스템 관리자',
  reservation: '예약 관리자',
  facility: '시설 관리자',
};

const tableBody = document.getElementById('adminTableBody');
const addForm = document.getElementById('addAdminForm');
const addError = document.getElementById('addAdminError');

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildRoleSelect(admin) {
  const select = document.createElement('select');
  select.className = 'role-select';
  Object.entries(ROLE_LABELS).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === admin.role) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = () => changeRole(admin.id, select.value, select);
  return select;
}

async function changeRole(id, role, selectEl) {
  const res = await fetch(`/api/admins/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || '등급 변경에 실패했습니다.');
    loadAdmins(); // 실패 시 원래 값으로 되돌리기 위해 다시 불러옴
    return;
  }
}

async function loadAdmins() {
  const res = await fetch('/api/admins');
  const admins = await res.json();
  tableBody.innerHTML = '';
  admins.forEach((a) => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = a.username;
    const roleTd = document.createElement('td');
    roleTd.appendChild(buildRoleSelect(a));
    const dateTd = document.createElement('td');
    dateTd.textContent = formatDate(a.created_at);
    const actionTd = document.createElement('td');

    const pwBtn = document.createElement('button');
    pwBtn.textContent = '비밀번호 변경';
    pwBtn.onclick = () => openPasswordModal(a.id);
    actionTd.appendChild(pwBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '삭제';
    delBtn.className = 'danger';
    delBtn.onclick = () => deleteAdmin(a.id, a.username);
    actionTd.appendChild(delBtn);

    tr.appendChild(nameTd);
    tr.appendChild(roleTd);
    tr.appendChild(dateTd);
    tr.appendChild(actionTd);
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
  const role = document.getElementById('newRole').value;

  const res = await fetch('/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) {
    addError.textContent = data.message || '추가에 실패했습니다.';
    addError.classList.remove('hidden');
    return;
  }
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newRole').value = 'reservation';
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

// ---- 데이터 백업/복원 ----
function showBackupRestoreMsg(text, type) {
  const el = document.getElementById('backupRestoreMsg');
  el.textContent = text;
  el.className = type || '';
}

document.getElementById('backupBtn').onclick = async () => {
  showBackupRestoreMsg('백업 파일을 생성하는 중입니다...', '');
  const res = await fetch('/api/admins/backup');
  if (!res.ok) {
    let msg = '백업 생성에 실패했습니다.';
    try {
      const data = await res.json();
      if (data.message) msg = data.message;
    } catch (err) {
      // 응답이 JSON이 아니면 기본 메시지 사용
    }
    showBackupRestoreMsg(msg, 'error');
    return;
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `pension-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showBackupRestoreMsg(`백업 파일(${filename})을 다운로드했습니다.`, 'success');
};

document.getElementById('restoreBtn').onclick = async () => {
  const fileInput = document.getElementById('restoreFileInput');
  const file = fileInput.files[0];
  if (!file) {
    showBackupRestoreMsg('복원할 백업 파일을 먼저 선택해주세요.', 'error');
    return;
  }
  if (!confirm('정말 복원할까요?\n현재의 모든 예약/요금 데이터가 사라지고, 선택한 백업 파일 내용으로 완전히 대체됩니다.\n이 작업은 되돌릴 수 없습니다.')) {
    return;
  }

  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch (err) {
    showBackupRestoreMsg('백업 파일을 읽을 수 없습니다. 올바른 JSON 파일인지 확인해주세요.', 'error');
    return;
  }

  showBackupRestoreMsg('복원하는 중입니다...', '');
  const res = await fetch('/api/admins/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    showBackupRestoreMsg(data.message || '복원에 실패했습니다.', 'error');
    return;
  }
  showBackupRestoreMsg(data.message || '복원이 완료되었습니다.', 'success');
  fileInput.value = '';
};

loadAdmins();
