// backup-scheduler.js
// 매일 정해진 시간(기본 새벽 4시, 서버 시간 기준)에 예약/요금 데이터를 통째로
// JSON 파일로 저장한다. server.js가 시작될 때 scheduleDailyBackup()을 한 번 호출하면,
// 그 뒤로는 서버가 떠 있는 동안 계속 매일 자동으로 실행된다(pm2/Docker가 서버를 계속
// 살려두므로 별도의 VPS crontab 설정 없이 이 안에서 알아서 돌아간다).
//
// 오래된 백업은 자동으로 정리해서 디스크가 무한정 차지 않도록 한다(기본 30일 보관).
//
// 환경변수로 조정 가능(.env, 전부 선택):
//   BACKUP_HOUR=4          # 실행 시(0~23), 기본 4시
//   BACKUP_MINUTE=0        # 실행 분(0~59), 기본 0분
//   BACKUP_DIR=./backups   # 백업 파일 저장 폴더, 기본 프로젝트 폴더 안 backups/
//   BACKUP_RETENTION_DAYS=30  # 이 일수보다 오래된 백업 파일은 자동 삭제, 기본 30일
const fs = require('fs');
const path = require('path');
const { buildBackupData } = require('./backup');

const BACKUP_HOUR = Number(process.env.BACKUP_HOUR ?? 4);
const BACKUP_MINUTE = Number(process.env.BACKUP_MINUTE ?? 0);
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(__dirname, 'backups');
const BACKUP_RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

const FILENAME_RE = /^pension-backup-(\d{4}-\d{2}-\d{2})\.json$/;

function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function cleanupOldBackups() {
  try {
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    fs.readdirSync(BACKUP_DIR).forEach((filename) => {
      const match = filename.match(FILENAME_RE);
      if (!match) return; // 자동 백업이 만든 파일이 아니면 건드리지 않음
      const fileTime = new Date(match[1]).getTime();
      if (!Number.isNaN(fileTime) && fileTime < cutoff) {
        fs.unlinkSync(path.join(BACKUP_DIR, filename));
        console.log(`🗑️  [자동 백업] 오래된 백업 삭제: ${filename}`);
      }
    });
  } catch (err) {
    console.error('❌ [자동 백업] 오래된 파일 정리 실패:', err.message);
  }
}

async function runBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = await buildBackupData();
    const filename = `pension-backup-${backup.exportedAt.slice(0, 10)}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(backup, null, 2), 'utf-8');
    console.log(`✅ [자동 백업] ${filename} 저장 완료 (예약 ${backup.reservations.length}건)`);
    cleanupOldBackups();
  } catch (err) {
    console.error('❌ [자동 백업] 실패:', err.message);
  }
}

function scheduleDailyBackup() {
  const delay = msUntilNext(BACKUP_HOUR, BACKUP_MINUTE);
  console.log(
    `⏰ 자동 백업 예약됨: 매일 ${String(BACKUP_HOUR).padStart(2, '0')}:${String(BACKUP_MINUTE).padStart(2, '0')} ` +
    `(다음 실행: ${new Date(Date.now() + delay).toLocaleString('ko-KR')})`
  );
  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, delay);
}

module.exports = { scheduleDailyBackup, runBackup };
