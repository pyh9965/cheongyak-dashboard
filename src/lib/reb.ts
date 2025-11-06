const SERVICE_BASE_URLS = {
  ApplyhomeInfoCmpetRtSvc: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1",
  ApplyhomeInfoDetailSvc: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
  ApplyhomeInfoOfferSvc: "https://api.odcloud.kr/api/ApplyhomeInfoOfferSvc/v1",
} as const;

type ServiceKey = keyof typeof SERVICE_BASE_URLS;

const DEFAULT_BASE_URL = SERVICE_BASE_URLS.ApplyhomeInfoCmpetRtSvc;
const API_KEY = process.env.REB_API_KEY as string;

if (!API_KEY) {
  console.warn("⚠️ REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");
}

type Params = Record<string, string | number | undefined>;

type FetchOptions = {
  service?: ServiceKey;
  includePaging?: boolean;
};

function toQuery(params: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

export async function fetchRebData(
  endpoint: string,
  params: Params = {},
  options: FetchOptions = {}
) {
  const baseUrl = options.service
    ? SERVICE_BASE_URLS[options.service] ?? DEFAULT_BASE_URL
    : DEFAULT_BASE_URL;
  
  const includePaging = options.includePaging ?? true;
  const { pageNo, numOfRows, page, perPage, ...rest } = params;

  const query = toQuery({
    serviceKey: API_KEY,
    returnType: "json",
    ...(includePaging ? { 
      // page/perPage가 있으면 우선 사용, 없으면 pageNo/numOfRows 사용
      ...(page !== undefined ? { page: page ?? 1 } : { pageNo: pageNo ?? 1 }),
      ...(perPage !== undefined ? { perPage: perPage ?? 10 } : { numOfRows: numOfRows ?? 10 }),
    } : {}),
    ...rest,
  });

  const url = `${baseUrl}/${endpoint}?${query}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 호출 오류: ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
  }
  
  const json = await res.json();
  
  if (
    json &&
    typeof json === "object" &&
    "code" in json &&
    json.code !== 0 &&
    json.code !== "0"
  ) {
    const message = typeof json.msg === "string" ? json.msg : "API 오류 응답";
    throw new Error(`API 비정상 응답(code=${json.code}): ${message}`);
  }
  
  return json;
}

