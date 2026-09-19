// create-admin.js
// 로그인 가능한 관리자 계정을 만드는 스크립트. 로그인 기능을 처음 켤 때 최초 계정을 만들거나,
// 비밀번호를 잊었을 때 같은 아이디로 다시 실행해서 비밀번호를 재설정하는 용도로도 쓸 수 있다.
//
// 실행 방법: node create-admin.js

const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  try {
    const username = (await ask('아이디: ')).trim();
    const password = (await ask('비밀번호: ')).trim();
    if (!username || !password) {
      console.log('❌ 아이디와 비밀번호를 모두 입력해야 합니다.');
      return;
    }
    if (password.length < 4) {
      console.log('❌ 비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, username`,
      [username, hash]
    );
    console.log(`✅ 관리자 계정 준비 완료: ${result.rows[0].username} (id: ${result.rows[0].id})`);
  } catch (err) {
    console.error('❌ 관리자 계정 생성 실패:', err.message);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
