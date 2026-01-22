// 캐시 데이터 분석 스크립트
const fs = require('fs');
const path = require('path');

console.log('📊 청약 캐시 데이터 분석 시작...\n');

// 캐시 파일 로드
const cacheFilePath = path.join(__dirname, '../data/cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));

console.log('✅ 캐시 파일 로드 완료');
console.log(`   파일 크기: ${(fs.statSync(cacheFilePath).size / 1024 / 1024).toFixed(2)} MB\n`);

// 메타데이터 출력
console.log('📋 메타데이터:');
console.log(`   생성일: ${cache.metadata?.generatedAt}`);
console.log(`   전체 항목 수: ${cache.metadata?.totalCount}`);
console.log(`   통계 항목 수: ${cache.metadata?.statsCount || cache.metadata?.detailCount || 0}`);
console.log(`   기간: ${cache.metadata?.dateRange?.start} ~ ${cache.metadata?.dateRange?.end}\n`);

// 데이터 구조 확인
console.log('🔍 데이터 구조 분석:');
console.log(`   lists 배열 크기: ${cache.lists?.length || 0}`);
console.log(`   calculatedStats 객체: ${cache.calculatedStats ? 'exists' : 'missing'}`);
if (cache.calculatedStats) {
    const statsKeys = Object.keys(cache.calculatedStats);
    console.log(`   calculatedStats 항목 수: ${statsKeys.length}`);

    // 첫 번째 통계 샘플 출력
    if (statsKeys.length > 0) {
        const firstKey = statsKeys[0];
        const firstStat = cache.calculatedStats[firstKey];
        console.log(`\n   샘플 통계 (${firstKey}):`);
        console.log(`   - supplyTotal: ${firstStat.totals?.supplyTotal}`);
        console.log(`   - stages.total.request: ${firstStat.totals?.stages?.total?.request}`);
        console.log(`   - stages.total.rate: ${firstStat.totals?.stages?.total?.rate}`);
        console.log(`   - stages.rank1.request: ${firstStat.totals?.stages?.rank1?.request}`);
        console.log(`   - stages.rank1.rate: ${firstStat.totals?.stages?.rank1?.rate}`);
    }
}

// 전체 통계 계산
console.log('\n📊 전체 통계 계산 중...\n');

let totalSupply = 0;
let totalRequest = 0;
let rank1Supply = 0;
let rank1Request = 0;
let specialSupply = 0;
let specialRequest = 0;
let validStatsCount = 0;

if (cache.calculatedStats) {
    Object.entries(cache.calculatedStats).forEach(([key, stats]) => {
        if (stats.totals && stats.totals.stages) {
            validStatsCount++;

            totalSupply += stats.totals.supplyTotal || 0;
            totalRequest += stats.totals.stages.total?.request || 0;

            rank1Supply += stats.totals.stages.rank1?.target || 0;
            rank1Request += stats.totals.stages.rank1?.request || 0;

            specialSupply += stats.totals.stages.special?.target || 0;
            specialRequest += stats.totals.stages.special?.request || 0;
        }
    });
}

console.log('='.repeat(60));
console.log('🎯 최종 집계 결과');
console.log('='.repeat(60));
console.log(`총 공급 규모: ${totalSupply.toLocaleString()} 세대`);
console.log(`총 청약 건수: ${totalRequest.toLocaleString()} 건`);
console.log(`전체 경쟁률: ${totalSupply > 0 ? (totalRequest / totalSupply).toFixed(2) : '0.00'}:1`);
console.log(`1순위 경쟁률: ${rank1Supply > 0 ? (rank1Request / rank1Supply).toFixed(2) : '0.00'}:1`);
console.log(`특별공급 경쟁률: ${specialSupply > 0 ? (specialRequest / specialSupply).toFixed(2) : '0.00'}:1`);
console.log(`\n유효 통계 항목 수: ${validStatsCount}`);
console.log('='.repeat(60));

// 지역별 통계
console.log('\n📍 지역별 통계:\n');
const regionStats = {};

cache.lists?.forEach((item) => {
    const region = item.SUBSCRPT_AREA_CODE_NM || '미분류';
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    const stats = cache.calculatedStats?.[key];

    if (!regionStats[region]) {
        regionStats[region] = {
            count: 0,
            supply: 0,
            request: 0
        };
    }

    regionStats[region].count++;
    regionStats[region].supply += stats?.totals?.supplyTotal || 0;
    regionStats[region].request += stats?.totals?.stages?.total?.request || 0;
});

Object.entries(regionStats)
    .sort((a, b) => b[1].request - a[1].request)
    .slice(0, 10)
    .forEach(([region, data]) => {
        const rate = data.supply > 0 ? (data.request / data.supply).toFixed(2) : '0.00';
        console.log(`${region.padEnd(15)} | 건수: ${String(data.count).padStart(3)} | 공급: ${String(data.supply).padStart(6)} | 청약: ${String(data.request).padStart(8)} | 경쟁률: ${rate}:1`);
    });

console.log('\n✅ 분석 완료\n');
