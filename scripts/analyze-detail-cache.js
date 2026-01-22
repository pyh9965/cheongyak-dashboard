const fs = require('fs');
const path = require('path');

console.log('============================================================');
console.log('청약 상세 데이터 캐시 파일 분석');
console.log('============================================================\n');

// 1. 캐시 파일 로드
const cachePath = path.join(__dirname, '../public/data/cheongyak-details-cache.json');
const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

console.log('[1] 캐시 파일 메타데이터:');
console.log(`  - 생성일시: ${cacheData.metadata.generatedAt}`);
console.log(`  - 총 항목 수: ${cacheData.metadata.totalCount}`);
console.log(`  - 데이터 범위: ${cacheData.metadata.dateRange.start} ~ ${cacheData.metadata.dateRange.end}`);
console.log('');

// 2. 실제 데이터 항목 수 확인
const keys = Object.keys(cacheData.details);
console.log('[2] 실제 저장된 데이터:');
console.log(`  - 데이터 키 개수: ${keys.length}개`);
console.log('');

// 3. 데이터 품질 분석
console.log('[3] 데이터 품질 분석:');

let validDataCount = 0;  // 유효한 경쟁률 데이터가 있는 항목
let emptyDataCount = 0;  // 모든 request가 0 또는 null인 항목
let partialDataCount = 0; // 일부만 데이터가 있는 항목

const sampleKeys = [];  // 샘플 데이터 키
const emptyKeys = [];   // 빈 데이터 키

keys.forEach((key, index) => {
    const detail = cacheData.details[key];

    if (!detail || !detail.rows || detail.rows.length === 0) {
        emptyDataCount++;
        if (emptyKeys.length < 5) emptyKeys.push(key);
        return;
    }

    let hasAnyData = false;
    let hasAllData = true;

    detail.rows.forEach(row => {
        const rank1Request = row.stages?.rank1?.request || 0;
        const rank2Request = row.stages?.rank2?.request || 0;
        const specialRequest = row.stages?.special?.request || 0;

        if (rank1Request > 0 || rank2Request > 0 || specialRequest > 0) {
            hasAnyData = true;
        } else {
            hasAllData = false;
        }
    });

    if (hasAnyData && hasAllData) {
        validDataCount++;
        if (sampleKeys.length < 5) sampleKeys.push(key);
    } else if (hasAnyData) {
        partialDataCount++;
    } else {
        emptyDataCount++;
        if (emptyKeys.length < 5) emptyKeys.push(key);
    }
});

console.log(`  - 유효한 데이터: ${validDataCount}개 (${(validDataCount / keys.length * 100).toFixed(1)}%)`);
console.log(`  - 일부 데이터: ${partialDataCount}개 (${(partialDataCount / keys.length * 100).toFixed(1)}%)`);
console.log(`  - 빈 데이터: ${emptyDataCount}개 (${(emptyDataCount / keys.length * 100).toFixed(1)}%)`);
console.log('');

// 4. 샘플 데이터 출력
console.log('[4] 유효한 데이터 샘플:');
sampleKeys.slice(0, 3).forEach((key, index) => {
    const detail = cacheData.details[key];
    console.log(`\n  샘플 ${index + 1}: ${key}`);
    console.log(`  - 타입 개수: ${detail.rows.length}개`);

    if (detail.rows.length > 0) {
        const firstRow = detail.rows[0];
        console.log(`  - 첫 번째 타입: ${firstRow.houseType}`);
        console.log(`    · 1순위 접수: ${firstRow.stages.rank1.request}건 / ${firstRow.stages.rank1.target}세대`);
        console.log(`    · 2순위 접수: ${firstRow.stages.rank2.request}건 / ${firstRow.stages.rank2.target}세대`);
        console.log(`    · 특별공급: ${firstRow.stages.special.request}건 / ${firstRow.stages.special.target}세대`);
    }
});

console.log('\n');
console.log('[5] 빈 데이터 샘플:');
emptyKeys.slice(0, 3).forEach((key, index) => {
    const detail = cacheData.details[key];
    console.log(`\n  샘플 ${index + 1}: ${key}`);

    if (!detail || !detail.rows) {
        console.log(`  - 데이터 없음 (null 또는 undefined)`);
    } else {
        console.log(`  - 타입 개수: ${detail.rows.length}개`);
        if (detail.rows.length > 0) {
            const firstRow = detail.rows[0];
            console.log(`  - 첫 번째 타입: ${firstRow.houseType}`);
            console.log(`    · 1순위 접수: ${firstRow.stages.rank1.request}건 / ${firstRow.stages.rank1.target}세대`);
            console.log(`    · 2순위 접수: ${firstRow.stages.rank2.request}건 / ${firstRow.stages.rank2.target}세대`);
            console.log(`    · 특별공급: ${firstRow.stages.special.request}건 / ${firstRow.stages.special.target}세대`);
        }
    }
});

// 6. "역삼센트럴자이" 분석
console.log('\n');
console.log('[6] 특정 청약 분석 - 역삼센트럴자이:');
const yeoksamKey = keys.find(k => k.includes('2025000566'));
if (yeoksamKey) {
    const detail = cacheData.details[yeoksamKey];
    console.log(`  - 키: ${yeoksamKey}`);
    console.log(`  - 타입 개수: ${detail.rows?.length || 0}개`);

    if (detail.rows && detail.rows.length > 0) {
        detail.rows.forEach((row, idx) => {
            console.log(`\n  타입 ${idx + 1}: ${row.houseType}`);
            console.log(`    · 일반공급: ${row.supplyGeneral}세대, 특별공급: ${row.supplySpecial}세대`);
            console.log(`    · 1순위: ${row.stages.rank1.request}건 / ${row.stages.rank1.target}세대 (경쟁률: ${row.stages.rank1.rate?.toFixed(2) || 0}:1)`);
            console.log(`    · 2순위: ${row.stages.rank2.request}건 / ${row.stages.rank2.target}세대 (경쟁률: ${row.stages.rank2.rate?.toFixed(2) || 0}:1)`);
            console.log(`    · 특별: ${row.stages.special.request}건 / ${row.stages.special.target}세대`);
        });
    }
} else {
    console.log('  - 역삼센트럴자이 데이터를 찾을 수 없습니다.');
}

console.log('\n');
console.log('============================================================');
console.log('분석 완료');
console.log('============================================================');
