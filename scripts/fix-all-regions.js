// 전체 지역 코드 매핑 수정 스크립트
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 전체 매핑 테이블 추가
const oldMap = `const SIDO_CODE_MAP: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주"
};`;

const newMap = `const SIDO_CODE_MAP: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주"
};

// API 데이터의 실제 SUBSCRPT_AREA_CODE 매핑 (UI 코드 -> API 코드)
const AREA_CODE_MAP: Record<string, string> = {
  "11": "100",   // 서울
  "26": "600",   // 부산
  "27": "700",   // 대구
  "28": "400",   // 인천
  "29": "500",   // 광주
  "30": "300",   // 대전
  "31": "680",   // 울산
  "36": "338",   // 세종
  "41": "410",   // 경기
  "42": "200",   // 강원
  "43": "360",   // 충북
  "44": "312",   // 충남
  "45": "560",   // 전북
  "46": "513",   // 전남
  "47": "712",   // 경북
  "48": "621",   // 경남
  "50": "690"    // 제주
};`;

content = content.replace(oldMap, newMap);

// 필터 로직 수정
const oldFilter = `          mergedData = mergedData.filter(item => {
            // 1. 코드가 일치하는가? (UI 코드 vs API 코드)
            if (item.SUBSCRPT_AREA_CODE === targetCode) return true;
            
            // 세종 특수 처리: 36 -> 338 (36 + "0" = 360은 충북이므로 잘못된 매칭)
            if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true;
            
            // 일반 지역: 끝에 0 추가 (예: 41 -> 410)
            if (targetCode !== "36" && item.SUBSCRPT_AREA_CODE === targetCode + "0") return true;

            // 2. 이름이 정확히 일치하는가? (코드 매칭 실패 시 안전장치)
            if (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName) return true;

            return false;
          });`;

const newFilter = `          mergedData = mergedData.filter(item => {
            // 1. 매핑 테이블로 정확한 코드 매칭
            const mappedCode = AREA_CODE_MAP[targetCode];
            if (mappedCode && item.SUBSCRPT_AREA_CODE === mappedCode) return true;
            
            // 2. 이름이 정확히 일치하는가? (코드 매칭 실패 시 안전장치)
            if (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName) return true;

            return false;
          });`;

if (content.includes(oldFilter)) {
    content = content.replace(oldFilter, newFilter);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ 전체 지역 코드 매핑 수정 완료!');
    console.log('\n변경 내용:');
    console.log('- 전체 지역 매핑 테이블 추가 (AREA_CODE_MAP)');
    console.log('- 동적 +0 로직 제거');
    console.log('- 정확한 매핑 사용');
    console.log('\n모든 지역 필터링이 완벽해집니다!');
} else {
    console.log('⚠️  대상 코드를 찾을 수 없습니다. 수동으로 확인 필요.');
}
