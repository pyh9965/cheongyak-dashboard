// 지역 필터링 버그 수정 스크립트
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 문제가 있는 includes() 부분 찾기
const oldLine = 'if (targetName && item.SUBSCRPT_AREA_CODE_NM && item.SUBSCRPT_AREA_CODE_NM.includes(targetName))';
const newLine = 'if (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName)';

if (content.includes(oldLine)) {
    content = content.replace(oldLine, newLine);

    // 주석도 업데이트
    content = content.replace(
        '// 2. 이름이 포함되는가? (안전장치)',
        '// 2. 이름이 정확히 일치하는가? (코드 매칭 실패 시 안전장치)'
    );

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ 지역 필터링 버그 수정 완료!');
    console.log('\n변경 내용:');
    console.log('- includes() → === (정확한 일치)');
    console.log('- 부분 일치 제거');
    console.log('\n이제 세종특별자치시 선택 시 세종 데이터만 표시됩니다!');
} else {
    console.log('❌ 대상 코드를 찾을 수 없습니다.');
    console.log('이미 수정되었거나 파일이 변경되었을 수 있습니다.');
}
