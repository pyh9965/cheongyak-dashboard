// 세종 지역 코드 매핑 수정 스크립트
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 문제가 있는 필터 로직 찾기 - 516번 라인 부근
const oldFilter = `          mergedData = mergedData.filter(item => {
            // 1. 코드가 일치하는가? (UI 코드 vs API 코드)
            if (item.SUBSCRPT_AREA_CODE === targetCode) return true;
            if (item.SUBSCRPT_AREA_CODE === targetCode + "0") return true; // 41 -> 410 처리`;

const newFilter = `          mergedData = mergedData.filter(item => {
            // 1. 코드가 일치하는가? (UI 코드 vs API 코드)
            if (item.SUBSCRPT_AREA_CODE === targetCode) return true;
            
            // 세종 특수 처리: 36 -> 338 (36 + "0" = 360은 충북이므로 잘못된 매칭)
            if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true;
            
            // 일반 지역: 끝에 0 추가 (예: 41 -> 410)
            if (targetCode !== "36" && item.SUBSCRPT_AREA_CODE === targetCode + "0") return true;`;

if (content.includes(oldFilter)) {
    content = content.replace(oldFilter, newFilter);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ 세종 지역 필터링 수정 완료!');
    console.log('\n변경 내용:');
    console.log('- 세종 지역 특수 매핑 추가: 36 → 338');
    console.log('- 충북 혼입 방지: 36 + "0" = 360 (충북) 매칭 제외');
    console.log('\n이제 세종 선택 시 세종 데이터만 표시됩니다!');
} else {
    console.log('❌ 대상 코드를 찾을 수 없습니다. 이미 수정되었습니다.');
}
