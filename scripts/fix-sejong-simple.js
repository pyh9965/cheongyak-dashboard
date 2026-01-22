// 세종 지역 코드 직접 수정
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 정규식으로 찾아서 교체
const lines = content.split('\n');
let modified = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (item.SUBSCRPT_AREA_CODE === targetCode + "0")')) {
        // 이 라인 앞에 세종 특수 처리 추가
        lines.splice(i, 0,
            '            ',
            '            // 세종 특수 처리: 36 -> 338 (36 + "0" = 360은 충북이므로 잘못된 매칭)',
            '            if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true;',
            '            '
        );

        // 원래 라인 수정
        lines[i + 4] = lines[i + 4].replace(
            'if (item.SUBSCRPT_AREA_CODE === targetCode + "0")',
            'if (targetCode !== "36" && item.SUBSCRPT_AREA_CODE === targetCode + "0")'
        );

        modified = true;
        break;
    }
}

if (modified) {
    content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ 세종 지역 필터링 수정 완료!');
    console.log('\n변경 내용:');
    console.log('- 세종(36) → 실제 코드 338 매핑 추가');
    console.log('- 세종에 대해서는 +0 로직 제외 (360은 충북)');
} else {
    console.log('⚠️  이미 수정되었거나 대상 코드를 찾을 수 없습니다.');
}
