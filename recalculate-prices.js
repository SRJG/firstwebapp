// recalculate-prices.js
//
// 지금까지 입력된 모든 예약의 "총 요금(total_price)"을 새로 정한 요금 기준
// (펜션별 요일별 1박 요금 + 기준 인원 초과 인원 요금 + 바베큐 요금)으로 다시 계산해서 덮어씁니다.
//
// 실행 방법 (프로젝트 폴더에서):
//   node recalculate-prices.js
//
// - 실행 전에 DB 백업을 권장합니다.
// - 인원수가 입력 안 된 예약은 해당 펜션의 기준 인원(사랑채4/별채3/바깥채2)으로 간주해 계산합니다.
// - 바베큐를 요청했고 인원이 4인을 초과하는 예약을 만나면, 터미널에서 추가 바베큐 요금을
//   직접 입력하라는 안내가 나옵니다. 모르면 그냥 Enter를 누르면 추가금 0원으로 처리됩니다.

require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');
const {
  calcStayPrice,
  calcBbqPrice,
  BBQ_BASE_GUESTS,
  BBQ_BASE_PRICE,
} = require('./public/pricing');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function formatNumber(n) {
  return Number(n).toLocaleString('ko-KR');
}

async function main() {
  const client = await pool.connect();
  try {
    const pensionsRes = await client.query('SELECT id, name FROM pensions');
    const pensionMap = {};
    pensionsRes.rows.forEach((p) => { pensionMap[p.id] = p.name; });

    const resvRes = await client.query('SELECT * FROM reservations ORDER BY check_in');
    console.log(`총 ${resvRes.rows.length}건의 예약을 새 요금 기준으로 재계산합니다.\n`);

    let updated = 0;
    let skipped = 0;

    for (const r of resvRes.rows) {
      const pensionName = pensionMap[r.pension_id];
      if (!pensionName) {
        console.log(`⚠️  펜션 ID ${r.pension_id}를 찾을 수 없어 건너뜀 (예약 #${r.id}, ${r.guest_name})`);
        skipped++;
        continue;
      }

      const guests = r.num_guests || null; // null이면 calcStayPrice 내부에서 기준 인원으로 처리
      const stayPrice = calcStayPrice(pensionName, r.check_in, r.check_out, guests);

      let bbqPrice = 0;
      if (r.bbq_requested) {
        const effectiveGuests = guests || 0;
        if (effectiveGuests > BBQ_BASE_GUESTS) {
          const answer = await ask(
            `\n[예약 #${r.id}] ${pensionName} / ${r.guest_name} / ${r.check_in}~${r.check_out} / 인원 ${effectiveGuests}명\n` +
            `바베큐 인원이 ${BBQ_BASE_GUESTS}인을 초과합니다. 기본요금(₩${formatNumber(BBQ_BASE_PRICE)}) 외 추가로 받을 금액을 입력하세요 (모르면 Enter=0): `
          );
          const extra = Number(String(answer).replace(/,/g, '')) || 0;
          bbqPrice = calcBbqPrice(effectiveGuests, extra);
        } else {
          bbqPrice = calcBbqPrice(effectiveGuests);
        }
      }

      const newTotal = stayPrice + bbqPrice;

      await client.query(
        'UPDATE reservations SET total_price = $1, updated_at = NOW() WHERE id = $2',
        [newTotal, r.id]
      );
      console.log(
        `✅ #${r.id} ${r.guest_name} (${pensionName}, ${r.check_in}~${r.check_out}, 인원 ${r.num_guests || '미입력'}): ` +
        `${formatNumber(r.total_price)}원 → ${formatNumber(newTotal)}원`
      );
      updated++;
    }

    console.log(`\n🎉 완료: ${updated}건 업데이트, ${skipped}건 건너뜀.`);
  } catch (err) {
    console.error('❌ 재계산 중 오류:', err.message);
  } finally {
    rl.close();
    client.release();
    await pool.end();
  }
}

main();
