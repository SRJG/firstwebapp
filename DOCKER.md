# Docker로 배포하기 (컨테이너 1개, Postgres 공식 이미지 기반)

지금까지는 VPS(`ubuntu26`, `~/wr/code/myapp`)에서 `git pull` + `pm2 restart myapp`로 배포했는데,
이제 **postgres 공식 이미지를 베이스로, 그 안에 우리 Node 앱을 심은 컨테이너 1개**로 배포할 수
있습니다. DB 데이터 파일과 `.env`는 이미지/컨테이너 안에 들어있지 않고 호스트(VPS)에 그대로
남아있기 때문에, 서버에 문제가 생기면 **컨테이너만 새로 올리고 백업해둔 `pgdata` 폴더와 `.env`만
그 자리에 다시 넣어주면 복구**됩니다.

## 구성

- `Dockerfile` — `postgres:16-alpine`(공식 이미지)를 베이스로, 그 위에 Node.js를 설치하고 이 앱을 심어서 빌드
- `docker-entrypoint-app.sh` — 컨테이너 시작 시: ① Postgres 공식 초기화 스크립트를 백그라운드로 실행 → ② Postgres가 준비될 때까지 대기 → ③ `migrate.js`(테이블 생성 + 펜션 3곳 초기 데이터) 실행 → ④ Node 서버 실행. 둘 중 하나라도 죽으면 컨테이너도 같이 종료됩니다 (Docker의 `restart: unless-stopped`가 재기동을 처리).
- `docker-compose.yml` — 컨테이너 1개(`app`)만 정의. `./pgdata` 폴더를 Postgres 데이터 디렉터리로, `.env` 파일을 환경변수로 연결
- `.env.docker.example` — 배포용 환경변수 예시 파일 (실제 값은 `.env`로 복사해서 채움, git에는 안 올라감)

⚠️ 처음 실행하면 **DB는 완전히 빈 상태**로 시작합니다 (테이블만 자동 생성됨). 지금 192.168.1.21에 있는
실제 예약 데이터를 옮기고 싶다면, 전환 전에 관리자 페이지의 "백업 다운로드"로 미리 백업 파일을
받아두고, Docker로 전환한 뒤 관리자 페이지의 "복원" 기능으로 그 파일을 업로드하면 됩니다.

## VPS에서 처음 배포할 때

1. **Docker / Docker Compose 설치 확인**
   ```
   docker --version
   docker compose version
   ```

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
   이 파일은 `pgdata` 폴더와 함께 **서버 바깥에 안전하게 따로 백업**해두세요 — 나중에 복구할 때 이 두 가지만 있으면 됩니다.

4. **기존 pm2 프로세스 정지**
   ```
   pm2 stop myapp
   pm2 delete myapp
   ```

5. **빌드 및 실행**
   ```
   docker compose up -d --build
   ```
   처음 실행 시 Postgres 데이터가 없으므로 자동으로 초기화되고, 테이블이 생성된 뒤 서버가 시작됩니다.
   Postgres 데이터는 프로젝트 폴더 안의 `pgdata/` 폴더에 저장됩니다 (git에는 올라가지 않음).

6. **로그로 정상 시작 확인**
   ```
   docker compose logs -f app
   ```
   "🐘 Postgres 초기화/시작" → "✅ Postgres 준비 완료" → "🔧 마이그레이션 실행 중..." → "🚀 앱 서버 시작" 순서로 보이면 정상입니다.

7. **최초 관리자 계정 만들기**
   ```
   docker compose exec -it app node create-admin.js
   ```

8. **(선택) 기존 예약 데이터 복원**
   Docker로 전환하기 전에 기존 사이트에서 백업 파일을 받아뒀다면, 브라우저로 접속해서
   로그인 후 관리자 페이지 → "이 파일로 복원"으로 업로드하면 됩니다.

## 서버에 문제가 생겼을 때 (복구)

이게 이 구조를 만든 핵심 목적입니다. `pgdata` 폴더와 `.env` 파일만 있으면 됩니다.

```
cd ~/wr/code/myapp        # (또는 코드를 새로 받은 폴더)
git pull                  # 코드가 최신인지 확인
# pgdata 폴더와 .env 파일을 백업해둔 곳에서 이 폴더 위치로 복사
docker compose up -d --build
```
`pgdata` 폴더 안에 기존 DB 파일이 그대로 있으면, 컨테이너가 시작될 때 `initdb`를 다시 하지 않고
그 데이터를 그대로 이어서 사용합니다.

## DB 백업 방법 (pgdata 폴더를 안전하게 복사해두는 법)

Postgres가 켜진 상태에서 `pgdata` 폴더를 그냥 복사하면 데이터가 깨질 수 있습니다. 아래 두 방법 중
하나를 쓰세요.

**방법 A — 켜진 상태에서 안전하게 (권장, `pg_dump`)**
```
docker compose exec app pg_dump -U <DB_USER> -d <DB_NAME> -F c -f /tmp/backup.dump
docker compose cp app:/tmp/backup.dump ./backup-$(date +%Y%m%d).dump
```
복원할 때는 빈 DB 상태에서:
```
docker compose cp ./backup-YYYYMMDD.dump app:/tmp/backup.dump
docker compose exec app pg_restore -U <DB_USER> -d <DB_NAME> /tmp/backup.dump
```

**방법 B — 컨테이너를 멈추고 폴더째 복사 (더 단순하지만 그동안 서비스가 중단됨)**
```
docker compose stop
cp -r pgdata pgdata-backup-$(date +%Y%m%d)
docker compose start
```

**방법 C — 앱 자체의 백업/복원 기능**
관리자 페이지의 "백업 다운로드"/"복원"도 여전히 그대로 사용할 수 있습니다. 이건 예약·요금
데이터만 JSON으로 다루는 앱 차원의 백업이라 더 가볍고, 회원 계정 등 DB 전체를 다루는 방법 A/B와는
성격이 다릅니다. 평소엔 C로 가볍게, 중요한 시점엔 A로 DB 전체를 백업해두는 걸 추천합니다.

## 자주 쓰는 명령어

- 재시작: `docker compose restart app`
- 코드 수정 후 재배포: `git pull && docker compose up -d --build`
- 컨테이너/로그 상태 확인: `docker compose ps`, `docker compose logs -f`
- 전체 중지 (데이터는 `pgdata` 폴더에 그대로 남음): `docker compose down`
- DB 컨테이너 안에 직접 들어가서 psql 실행: `docker compose exec app psql -U <DB_USER> -d <DB_NAME>`
