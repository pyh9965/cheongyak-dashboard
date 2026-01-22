// 전체 지역 코드 매핑 추가 스크립트 (간소화)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/apt/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// SIDO_CODE_MAP 뒤에 AREA_CODE_MAP 추가
const insertPoint = `};

type RateType = "special" | "rank1" | "rank2" | "total";`;

const areaCodeMap = `};

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
};

type RateType = "special" | "rank1" | "rank2" | "total";`;

if (content.includes('const AREA_CODE_MAP')) {
    console.log('⚠️  AREA_CODE_MAP이 이미 존재합니다.');
} else if (content.includes(insertPoint)) {
    content = content.replace(insertPoint, areaCodeMap);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ AREA_CODE_MAP 추가 완료!');
} else {
    console.log('❌ 삽입 위치를 찾을 수 없습니다.');
}
