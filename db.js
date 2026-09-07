// db.js
require('dotenv').config();
const { Pool, types } = require('pg');

// PostgreSQL DATE 타입(oid 1082)을 시간대 변환 없이 'YYYY-MM-DD' 문자열 그대로 받기
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;