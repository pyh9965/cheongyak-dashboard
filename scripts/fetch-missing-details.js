/**
 * 누락된 상세 데이터를 수동으로 가져오는 스크립트
 * Usage: node scripts/fetch-missing-details.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REB_API_KEY;
const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';
const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

async function fetchApi(baseUrl, endpoint, params) {
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set('serviceKey', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString());
  return res.json();
}

async function fetchAndSave(houseManageNo, pblancNo, name) {
  const key = `${houseManageNo}_${pblancNo}`;
  console.log(`\n=== ${name} (${key}) ===`);

  const [competData, specialData, modelData] = await Promise.all([
    fetchApi(COMPET_BASE, 'getAPTLttotPblancCmpet', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
    fetchApi(COMPET_BASE, 'getAPTSpsplyReqstStus', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
    fetchApi(DETAIL_BASE, 'getAPTLttotPblancMdl', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo })
  ]);

  const competRows = competData.data || [];
  const specialRows = specialData.data || [];
  const modelRows = modelData.data || [];

  console.log(`경쟁률: ${competRows.length}건, 특별공급: ${specialRows.length}건, 모델: ${modelRows.length}건`);

  const detail = {
    noticeCompetition: competRows,
    noticeSpecial: specialRows,
    noticeModel: modelRows,
    fetchedAt: new Date().toISOString()
  };

  // Save detail file
  const detailDir = path.join(DATA_DIR, 'details');
  if (!fs.existsSync(detailDir)) fs.mkdirSync(detailDir, { recursive: true });
  const detailPath = path.join(detailDir, `${key}.json`);
  fs.writeFileSync(detailPath, JSON.stringify(detail, null, 2));
  console.log(`상세 파일 저장: ${detailPath}`);

  // Calculate stats
  if (competRows.length > 0) {
    let totalSupply = 0;
    let totalApply = 0;
    const types = {};

    for (const r of competRows) {
      const ty = r.HOUSE_TY;
      if (!types[ty]) {
        types[ty] = { supply: 0, apply: 0 };
      }
      const req = parseInt(r.REQ_CNT) || 0;
      types[ty].apply += req;
      if (r.RESIDE_SECD === '01' && r.SUBSCRPT_RANK_CODE === 1) {
        types[ty].supply = parseInt(r.SUPLY_HSHLDCO) || 0;
      }
    }

    for (const t of Object.values(types)) {
      totalSupply += t.supply;
      totalApply += t.apply;
    }

    const avgRate = totalSupply > 0 ? parseFloat((totalApply / totalSupply).toFixed(2)) : 0;
    console.log(`총 공급: ${totalSupply}, 총 접수: ${totalApply}, 평균 경쟁률: ${avgRate}`);
    return { key, avgRate, totalSupply, totalApply };
  }
  return null;
}

async function main() {
  // Target items to fetch
  const targets = [
    ['2026000014', '2026000014', '천안 아이파크 시티 5단지'],
    ['2026000015', '2026000015', '천안 아이파크 시티 6단지'],
  ];

  const results = [];
  for (const [hm, pb, name] of targets) {
    results.push(await fetchAndSave(hm, pb, name));
  }

  // Update archive calculatedStats
  const archivePath = path.join(DATA_DIR, 'cheongyak-archive.json');
  const archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));

  let updated = 0;
  for (const r of results) {
    if (r) {
      archive.calculatedStats[r.key] = {
        avgCompetitionRate: r.avgRate,
        totalSupply: r.totalSupply,
        totalApplications: r.totalApply
      };
      console.log(`\ncalculatedStats 업데이트: ${r.key}`);
      updated++;
    }
  }

  if (updated > 0) {
    fs.writeFileSync(archivePath, JSON.stringify(archive));
    console.log(`\n✅ 아카이브 캐시 저장 완료 (${updated}건 업데이트)`);
  } else {
    console.log('\n⚠️ 업데이트할 데이터가 없습니다.');
  }
}

main().catch(console.error);
