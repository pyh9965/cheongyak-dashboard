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
  const pattern = /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원도|강원특별자치도|강원|충청북도|충북|충청남도|충남|전라북도|전북특별자치도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s*(.+)/;

  const match = trimmed.match(pattern);
  if (!match) return null;

  const [, rawSido, rest] = match;
  const sido = SIDO_NORMALIZE[rawSido] || rawSido;

  // 시/군/구 추출
  // 패턴: (시군구)(읍/면/동/리/가/로 또는 나머지)
  const sigunguPattern = /^([가-힣]+(?:시|군|구)(?:\s+[가-힣]+구)?)\s*/;
  const sigunguMatch = rest.match(sigunguPattern);

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
