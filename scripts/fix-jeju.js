// 제주 특수 처리 추가
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 세종 처리 뒤에 제주 처리 추가
const lines = content.split('\n');
let modified = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338")')) {
        // 다음 빈 줄 뒤에 제주 처리 추가
        lines.splice(i + 2, 0,
            '            // 제주 특수 처리: 50 -> 690 (50 + "0" = 500은 광주이므로 잘못된 매칭)',
            '            if (targetCode === "50" && item.SUBSCRPT_AREA_CODE === "690") return true;',
            '            '
        );

        // targetCode !== "36" 을 targetCode !== "36" && targetCode !== "50" 으로 변경
        for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('if (targetCode !== "36"')) {
                lines[j] = lines[j].replace(
                    'if (targetCode !== "36"',
                    'if (targetCode !== "36" && targetCode !== "50"'
                );
                modified = true;
                break;
            }
        }
        break;
    }
}

if (modified) {
    content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ 제주 지역 필터링 수정 완료!');
    console.log('\n변경 내용:');
    console.log('- 제주(50) → 실제 코드 690 매핑 추가');
    console.log('- 제주에 대해서는 +0 로직 제외 (500은 광주)');
} else {
    console.log('⚠️  이미 수정되었거나 대상 코드를 찾을 수 없습니다.');
}
