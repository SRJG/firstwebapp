# Docker로 배포하기

지금까지는 VPS(`ubuntu26`, `~/wr/code/myapp`)에서 `git pull` + `pm2 restart myapp`로 배포했는데,
이제 Postgres 공식 Docker 이미지를 기반으로 앱과 DB를 한 번에 `docker compose up`으로 띄우는
방식으로 바꿀 수 있습니다. 이 문서는 **VPS의 pm2 배포를 Docker로 완전히 교체**하는 절차입니다.

## 구성

- `Dockerfile` — Node 앱(이 프로젝트)을 이미지로 빌드
- `docker-compose.yml` — `db`(postgres:16-alpine 공식 이미지) + `app`(위 Dockerfile로 빌드) 두 컨테이너를 함께 실행
- `docker-entrypoint.sh` — 앱 컨테이너 시작 시 DB가 뜰 때까지 기다린 다음, `migrate.js`(테이블 생성 + 펜션 3곳 초기 데이터)를 자동 실행하고 서버를 시작
- `.env.docker.example` — 배포용 환경변수 예시 파일 (실제 값은 `.env`로 복사해서 채움, git에는 안 올라감)

⚠️ 처음 실행하면 **DB는 완전히 빈 상태**로 시작합니다 (테이블만 자동 생성됨). 지금 192.168.1.21에 있는
실제 예약 데이터를 옮기고 싶다면, 전환 전에 관리자 페이지의 "백업 다운로드"로 미리 백업 파일을
받아두고, Docker로 전환한 뒤 관리자 페이지의 "복원" 기능으로 그 파일을 업로드하면 됩니다.

## VPS에서 진행할 순서

1. **Docker / Docker Compose 설치 확인**
   ```
   docker --version
   docker compose version
   ```
   없다면 먼저 설치해야 합니다 (배포판에 맞는 공식 설치 가이드 참고).

2. **최신 코드 받기**
   ```
   cd ~/wr/code/myapp
   git pull
   ```

3. **환경변수 파일 준비**
   ```
   cp .env.docker.example .env
   ```
   `.env`를 열어서 `DB_PASSWORD`와 `SESSION_SECRET`을 실제 값으로 채웁니다.
   (기존에 쓰던 `SESSION_SECRET` 값을 그대로 써도 되고, 새로 생성해도 됩니다.)

4. **기존 pm2 프로세스 정지**
   ```
   pm2 stop myapp
   pm2 delete myapp
   ```
   (같은 포트를 Docker 컨테이너가 새로 쓰게 되므로, pm2로 떠 있는 기존 프로세스를 먼저 내려야 합니다.)

5. **빌드 및 실행**
   ```
   docker compose up -d --build
   ```
   처음 실행 시 Postgres 이미지를 내려받고, 앱 이미지를 빌드하고, DB가 준비되면 자동으로
   테이블을 만든 뒤 서버가 시작됩니다.

6. **로그로 정상 시작 확인**
   ```
   docker compose logs -f app
   ```
   "✅ PostgreSQL 연결 확인됨" → "🔧 마이그레이션 실행 중..." → 서버 시작 메시지가 보이면 정상입니다.
   (Ctrl+C로 로그 보기 종료, 컨테이너는 계속 실행됨)

7. **최초 관리자 계정 만들기**
   ```
   docker compose exec -it app node create-admin.js
   ```
   대화형으로 아이디/비밀번호/등급을 입력하면 됩니다.

8. **(선택) 기존 예약 데이터 복원**
   Docker로 전환하기 전에 기존 사이트에서 백업 파일을 받아뒀다면, 브라우저로 접속해서
   로그인 후 관리자 페이지 → "이 파일로 복원"으로 업로드하면 됩니다.

## 자주 쓰는 명령어

- 재시작: `docker compose restart app`
- 코드 수정 후 재배포: `git pull && docker compose up -d --build`
- 컨테이너/로그 상태 확인: `docker compose ps`, `docker compose logs -f`
- 전체 중지: `docker compose down` (DB 데이터는 `pgdata` 볼륨에 남아있어 삭제되지 않음)
- DB까지 완전히 초기화하고 싶을 때만: `docker compose down -v` (⚠️ 데이터 전부 삭제됨, 주의)
