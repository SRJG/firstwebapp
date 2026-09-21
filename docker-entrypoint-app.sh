#!/usr/bin/env bash
# 컨테이너 하나 안에서 Postgres + 우리 Node 앱을 함께 띄우는 entrypoint.
#
#   1) Postgres 공식 초기화 스크립트(docker-entrypoint.sh)를 백그라운드로 실행
#      → 데이터가 없으면 initdb, 있으면 그대로 기동 (DB 데이터는 볼륨으로 컨테이너 밖에 있음)
#   2) Postgres가 준비될 때까지 대기
#   3) 마이그레이션(테이블 생성 + 펜션 3곳 초기 데이터) 실행
#   4) Node 서버 실행
#   5) 둘 중 하나라도 죽으면 컨테이너도 같이 종료 (docker restart policy가 재기동 처리)
#
# .env(DB_USER/DB_PASSWORD/DB_NAME/SESSION_SECRET)는 이미지 안에 들어있지 않고
# `docker run --env-file` 또는 compose의 env_file로 실행 시점에 주입된다.
set -e

: "${DB_PASSWORD:?DB_PASSWORD 환경변수가 필요합니다. .env 파일을 확인하세요.}"

# 앱에서 쓰는 이름(DB_USER 등)을 postgres 공식 이미지가 기대하는 이름(POSTGRES_USER 등)으로 매핑
export POSTGRES_USER="${DB_USER:-app_user}"
export POSTGRES_PASSWORD="$DB_PASSWORD"
export POSTGRES_DB="${DB_NAME:-myapp_db}"

echo "🐘 Postgres 초기화/시작..."
docker-entrypoint.sh postgres &
PG_PID=$!
APP_PID=""

shutdown() {
  echo "🛑 종료 신호 수신, 정리 중..."
  if [ -n "$APP_PID" ]; then
    kill -TERM "$APP_PID" 2>/dev/null || true
  fi
  kill -TERM "$PG_PID" 2>/dev/null || true
  wait "$APP_PID" "$PG_PID" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

echo "⏳ Postgres 준비 대기 중..."
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1 > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Postgres 준비 완료"

echo "🔧 마이그레이션 실행 중 (테이블 생성 + 펜션 초기 데이터)..."
node /app/migrate.js

echo "🚀 앱 서버 시작"
node /app/server.js &
APP_PID=$!

wait -n "$PG_PID" "$APP_PID"
EXIT_CODE=$?
echo "⚠️ 프로세스가 종료되어 컨테이너를 종료합니다 (exit $EXIT_CODE)"
exit "$EXIT_CODE"
