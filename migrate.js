// migrate.js
// DB 테이블 생성용 마이그레이션 스크립트
// 실행: node migrate.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('마이그레이션 시작...');

    // 1) pensions 테이블 (사랑채 / 별채 / 바깥채)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pensions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE
      );
    `);
    console.log('✅ pensions 테이블 확인/생성 완료');

    // 2) reservations 테이블 (예약 정보)
    await client.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        pension_id INTEGER NOT NULL REFERENCES pensions(id) ON DELETE CASCADE,
        guest_name VARCHAR(100) NOT NULL,
        phone VARCHAR(30),
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        num_guests INTEGER,
        total_price INTEGER DEFAULT 0,
        paid_amount INTEGER DEFAULT 0,
        bbq_requested BOOLEAN DEFAULT false,
        memo TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ reservations 테이블 확인/생성 완료');

    // 2-1) reservations 테이블에 "오늘의 예약" 화면 현장 처리용 컬럼 추가 (이미 있으면 건너뜀)
    //      arrived: 도착(체크인) 여부, bbq_completed: 바베큐 실행 여부
    //      시설 관리자도 오늘의 예약 화면에서 이 두 항목과 받은 금액(paid_amount)만은
    //      직접 수정할 수 있음 (예약 정보 자체는 여전히 수정 불가)
    await client.query(`
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrived BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE reservations ADD COLUMN IF NOT EXISTS bbq_completed BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('✅ reservations.arrived / bbq_completed 컬럼 확인/추가 완료');

    // 3) daily_rates 테이블 (펜션별 날짜별 1박 요금)
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_rates (
        id SERIAL PRIMARY KEY,
        pension_id INTEGER NOT NULL REFERENCES pensions(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        price INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (pension_id, date)
      );
    `);
    console.log('✅ daily_rates 테이블 확인/생성 완료');

    // 4) admins 테이블 (로그인 가능한 관리자/회원 계정)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ admins 테이블 확인/생성 완료');

    // 4-1) admins 테이블에 등급(role) 컬럼 추가 (이미 있으면 건너뜀)
    //      system(시스템 관리자) / reservation(예약 관리자) / facility(시설 관리자, 조회만 가능)
    //      기존에 만들어져 있던 계정은 전부 시스템 관리자로 유지됨 (DEFAULT 'system')
    await client.query(`
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'system';
    `);
    console.log('✅ admins.role 컬럼 확인/추가 완료');

    // 5) 펜션 3곳 초기 데이터 삽입 (이미 있으면 건너뜀)
    await client.query(`
      INSERT INTO pensions (name) VALUES
        ('사랑채'),
        ('별채'),
        ('바깥채')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log('✅ 펜션 초기 데이터(사랑채/별채/바깥채) 확인/삽입 완료');

    console.log('🎉 마이그레이션 완료!');
  } catch (err) {
    console.error('❌ 마이그레이션 실패:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
