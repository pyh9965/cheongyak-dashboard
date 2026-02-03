/**
 * 주소 문자열에서 시/도, 시/군/구를 추출하는 유틸리티
 */

export type ParsedAddress = {
  sido: string;       // 시/도 (예: "서울특별시", "경기도")
  sigungu: string;    // 시/군/구 (예: "강남구", "성남시 분당구")
  fullKey: string;    // 매핑 키 (예: "서울 강남구", "경기 성남시 분당구")
};

// 시도 정규화 맵
const SIDO_NORMALIZE: Record<string, string> = {
  "서울특별시": "서울",
  "서울시": "서울",
  "서울": "서울",
  "부산광역시": "부산",
  "부산시": "부산",
  "부산": "부산",
  "대구광역시": "대구",
  "대구시": "대구",
  "대구": "대구",
  "인천광역시": "인천",
  "인천검단시": "인천",  // 원본 데이터 오타 처리 (인천광역시 서구 검단신도시)
  "인천시": "인천",
  "인천": "인천",
  "광주광역시": "광주",
  "광주시": "광주",
  "광주": "광주",
  "대전광역시": "대전",
  "대전시": "대전",
  "대전": "대전",
  "울산광역시": "울산",
  "울산시": "울산",
  "울산": "울산",
  "세종특별자치시": "세종",
  "세종시": "세종",
  "세종": "세종",
  "경기도": "경기",
  "경기": "경기",
  "강원도": "강원",
  "강원특별자치도": "강원",
  "강원": "강원",
  "충청북도": "충북",
  "충북": "충북",
  "충청남도": "충남",
  "충남": "충남",
  "전라북도": "전북",
  "전북특별자치도": "전북",
  "전북": "전북",
  "전라남도": "전남",
  "전남": "전남",
  "경상북도": "경북",
  "경북": "경북",
  "경상남도": "경남",
  "경남": "경남",
  "제주특별자치도": "제주",
  "제주도": "제주",
  "제주": "제주",
};

export function normalizeSidoName(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SIDO_NORMALIZE[trimmed] || trimmed;
}

/**
 * 주소 문자열을 파싱하여 시/도, 시/군/구 정보를 추출합니다.
 * @param address - 주소 문자열 (예: "경상남도 양산시 물금읍 범어리 502-3번지 일원")
 * @returns ParsedAddress | null
 */
export function parseAddress(address: string | null | undefined): ParsedAddress | null {
  if (!address || typeof address !== "string") return null;

  const trimmed = address.trim();
  if (!trimmed) return null;

  // 정규식으로 시/도 + 시/군/구 추출
  // 패턴: (시도)(시/군/구)(나머지)
  const pattern = /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천검단시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원도|강원특별자치도|강원|충청북도|충북|충청남도|충남|전라북도|전북특별자치도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s*(.+)/;

  const match = trimmed.match(pattern);
  if (!match) return null;

  const [, rawSido, rest] = match;
  const sido = SIDO_NORMALIZE[rawSido] || rawSido;

  // 시/군/구 추출 전에 "신도시", "도시개발사업" 등 제거
  let restCleaned = rest
    .replace(/[가-힣]+신도시\s*/g, "")
    .replace(/[가-힣]+도시개발사업\s*/g, "")
    .replace(/[A-Za-z]{1,3}-?\d{0,3}BL\s*/gi, "")
    .trim();

  // 시/군/구 추출
  // 패턴: (시군구)(읍/면/동/리/가/로 또는 나머지)
  // ~구 뒤에 동/읍/면/리/가/로가 바로 오면 시군구가 아닌 동/읍/면 이름임 (예: 반구동, 유구읍, 단구동)
  const sigunguPattern = /^([가-힣]+(?:시|군|구)(?:\s+[가-힣]+구(?![동읍면리가로]))?)\s*/;
  const sigunguMatch = restCleaned.match(sigunguPattern);

  if (!sigunguMatch) {
    // 세종시처럼 시군구가 없는 경우
    if (sido === "세종") {
      return {
        sido,
        sigungu: "",
        fullKey: sido,
      };
    }
    return null;
  }

  const sigungu = sigunguMatch[1].trim();
  const fullKey = `${sido} ${sigungu}`;

  return {
    sido,
    sigungu,
    fullKey,
  };
}

/**
 * 주소 목록에서 시/군/구별로 그룹화합니다.
 */
export function groupByRegion<T extends { address?: string }>(
  items: T[],
  addressField: keyof T = "address" as keyof T
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const address = item[addressField] as string | undefined;
    const parsed = parseAddress(address);

    if (parsed) {
      const key = parsed.fullKey;
      const existing = groups.get(key) || [];
      existing.push(item);
      groups.set(key, existing);
    }
  });

  return groups;
}

/**
 * 시/도 코드 → 정규화된 시/도명 매핑
 */
