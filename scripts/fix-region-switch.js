// 자동 코드 교체 스크립트
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/StatsDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 교체할 부분 찾기
const oldCode1 = `            // ✅ 임시 수정: archiveCache에는 request 데이터가 없으므로 extraData만 사용
            // TODO: 캐시 재생성 후 archiveCache 우선 순위로 변경
            const itemStats = extraData[key]?.totals;`;

const newCode1 = `            // Hybrid approach: use extraData when available, fallback to archiveCache
            const extraStats = extraData[key]?.totals;
            const cacheStats = archiveCache?.calculatedStats?.[key]?.totals;
            const itemStats = extraStats || cacheStats;`;

const oldCode2 = `            // 캐시 데이터가 없거나 'Total' 행만 있는 경우(상세 경쟁률 누락)에 대한 보완 로직
            const hasDetailedStats = itemStats && itemStats.stages && itemStats.stages.total && itemStats.stages.total.rate !== undefined;`;

const newCode2 = `            // Check if request data is available (only in extraData)
            const hasDetailedStats = extraStats && extraStats.stages && extraStats.stages.total && 
                                     extraStats.stages.total.request !== undefined;`;

// 교체 실행
content = content.replace(oldCode1, newCode1);
content = content.replace(oldCode2, newCode2);

// 파일 저장
fs.writeFileSync(filePath, content, 'utf-8');

console.log('✅ StatsDashboard.tsx 수정 완료!');
console.log('\n수정 내용:');
console.log('1. extraData와 archiveCache 모두 사용하도록 변경');
console.log('2. extraData 우선, archiveCache는 fallback');
console.log('3. request 데이터 유무를 extraData 기준으로 확인');
console.log('\n이제 다른 지역을 선택해도 통계가 표시됩니다!');
