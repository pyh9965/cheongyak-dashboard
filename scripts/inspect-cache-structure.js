// 캐시 데이터 구조 상세 분석
const fs = require('fs');
const path = require('path');

const cacheFilePath = path.join(__dirname, '../data/cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));

console.log('🔍 캐시 데이터 구조 상세 분석\n');

// 첫 번째 통계 항목의 전체 구조 출력
const statsKeys = Object.keys(cache.calculatedStats || {});
if (statsKeys.length > 0) {
    const firstKey = statsKeys[0];
    const firstStat = cache.calculatedStats[firstKey];

    console.log(`첫 번째 통계 항목 (${firstKey}):\n`);
    console.log(JSON.stringify(firstStat, null, 2));

    console.log('\n\n='.repeat(60));

    // request가 있는 항목 찾기
    console.log('\n🔎 request 데이터가 있는 항목 찾기...\n');

    let foundWithRequest = null;
    for (const key of statsKeys) {
        const stats = cache.calculatedStats[key];
        if (stats.totals?.stages?.total?.request && stats.totals.stages.total.request > 0) {
            foundWithRequest = { key, stats };
            break;
        }
    }

    if (foundWithRequest) {
        console.log('✅ request 데이터 있는 항목 발견!');
        console.log(`Key: ${foundWithRequest.key}\n`);
        console.log(JSON.stringify(foundWithRequest.stats, null, 2));
    } else {
        console.log('❌ request 데이터가 있는 항목을 찾을 수 없습니다.');
        console.log('\n가능한 이유:');
        console.log('1. 캐시 생성 시 경쟁률 데이터가 포함되지 않음');
        console.log('2. 캐시 생성 시점에 청약 마감되지 않은 항목만 있음');
        console.log('3. API 데이터 구조 변경');
    }
}