export const SIDO_CODE_TO_NAME: Record<string, string> = {
  "11": "서울", "26": "부산", "27": "대구", "28": "인천",
  "29": "광주", "30": "대전", "31": "울산", "36": "세종",
  "41": "경기", "42": "강원", "43": "충북", "44": "충남",
  "45": "전북", "46": "전남", "47": "경북", "48": "경남",
  "50": "제주"
};

/**
 * 주어진 시/도에 해당하는 시/군/구 목록을 추출합니다.
 */
/**
 * 지오코딩용 주소 정제
 * 블록 번호, 번지, 신도시 등을 제거하고 "시도 시군구 동/읍/면" 형태로 정제
 *
 * @param address - 원본 주소
 * @returns 정제된 주소
 */
export function cleanAddressForGeocoding(address: string | null | undefined): string | null {
  if (!address || typeof address !== "string") return null;

  let cleaned = address.trim();

  // 0. 괄호 안에 전체 주소가 있는 경우 (예: "인천 검단신도시 AB13블록 (인천광역시 서구 원당동 1063-2 일원)")
  //    괄호 안에 "시/도 + 시군구 + 동"이 있으면 그 주소를 사용
  const fullAddrInParenMatch = cleaned.match(/\(([^)]*(?:시|도)[^)]*(?:구|군|시)[^)]*[동읍면리][^)]*)\)/);
  if (fullAddrInParenMatch) {
    const addrInParen = fullAddrInParenMatch[1].trim();
    const parsedInParen = parseAddress(addrInParen);
    if (parsedInParen && parsedInParen.sigungu) {
      // 괄호 안 주소가 유효하면 그것을 정제 대상으로 사용
      cleaned = addrInParen;
    }
  }

  // 1. 괄호 안에 동/읍/면/리만 있으면 추출 (예: "(당하동)" → "당하동")
  const dongInParenMatch = cleaned.match(/\(([가-힣]+[동읍면리])\)/);
  const dongFromParen = dongInParenMatch ? dongInParenMatch[1] : null;

  // 2. 괄호와 그 내용 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, "").trim();

  // 3. 블록 번호 패턴 제거 (예: AB8BL, AA28BL, A-4블록, 1BL 등)
  cleaned = cleaned.replace(/\s*[A-Za-z]*-?\d*[A-Za-z]*블록/gi, "");
  cleaned = cleaned.replace(/\s*[A-Za-z]{1,3}-?\d{0,3}BL\b/gi, "");

  // 4. "신도시", "도시개발사업", "택지개발", "공공주택지구" 등 제거
  cleaned = cleaned.replace(/[가-힣]+신도시/g, "");
  cleaned = cleaned.replace(/[가-힣]+도시개발사업/g, "");
  cleaned = cleaned.replace(/[가-힣]+택지개발[가-힣]*/g, "");
  cleaned = cleaned.replace(/[가-힣]+공공주택지구/g, "");

  // 5. 번지, 일원, 일대, 번지 일원 등 제거
  cleaned = cleaned.replace(/\s*\d+(-\d+)?번지.*$/g, "");
  cleaned = cleaned.replace(/\s*일원.*$/g, "");
  cleaned = cleaned.replace(/\s*일대.*$/g, "");

  // 6. 연속 공백 정리
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // 7. 괄호에서 추출한 동 이름이 있고, 현재 주소에 동/읍/면/리가 없으면 추가
  if (dongFromParen && !cleaned.match(/[가-힣]+[동읍면리]\s*$/)) {
    // 시군구까지만 있는 경우 동 추가
    const parsed = parseAddress(cleaned);
    if (parsed && parsed.sigungu) {
      // 시도 정규화 적용
      const sidoFull = Object.entries(SIDO_NORMALIZE).find(([, v]) => v === parsed.sido)?.[0] || parsed.sido;
      cleaned = `${sidoFull} ${parsed.sigungu} ${dongFromParen}`;
    }
  }

  // 8. 최종 정리 - 빈 문자열이면 null 반환
  cleaned = cleaned.trim();
  if (!cleaned || cleaned.length < 5) return null;

  return cleaned;
}

export function extractSigunguList(
  items: Array<Record<string, any>>,
  sidoCode: string
): string[] {
  const targetSido = SIDO_CODE_TO_NAME[sidoCode];
  if (!targetSido) {
    console.log(`⚠️ [extractSigunguList] 알 수 없는 sidoCode: ${sidoCode}`);
    return [];
  }

  const sigunguSet = new Set<string>();
  let matchCount = 0;
  let parseFailCount = 0;

  items.forEach(item => {
    if (!item.HSSPLY_ADRES) return;
    const parsed = parseAddress(item.HSSPLY_ADRES);
    if (!parsed) {
      parseFailCount++;
      return;
    }
    if (parsed.sido === targetSido && parsed.sigungu) {
      sigunguSet.add(parsed.sigungu);
      matchCount++;
    }
  });

  console.log(`📍 [extractSigunguList] targetSido=${targetSido}, 매칭=${matchCount}건, 파싱실패=${parseFailCount}건`);
  return Array.from(sigunguSet).sort((a, b) => a.localeCompare(b, 'ko'));
}
