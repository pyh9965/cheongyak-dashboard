# 청약홈 API 연동 완전 가이드

> **다른 AI가 바로 적용 가능한 실전 가이드**  
> Next.js 14 + TypeScript 환경에서 공공데이터포털 청약홈 API 연동 방법을 단계별로 정리한 문서입니다.

---

## 📋 목차

1. [개요](#개요)
2. [환경 설정](#환경-설정)
3. [핵심 아키텍처](#핵심-아키텍처)
4. [API 서비스 구조](#api-서비스-구조)
5. [핵심 파일 분석](#핵심-파일-분석)
6. [실전 사용 예제](#실전-사용-예제)
7. [데이터셋 종류](#데이터셋-종류)
8. [에러 처리](#에러-처리)
9. [트러블슈팅](#트러블슈팅)
10. [확장 가이드](#확장-가이드)

---

## 개요

### 프로젝트 정보

- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript
- **라이브러리**: React 18.3, Recharts 3.3
- **데이터 출처**: 공공데이터포털 `api.odcloud.kr`
- **제공자**: 한국부동산원 (청약홈)

### 지원 API 범위

1. **경쟁률 조회 서비스** (`ApplyhomeInfoCmpetRtSvc`)
   - APT 경쟁률
   - 오피스텔/도시형/생활숙박 경쟁률
   - 공공지원 민간임대 경쟁률
   - 취소/후재공 분양정보
   - 잔여세대 분양정보
   - APT 당첨자 점수
   - APT 특별공급 신청현황

2. **모집공고 상세 서비스** (`ApplyhomeInfoDetailSvc`)
   - APT 분양공고 상세
   - APT 분양공고 모델

3. **특공/청약접수 서비스** (`ApplyhomeInfoOfferSvc`)
   - 향후 확장 가능

---

## 환경 설정

### 1. 프로젝트 초기 설정

#### 1.1 디렉토리 구조

```
my-cheongyak-project/
 ├── .env                          # API 키 보관 (gitignore)
 ├── .env.example                  # .env 템플릿
 ├── package.json
 ├── tsconfig.json
 ├── next.config.js                # (필요시)
 └── src/
     ├── app/
     │   ├── layout.tsx
     │   ├── page.tsx              # 홈
     │   ├── api/
     │   │   └── cheongyak/
     │   │       └── route.ts      # 프록시 라우트
     │   └── cheongyak/
     │       ├── page.tsx          # 경쟁률 목록 UI
     │       └── notice/
     │           └── page.tsx      # 모집공고 UI
     ├── lib/
     │   ├── reb.ts                # API 클라이언트
     │   └── urlParams.ts          # 유틸리티
     └── components/
         └── GlobalSearch.tsx      # (선택)
```

#### 1.2 package.json 의존성

```json
{
  "name": "my-cheongyak-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.33",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "recharts": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "20.11.30",
    "@types/react": "18.2.66",
    "@types/react-dom": "18.2.22",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.5",
    "typescript": "5.6.3"
  }
}
```

**설치 명령어:**
```bash
npm install
# 또는
npm i
```

### 2. 환경변수 설정

#### 2.1 .env 파일 생성

프로젝트 루트에 `.env` 파일을 생성:

```env
REB_API_KEY=여기에_공공데이터포털에서_발급받은_일반인증키를_입력
```

#### 2.2 API 키 발급 방법

1. **공공데이터포털 접속**: https://www.data.go.kr
2. **회원가입/로그인**
3. **청약홈 API 검색**:
   - "청약접수 결과" 또는 "분양 아파트 경쟁률" 검색
   - 서비스 명: `ApplyhomeInfoCmpetRtSvc` 또는 `ApplyhomeInfoDetailSvc`
4. **활용신청**
   - 원하는 서비스에 대해 "활용신청" 버튼 클릭
   - 신청 사유 작성 (예: "개인 프로젝트 데이터 분석")
5. **승인 대기**
   - 보통 1~2일 내 승인 완료
6. **일반 인증키 발급**
   - 마이페이지 → 개발계정 → 인증키
   - 서비스 유형: **일반 인증키** 선택
   - 복사 후 `.env`에 붙여넣기

#### 2.3 주의사항

```env
# ✅ 올바른 형식
REB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ❌ 잘못된 형식
REB_API_KEY = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 등호 주변 공백 금지
REB_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # 따옴표 불필요
```

#### 2.4 .gitignore 확인

`.gitignore`에 `.env`가 포함되어 있는지 확인:

```
# .gitignore
.env
.env.local
.env*.local
node_modules/
.next/
out/
dist/
```

---

## 핵심 아키텍처

### 1. 전체 데이터 흐름

```
[브라우저]
    ↓
[/cheongyak 페이지 (클라이언트 컴포넌트)]
    ↓ fetch('/api/cheongyak?dataset=apt')
[Next.js API 라우트] (/app/api/cheongyak/route.ts)
    ↓ fetchRebData()
[API 클라이언트] (lib/reb.ts)
    ↓ fetch() + serviceKey 주입
[공공데이터포털 API]
    ↓
[응답 파싱 및 반환]
    ↓
[프론트엔드 UI 렌더링]
```

### 2. 핵심 설계 원칙

#### 2.1 보안

- **❌ 절대 프론트엔드에서 `serviceKey` 직접 사용 금지**
  - CORS 에러 발생
  - API 키 노출 위험
  - 보안 취약점

- **✅ 서버 라우트를 통한 프록시 패턴 사용**
  - API 키는 서버 측에서만 사용
  - 클라이언트는 내부 API 주소 호출
  - CORS 문제 없음

#### 2.2 데이터 필터링

```
클라이언트 요청 파라미터
    ↓
API 라우트에서 파라미터 검증 및 정제
    ↓
공공데이터 API로 전달
    ↓
응답 데이터 필터링 및 변환
    ↓
클라이언트로 JSON 반환
```

#### 2.3 에러 처리

- `Promise.allSettled`로 여러 데이터셋 병렬 호출
- 일부 실패해도 성공한 데이터는 반환
- 각 데이터셋별 에러 메시지 분리

---

## API 서비스 구조

### 1. Base URL 매핑

```typescript
const SERVICE_BASE_URLS = {
  ApplyhomeInfoCmpetRtSvc: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1",
  ApplyhomeInfoDetailSvc: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
  ApplyhomeInfoOfferSvc: "https://api.odcloud.kr/api/ApplyhomeInfoOfferSvc/v1",
} as const;
```

### 2. 주요 엔드포인트 목록

#### 2.1 경쟁률 조회 서비스 (`ApplyhomeInfoCmpetRtSvc`)

> [!WARNING] **데이터 반영 지연 주의 (2026.01.09 기준)**
> 청약홈 API의 데이터가 실제 모집공고일보다 약 **9일 이상 지연**되어 반영되는 현상이 확인되었습니다.
> 예를 들어, 2026년 1월 9일에 모집공고가 올라온 '드파인 연희'의 경우 API에서는 조회가 불가능했으며, 가장 최신 데이터가 2025년 12월 31일자였습니다.
> 실시간 데이터가 필요한 경우 이 점을 반드시 고려해야 합니다.

| 엔드포인트 | 설명 | 데이터셋 키 |
|-----------|------|------------|
| `getAPTLttotPblancCmpet` | APT 경쟁률 | `apt` |
| `getUrbyOfctlLttotPblancCmpet` | 오피스텔/도시형/생활숙박 경쟁률 | `officetel` |
| `getPblPvtRentLttotPblancCmpet` | 공공지원 민간임대 경쟁률 | `privateRent` |
| `getCancResplLttotPblancCmpet` | 취소/후재공 분양정보 | `canceled` |
| `getRemndrLttotPblancCmpet` | 잔여세대 분양정보 | `remaining` |
| `getAPTLttotPblancScore` | APT 당첨자 점수 | `score` |
| `getAPTSplplyReqstStus` | APT 특별공급 신청현황 | `special` |

#### 2.2 모집공고 상세 서비스 (`ApplyhomeInfoDetailSvc`)

| 엔드포인트 | 설명 | 데이터셋 키 |
|-----------|------|------------|
| `getAPTLttotPblancDetail` | APT 분양공고 상세/목록 | `notice`, `noticeList` |
| `getAPTLttotPblancMdl` | APT 분양공고 모델 | `noticeModel` |
| (이하 경쟁률 서비스에 포함) | - | - |
| `getAPTLttotPblancCmpet` | 특정 공고 경쟁률 | `noticeCompetition` |
| `getAPTSpsplyReqstStus` | 특정 공고 특별공급 | `noticeSpecial` |

### 3. 공통 파라미터

모든 API 호출에 공통으로 적용되는 파라미터:

| 파라미터 | 필수 | 기본값 | 설명 |
|---------|-----|-------|------|
| `serviceKey` | ✅ | - | API 인증키 |
| `returnType` | ✅ | `json` | 응답 형식 (json/xml) |
| `pageNo` | ❌ | `1` | 페이지 번호 |
| `numOfRows` | ❌ | `10` | 한 페이지 당 행 수 |

### 4. 선택적 파라미터

| 파라미터 | 설명 | 예시 |
|---------|------|------|
| `houseNm` | 주택명 (부분 검색 가능) | `"힐스테이트"` |
| `subscrptRankCode` | 순위 코드 (1순위/2순위 등) | `"01"` |
| `sidoCode` | 시도 코드 | `"11"` (서울) |
| `houseManageNo` | 주택관리번호 | `"A11078302"` |
| `pblancNo` | 모집공고번호 | `"2023000001"` |
| `cond[HOUSE_NM::LIKE]` | 주택명 LIKE 조건 | `"*힐스*"` |

### 5. 페이지네이션 방식

#### 5.1 기본 방식 (pageNo/numOfRows)

```typescript
{
  pageNo: 1,
  numOfRows: 10,
  serviceKey: "...",
  returnType: "json"
}
```

**응답 형식:**
```json
{
  "code": 0,
  "data": [...],
  "pageNo": 1,
  "numOfRows": 10,
  "totalCount": 100,
  "matchCount": 100
}
```

#### 5.2 페이지 방식 (page/perPage)

```typescript
{
  page: 1,
  perPage: 20,
  serviceKey: "...",
  returnType: "json"
}
```

**응답 형식:**
```json
{
  "code": 0,
  "body": [...],
  "page": 1,
  "perPage": 20,
  "currentCount": 20,
  "totalCount": 100
}
```

---

## 핵심 파일 분석

### 1. API 클라이언트 (`src/lib/reb.ts`)

#### 1.1 전체 코드

```typescript
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
  const { pageNo, numOfRows, ...rest } = params;

  const query = toQuery({
    serviceKey: API_KEY,
    returnType: "json",
    ...(includePaging ? { pageNo: pageNo ?? 1, numOfRows: numOfRows ?? 10 } : {}),
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
```

#### 1.2 주요 기능 설명

**1) `toQuery` 함수**
- 객체를 URL 쿼리 스트링으로 변환
- `undefined`, `null`, 빈 문자열 자동 제거
- 모든 값을 문자열로 변환

**2) `fetchRebData` 함수**

**시그니처:**
```typescript
fetchRebData(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  options?: { service?: ServiceKey; includePaging?: boolean }
)
```

**동작 과정:**

1. **서비스 선택**
   ```typescript
   const baseUrl = options.service
     ? SERVICE_BASE_URLS[options.service] ?? DEFAULT_BASE_URL
     : DEFAULT_BASE_URL;
   ```

2. **파라미터 정제**
   ```typescript
   const query = toQuery({
     serviceKey: API_KEY,      // 필수: 인증키 자동 주입
     returnType: "json",       // 필수: JSON 응답
     ...(includePaging ? {     // 선택: 페이지네이션
       pageNo: pageNo ?? 1,
       numOfRows: numOfRows ?? 10
     } : {}),
     ...rest                   // 추가 파라미터
   });
   ```

3. **URL 생성 및 호출**
   ```typescript
   const url = `${baseUrl}/${endpoint}?${query}`;
   const res = await fetch(url, { cache: "no-store" });
   ```

4. **에러 처리**
   - HTTP 상태 코드 확인
   - API 응답 `code` 필드 확인
   - 에러 메시지 포맷팅

**3) 캐시 설정**
```typescript
cache: "no-store"  // 항상 최신 데이터 조회
```

---

### 2. API 라우트 (`src/app/api/cheongyak/route.ts`)

#### 2.1 데이터셋 설정

```typescript
type DatasetConfig = {
  endpoint: string;                      // API 엔드포인트
  service?: "ApplyhomeInfoCmpetRtSvc" | "ApplyhomeInfoDetailSvc" | "ApplyhomeInfoOfferSvc";
  includePaging?: boolean;               // 페이지네이션 포함 여부
  pagingMode?: "default" | "page";       // 페이지네이션 방식
  requiredParams?: string[];             // 필수 파라미터 목록
  useHousePblancCond?: boolean;          // 주택/공고 조건 사용 여부
  defaultPerPage?: number;               // 기본 행 수
};

const DATASETS = {
  apt: { endpoint: "getAPTLttotPblancCmpet" },
  officetel: { endpoint: "getUrbyOfctlLttotPblancCmpet" },
  privateRent: { endpoint: "getPblPvtRentLttotPblancCmpet" },
  canceled: { endpoint: "getCancResplLttotPblancCmpet" },
  remaining: { endpoint: "getRemndrLttotPblancCmpet" },
  score: { endpoint: "getAPTLttotPblancScore" },
  special: { endpoint: "getAPTSplplyReqstStus" },
  
  notice: {
    endpoint: "getAPTLttotPblancDetail",
    service: "ApplyhomeInfoDetailSvc",
    includePaging: false,
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
  },
  
  noticeList: {
    endpoint: "getAPTLttotPblancDetail",
    service: "ApplyhomeInfoDetailSvc",
    pagingMode: "page",
    defaultPerPage: 20,
  },
  
  noticeModel: {
    endpoint: "getAPTLttotPblancMdl",
    service: "ApplyhomeInfoDetailSvc",
    includePaging: false,
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
  },
  
  noticeCompetition: {
    endpoint: "getAPTLttotPblancCmpet",
    service: "ApplyhomeInfoCmpetRtSvc",
    includePaging: false,
    pagingMode: "page",
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
    defaultPerPage: 100,
  },
  
  noticeSpecial: {
    endpoint: "getAPTSpsplyReqstStus",
    service: "ApplyhomeInfoCmpetRtSvc",
    includePaging: false,
    pagingMode: "page",
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
    defaultPerPage: 100,
  },
} as const satisfies Record<string, DatasetConfig>;
```

#### 2.2 GET 핸들러

```typescript
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // 1. 데이터셋 파싱
  const requestedDatasets = searchParams
    .get("dataset")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is DatasetKey => value in DATASETS)
    ?? ["apt", "officetel"];

  // 2. 페이지네이션 파라미터
  const pageNo = Number(searchParams.get("pageNo")) || undefined;
  const numOfRows = Number(searchParams.get("numOfRows")) || undefined;

  // 3. 추가 파라미터 전달
  const passthroughParams: Record<string, string | number> = {};
  searchParams.forEach((value, key) => {
    if (key === "dataset" || key === "pageNo" || key === "numOfRows") return;
    if (value) passthroughParams[key] = value;
  });

  // 4. 병렬 호출
  const settled = await Promise.allSettled(
    requestedDatasets.map(async (dataset) => {
      const config = DATASETS[dataset];
      
      // 4-1. 필수 파라미터 검증
      const required = config.requiredParams ?? [];
      const missing = required.filter((param) => {
        const value = searchParams.get(param);
        return value === null || value.trim().length === 0;
      });
      if (missing.length > 0) {
        throw new Error(`필수 파라미터 누락: ${missing.join(", ")}`);
      }

      // 4-2. 파라미터 구성
      const datasetParams: Record<string, string | number | undefined> = {
        ...passthroughParams,
      };

      // 4-3. 주택/공고 조건 처리
      if (config.useHousePblancCond) {
        const houseManageNo = searchParams.get("houseManageNo");
        const pblancNo = searchParams.get("pblancNo");
        
        delete datasetParams.houseManageNo;
        delete datasetParams.pblancNo;
        
        if (houseManageNo) {
          datasetParams["cond[HOUSE_MANAGE_NO::EQ]"] = houseManageNo;
        }
        if (pblancNo) {
          datasetParams["cond[PBLANC_NO::EQ]"] = pblancNo;
        }
      }

      // 4-4. 검색 키워드 처리
      const searchKeyword = searchParams.get("q") || searchParams.get("houseNm");
      if (searchKeyword && searchKeyword.trim()) {
        const trimmedKeyword = searchKeyword.trim();
        if (config.service === "ApplyhomeInfoDetailSvc") {
          datasetParams["cond[HOUSE_NM::LIKE]"] = `*${trimmedKeyword}*`;
          datasetParams.houseNm = trimmedKeyword;
        } else {
          datasetParams["cond[HOUSE_NM::LIKE]"] = `*${trimmedKeyword}*`;
          datasetParams.houseNm = trimmedKeyword;
        }
        delete datasetParams.q;
      }

      // 4-5. 페이지네이션 처리
      const pagingMode = config.pagingMode ?? "default";
      if (pagingMode === "page") {
        datasetParams.page = pageNo ?? 1;
        datasetParams.perPage = numOfRows ?? config.defaultPerPage ?? 10;
      }
      
      if (config.includePaging !== false && pagingMode !== "page") {
        datasetParams.pageNo = pageNo ?? 1;
        datasetParams.numOfRows = numOfRows ?? 10;
      }

      // 4-6. API 호출
      const response = await fetchRebData(
        config.endpoint,
        datasetParams,
        { service: config.service, includePaging: config.includePaging !== false }
      );

      // 4-7. 메타데이터 추출
      const metadata: Record<string, unknown> = {};
      if (response && typeof response === "object") {
        const metaSource = response as Record<string, unknown>;
        const metaKeys = [
          "page", "perPage", "currentCount", "totalCount",
          "matchCount", "pageNo", "numOfRows",
        ];
        for (const key of metaKeys) {
          const value = metaSource[key];
          if (value !== undefined && value !== null && value !== "") {
            metadata[key] = value;
          }
        }
      }

      // 4-8. 데이터 추출
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.body)
          ? response.body
          : response?.data
            ? [response.data]
            : [];

      return {
        dataset,
        rows,
        metadata,
      } as const;
    })
  );

  // 5. 결과 정리
  const datasets: Partial<Record<DatasetKey, unknown[]>> = {};
  const metadata: Partial<Record<DatasetKey, Record<string, unknown>>> = {};
  const errors: Partial<Record<DatasetKey, string>> = {};

  let successCount = 0;

  settled.forEach((result, index) => {
    const dataset = requestedDatasets[index];
    if (!dataset) return;

    if (result.status === "fulfilled") {
      datasets[dataset] = result.value.rows;
      if (Object.keys(result.value.metadata).length > 0) {
        metadata[dataset] = result.value.metadata;
      }
      successCount += 1;
    } else {
      const reason = result.reason;
      errors[dataset] = reason instanceof Error ? reason.message : "알 수 없는 오류";
    }
  });

  const status = successCount > 0 ? 200 : 502;

  // 6. 응답 반환
  return NextResponse.json(
    {
      datasets,
      metadata,
      errors,
      error: successCount > 0 ? undefined : "요청한 모든 데이터셋 조회에 실패했습니다.",
    },
    { status }
  );
}
```

#### 2.3 주요 처리 로직

**1) 데이터셋 파싱**
```typescript
const requestedDatasets = searchParams
  .get("dataset")
  ?.split(",")
  .map((value) => value.trim())
  .filter((value): value is DatasetKey => value in DATASETS)
  ?? ["apt", "officetel"];  // 기본값
```

**예시:**
- `dataset=apt` → `["apt"]`
- `dataset=apt,officetel,special` → `["apt", "officetel", "special"]`
- `dataset=` 또는 미입력 → `["apt", "officetel"]`
- `dataset=invalid` → `["apt", "officetel"]` (필터링됨)

**2) 필수 파라미터 검증**
```typescript
const required = config.requiredParams ?? [];
const missing = required.filter((param) => {
  const value = searchParams.get(param);
  return value === null || value.trim().length === 0;
});

if (missing.length > 0) {
  throw new Error(`필수 파라미터 누락: ${missing.join(", ")}`);
}
```

**예시:**
- `notice` 데이터셋은 `houseManageNo`, `pblancNo` 필수
- 누락 시 에러 반환

**3) 조건식 처리**
```typescript
if (config.useHousePblancCond) {
  if (houseManageNo) {
    datasetParams["cond[HOUSE_MANAGE_NO::EQ]"] = houseManageNo;
  }
  if (pblancNo) {
    datasetParams["cond[PBLANC_NO::EQ]"] = pblancNo;
  }
}
```

**4) 검색 키워드 처리**
```typescript
const searchKeyword = searchParams.get("q") || searchParams.get("houseNm");
if (searchKeyword && searchKeyword.trim()) {
  const trimmedKeyword = searchKeyword.trim();
  datasetParams["cond[HOUSE_NM::LIKE]"] = `*${trimmedKeyword}*`;
  datasetParams.houseNm = trimmedKeyword;
}
```

**5) 응답 데이터 추출**
```typescript
const rows = Array.isArray(response?.data)
  ? response.data
  : Array.isArray(response?.body)
    ? response.body
    : response?.data
      ? [response.data]
      : [];
```

- `data` 필드 확인
- `body` 필드 확인 (페이지 모드)
- 단일 객체는 배열로 변환

**6) 에러 처리**
```typescript
const settled = await Promise.allSettled([...]);

settled.forEach((result, index) => {
  if (result.status === "fulfilled") {
    datasets[dataset] = result.value.rows;
  } else {
    errors[dataset] = result.reason.message;
  }
});
```

- 일부 실패해도 성공 데이터는 반환
- 각 데이터셋별 에러 분리

---

## 실전 사용 예제

### 1. 기본 경쟁률 조회

#### 1.1 백엔드 호출

**URL:**
```
GET /api/cheongyak?dataset=apt
```

**응답:**
```json
{
  "datasets": {
    "apt": [
      {
        "HOUSE_NM": "힐스테이트강남",
        "SUBSCRPT_RANK_CODE": "01",
        "SUPLY_HSHLDCO": "100",
        "CMPET_RATE": "150.5:1"
      }
    ]
  },
  "metadata": {
    "apt": {
      "pageNo": 1,
      "numOfRows": 10,
      "totalCount": 100
    }
  },
  "errors": {}
}
```

#### 1.2 프론트엔드 호출

```typescript
"use client";

import { useEffect, useState } from "react";

type Row = Record<string, string | number | null | undefined>;

export default function CheongyakPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/cheongyak?dataset=apt");
      const json = await res.json();
      setRows(json.datasets.apt ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <main>
      {loading ? (
        <p>로딩 중...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>단지명</th>
              <th>순위</th>
              <th>공급세대</th>
              <th>경쟁률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.HOUSE_NM}</td>
                <td>{row.SUBSCRPT_RANK_CODE}</td>
                <td>{row.SUPLY_HSHLDCO}</td>
                <td>{row.CMPET_RATE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

### 2. 여러 데이터셋 동시 조회

#### 2.1 백엔드 호출

**URL:**
```
GET /api/cheongyak?dataset=apt,officetel,special&pageNo=1&numOfRows=20
```

**응답:**
```json
{
  "datasets": {
    "apt": [...],
    "officetel": [...],
    "special": [...]
  },
  "metadata": {
    "apt": { "pageNo": 1, "numOfRows": 20, "totalCount": 150 },
    "officetel": { "pageNo": 1, "numOfRows": 20, "totalCount": 50 },
    "special": { "pageNo": 1, "numOfRows": 20, "totalCount": 30 }
  },
  "errors": {}
}
```

#### 2.2 프론트엔드 호출

```typescript
useEffect(() => {
  (async () => {
    const res = await fetch("/api/cheongyak?dataset=apt,officetel,special&pageNo=1&numOfRows=20");
    const json = await res.json();
    
    const aptData = json.datasets.apt ?? [];
    const officetelData = json.datasets.officetel ?? [];
    const specialData = json.datasets.special ?? [];
    
    // 각 데이터셋별 처리
    setAptRows(aptData);
    setOfficetelRows(officetelData);
    setSpecialRows(specialData);
    
    setLoading(false);
  })();
}, []);
```

### 3. 필터링 조회

#### 3.1 백엔드 호출

**URL:**
```
GET /api/cheongyak?dataset=apt&houseNm=힐스테이트&subscrptRankCode=01&sidoCode=11
```

**응답:**
```json
{
  "datasets": {
    "apt": [
      {
        "HOUSE_NM": "힐스테이트강남",
        "SUBSCRPT_RANK_CODE": "01",
        "SUBSCRPT_AREA_CODE_NM": "서울특별시",
        "CMPET_RATE": "150.5:1"
      }
    ]
  },
  "metadata": {
    "apt": { "totalCount": 1 }
  },
  "errors": {}
}
```

#### 3.2 프론트엔드 호출

```typescript
const [form, setForm] = useState({
  houseNm: "",
  subscrptRankCode: "",
  sidoCode: "",
});

const handleSearch = async () => {
  const params = new URLSearchParams();
  params.set("dataset", "apt");
  if (form.houseNm) params.set("houseNm", form.houseNm);
  if (form.subscrptRankCode) params.set("subscrptRankCode", form.subscrptRankCode);
  if (form.sidoCode) params.set("sidoCode", form.sidoCode);

  const res = await fetch(`/api/cheongyak?${params.toString()}`);
  const json = await res.json();
  setRows(json.datasets.apt ?? []);
};
```

### 4. 모집공고 상세 조회

#### 4.1 백엔드 호출

**URL:**
```
GET /api/cheongyak?dataset=notice&houseManageNo=A11078302&pblancNo=2023000001
```

**응답:**
```json
{
  "datasets": {
    "notice": [
      {
        "HOUSE_NM": "힐스테이트강남",
        "HSSPLY_ADRES": "서울특별시 강남구 테헤란로",
        "TOT_SUPLY_HSHLDCO": "500",
        "RCEPT_BGNDE": "2023-10-01",
        "RCEPT_ENDDE": "2023-10-10",
        "PRZWNER_PRESNATN_DE": "2023-10-20"
      }
    ]
  },
  "metadata": {},
  "errors": {}
}
```

#### 4.2 프론트엔드 호출

```typescript
const [detail, setDetail] = useState<any>(null);
const [houseManageNo, setHouseManageNo] = useState("");
const [pblancNo, setPblancNo] = useState("");

const loadDetail = async () => {
  const params = new URLSearchParams();
  params.set("dataset", "notice");
  params.set("houseManageNo", houseManageNo);
  params.set("pblancNo", pblancNo);

  const res = await fetch(`/api/cheongyak?${params.toString()}`);
  const json = await res.json();
  setDetail(json.datasets.notice?.[0] ?? null);
};
```

### 5. 에러 처리 예제

#### 5.1 백엔드 응답 (에러 발생)

```json
{
  "datasets": {
    "apt": [...]
  },
  "metadata": {
    "apt": { "pageNo": 1, "numOfRows": 10 }
  },
  "errors": {
    "officetel": "필수 파라미터 누락: houseManageNo, pblancNo",
    "special": "API 비정상 응답(code=-401): 유효하지 않은 인증키"
  }
}
```

#### 5.2 프론트엔드 처리

```typescript
const [error, setError] = useState<Record<string, string>>({});

useEffect(() => {
  (async () => {
    const res = await fetch("/api/cheongyak?dataset=apt,officetel");
    const json = await res.json();
    
    // 성공한 데이터
    if (json.datasets.apt) {
      setRows(json.datasets.apt);
    }
    
    // 에러 처리
    if (json.errors) {
      setError(json.errors);
      
      if (json.errors.officetel) {
        console.error("오피스텔 조회 실패:", json.errors.officetel);
      }
      if (json.errors.apt) {
        console.error("APT 조회 실패:", json.errors.apt);
      }
    }
  })();
}, []);
```

---

## 데이터셋 종류

### 1. 기본 경쟁률 데이터셋

#### apt - APT 경쟁률

**엔드포인트:** `getAPTLttotPblancCmpet`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**주요 필드:**

| 필드명 | 타입 | 설명 |
|-------|------|------|
| `HOUSE_NM` | string | 주택명 |
| `SUBSCRPT_RANK_CODE` | string | 순위 코드 (01: 1순위, 02: 2순위) |
| `SUBSCRPT_AREA_CODE_NM` | string | 접수 지역명 |
| `SUPLY_HSHLDCO` | string | 공급세대수 |
| `CMPET_RATE` | string | 경쟁률 (예: "150.5:1") |
| `RCRIT_PBLANC_DE` | string | 모집공고일 |
| `PBLANC_DE` | string | 공고일 |

**사용 예시:**
```
GET /api/cheongyak?dataset=apt&pageNo=1&numOfRows=50
```

#### officetel - 오피스텔/도시형/생활숙박

**엔드포인트:** `getUrbyOfctlLttotPblancCmpet`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**주요 필드:**

| 필드명 | 타입 | 설명 |
|-------|------|------|
| `HOUSE_NM` | string | 주택명 |
| `HOUSE_DTL_SECD_NM` | string | 주택상세구분명 (오피스텔, 도시형, 생활숙박 등) |
| `SUPLY_HSHLDCO` | string | 공급세대수 |
| `CMPET_RATE` | string | 경쟁률 |

**사용 예시:**
```
GET /api/cheongyak?dataset=officetel
```

#### privateRent - 공공지원 민간임대

**엔드포인트:** `getPblPvtRentLttotPblancCmpet`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**사용 예시:**
```
GET /api/cheongyak?dataset=privateRent
```

#### canceled - 취소/후재공

**엔드포인트:** `getCancResplLttotPblancCmpet`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**사용 예시:**
```
GET /api/cheongyak?dataset=canceled
```

#### remaining - 잔여세대

**엔드포인트:** `getRemndrLttotPblancCmpet`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**사용 예시:**
```
GET /api/cheongyak?dataset=remaining
```

#### score - 당첨 점수

**엔드포인트:** `getAPTLttotPblancScore`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**사용 예시:**
```
GET /api/cheongyak?dataset=score
```

#### special - 특별공급 신청현황

**엔드포인트:** `getAPTSplplyReqstStus`  
**서비스:** `ApplyhomeInfoCmpetRtSvc`

**사용 예시:**
```
GET /api/cheongyak?dataset=special
```

### 2. 모집공고 상세 데이터셋

#### noticeList - 모집공고 목록

**엔드포인트:** `getAPTLttotPblancDetail`  
**서비스:** `ApplyhomeInfoDetailSvc`  
**페이지네이션:** `page/perPage` 모드

**주요 필드:**

| 필드명 | 타입 | 설명 |
|-------|------|------|
| `HOUSE_NM` | string | 주택명 |
| `BSNS_MBY_NM` | string | 사업주체 |
| `BSNS_MBY_TELNO` | string | 사업주체 전화번호 |
| `RCRIT_PBLANC_DE` | string | 모집공고일 |
| `PBLANC_DE` | string | 공고일 |
| `RCEPT_BGNDE` | string | 청약접수 시작일 |
| `RCEPT_ENDDE` | string | 청약접수 종료일 |
| `PRZWNER_PRESNATN_DE` | string | 당첨자 발표일 |
| `HOUSE_MANAGE_NO` | string | 주택관리번호 |
| `PBLANC_NO` | string | 모집공고번호 |

**사용 예시:**
```
GET /api/cheongyak?dataset=noticeList&page=1&perPage=20
```

#### notice - 특정 공고 상세

**엔드포인트:** `getAPTLttotPblancDetail`  
**서비스:** `ApplyhomeInfoDetailSvc`  
**필수 파라미터:** `houseManageNo`, `pblancNo`

**사용 예시:**
```
GET /api/cheongyak?dataset=notice&houseManageNo=A11078302&pblancNo=2023000001
```

#### noticeModel - 특정 공고 모델

**엔드포인트:** `getAPTLttotPblancMdl`  
**서비스:** `ApplyhomeInfoDetailSvc`  
**필수 파라미터:** `houseManageNo`, `pblancNo`

**사용 예시:**
```
GET /api/cheongyak?dataset=noticeModel&houseManageNo=A11078302&pblancNo=2023000001
```

#### noticeCompetition - 특정 공고 경쟁률

**엔드포인트:** `getAPTLttotPblancCmpet` (경쟁률 서비스)  
**서비스:** `ApplyhomeInfoCmpetRtSvc`  
**필수 파라미터:** `houseManageNo`, `pblancNo`  
**페이지네이션:** `page/perPage` 모드

**사용 예시:**
```
GET /api/cheongyak?dataset=noticeCompetition&houseManageNo=A11078302&pblancNo=2023000001
```

#### noticeSpecial - 특정 공고 특별공급

**엔드포인트:** `getAPTSpsplyReqstStus` (경쟁률 서비스)  
**서비스:** `ApplyhomeInfoCmpetRtSvc`  
**필수 파라미터:** `houseManageNo`, `pblancNo`  
**페이지네이션:** `page/perPage` 모드

**사용 예시:**
```
GET /api/cheongyak?dataset=noticeSpecial&houseManageNo=A11078302&pblancNo=2023000001
```

---

## 에러 처리

### 1. 에러 코드 종류

| 에러 코드 | 메시지 | 원인 | 해결 방법 |
|----------|-------|------|----------|
| `-401` | 유효하지 않은 인증키 | 잘못된 `serviceKey` | `.env` 파일 확인, 키 재발급 |
| `-4` | 등록되지 않은 인증키 | 다른 서비스의 키 사용 | 해당 서비스 활용신청 완료 확인 |
| `-500` | 서버 오류 | 공공데이터 서버 문제 | 재시도 또는 문의 |
| 기타 | 필수 파라미터 누락 | 필수 파라미터 미입력 | 요청 파라미터 확인 |

### 2. 에러 처리 예제

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});

useEffect(() => {
  (async () => {
    try {
      const res = await fetch("/api/cheongyak?dataset=apt,officetel");
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const json = await res.json();
      
      // 부분 성공
      if (json.errors && Object.keys(json.errors).length > 0) {
        setErrors(json.errors);
        
        // 에러별 처리
        if (json.errors.apt?.includes("-401")) {
          alert("API 인증키가 유효하지 않습니다. .env 파일을 확인하세요.");
        }
      }
      
      // 데이터 설정
      if (json.datasets.apt) {
        setAptRows(json.datasets.apt);
      }
      if (json.datasets.officetel) {
        setOfficetelRows(json.datasets.officetel);
      }
    } catch (err) {
      console.error("API 호출 실패:", err);
      alert("데이터를 불러오는 중 오류가 발생했습니다.");
    }
  })();
}, []);
```

### 3. UI 에러 표시

```typescript
{errors.apt && (
  <div style={{ padding: 12, background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 8, marginBottom: 16 }}>
    <p style={{ margin: 0, color: "#991b1b" }}>
      <strong>APT 조회 실패:</strong> {errors.apt}
    </p>
    <button onClick={refetch} style={{ marginTop: 8, padding: "4px 8px" }}>
      재시도
    </button>
  </div>
)}
```

---

## 트러블슈팅

### 1. 환경 변수가 읽히지 않는 경우

**증상:**
```
⚠️ REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.
```

**원인:**
- `.env` 파일이 없음
- `.env` 파일 위치 오류 (루트에 있어야 함)
- 환경변수 이름 오타 (`REB_API_KEY` 확인)
- 개발 서버 재시작 안 함

**해결 방법:**

1. `.env` 파일 위치 확인
   ```
   my-cheongyak-project/
   ├── .env          ← 여기!
   ├── package.json
   ├── src/
   ```

2. 환경변수 이름 확인
   ```env
   REB_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. 개발 서버 재시작
   ```bash
   # Ctrl+C로 서버 중지 후
   npm run dev
   ```

### 2. CORS 에러

**증상:**
```
Access to fetch at 'https://api.odcloud.kr/...' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

**원인:**
- 프론트엔드에서 직접 공공데이터 API 호출

**해결 방법:**
- 서버 라우트(`/api/cheongyak`)를 통해 호출
- 절대 `fetch("https://api.odcloud.kr/...")` 직접 호출 금지

### 3. API 응답이 XML로 반환되는 경우

**증상:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>...</response>
```

**원인:**
- `returnType=json` 파라미터 누락

**해결 방법:**
- `fetchRebData` 함수에서 자동으로 `returnType: "json"` 주입됨
- API 클라이언트 코드 확인

### 4. 특정 데이터셋만 조회 안 되는 경우

**증상:**
```json
{
  "errors": {
    "notice": "필수 파라미터 누락: houseManageNo, pblancNo"
  }
}
```

**원인:**
- 필수 파라미터 미입력
- 다른 서비스의 인증키 사용 (활용신청 미완료)

**해결 방법:**

1. 필수 파라미터 확인 (데이터셋별로 다름)
2. 해당 서비스 활용신청 완료 여부 확인
3. 공공데이터포털 마이페이지에서 승인 상태 확인

### 5. 페이지네이션이 작동하지 않는 경우

**증상:**
- 항상 첫 페이지만 조회됨

**원인:**
- `pageNo` 또는 `numOfRows` 파라미터 미전달
- 잘못된 페이지네이션 방식 사용

**해결 방법:**

```typescript
// 기본 방식
fetch("/api/cheongyak?dataset=apt&pageNo=2&numOfRows=20");

// 페이지 방식 (noticeList, noticeCompetition 등)
fetch("/api/cheongyak?dataset=noticeList&page=2&perPage=20");
```

### 6. 검색이 작동하지 않는 경우

**증상:**
- 키워드 입력해도 결과가 나오지 않음

**원인:**
- LIKE 조건식이 해당 API에서 지원되지 않음
- 대소문자 구분

**해결 방법:**

```typescript
// q 또는 houseNm 파라미터 사용
fetch("/api/cheongyak?dataset=apt&q=힐스테이트");
// 또는
fetch("/api/cheongyak?dataset=apt&houseNm=힐스테이트");
```

---

## 확장 가이드

### 1. 새로운 데이터셋 추가

#### 1.1 `src/lib/reb.ts`에 서비스 추가

```typescript
const SERVICE_BASE_URLS = {
  ApplyhomeInfoCmpetRtSvc: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1",
  ApplyhomeInfoDetailSvc: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
  ApplyhomeInfoOfferSvc: "https://api.odcloud.kr/api/ApplyhomeInfoOfferSvc/v1",
  NewServiceSvc: "https://api.odcloud.kr/api/NewServiceSvc/v1",  // 새 서비스 추가
} as const;
```

#### 1.2 `src/app/api/cheongyak/route.ts`에 데이터셋 추가

```typescript
const DATASETS = {
  // ... 기존 데이터셋
  
  newDataset: {
    endpoint: "getNewEndpoint",
    service: "NewServiceSvc",
    includePaging: true,
    pagingMode: "default",
  },
} as const satisfies Record<string, DatasetConfig>;
```

#### 1.3 프론트엔드에서 사용

```typescript
const res = await fetch("/api/cheongyak?dataset=newDataset");
const json = await res.json();
const rows = json.datasets.newDataset ?? [];
```

### 2. 새로운 필터 추가

#### 2.1 API 라우트에서 파라미터 전달

```typescript
// src/app/api/cheongyak/route.ts

const passthroughParams: Record<string, string | number> = {};
searchParams.forEach((value, key) => {
  if (key === "dataset" || key === "pageNo" || key === "numOfRows") return;
  if (value) passthroughParams[key] = value;
});

// passthroughParams는 자동으로 fetchRebData에 전달됨
```

#### 2.2 프론트엔드에서 전달

```typescript
const params = new URLSearchParams();
params.set("dataset", "apt");
params.set("sidoCode", "11");  // 필터 추가
params.set("subscrptRankCode", "01");  // 필터 추가

const res = await fetch(`/api/cheongyak?${params.toString()}`);
```

### 3. 데이터 캐싱 추가

#### 3.1 서버 측 캐싱

```typescript
// src/app/api/cheongyak/route.ts

export async function GET(req: NextRequest) {
  // Next.js 캐싱 설정
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
```

#### 3.2 클라이언트 측 캐싱

```typescript
import { useMemo } from "react";

const [rows, setRows] = useState([]);

const filteredRows = useMemo(() => {
  if (!filterKeyword) return rows;
  return rows.filter((row) =>
    String(row.HOUSE_NM).includes(filterKeyword)
  );
}, [rows, filterKeyword]);
```

### 4. 차트 추가 (Recharts)

#### 4.1 설치

```bash
npm install recharts
```

#### 4.2 사용 예제

```typescript
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function CompetitionChart({ rows }: { rows: Row[] }) {
  const chartData = useMemo(() => {
    return rows
      .map((row) => ({
        name: row.HOUSE_NM,
        rate: parseRate(row.CMPET_RATE),
      }))
      .filter((item) => item.rate !== null)
      .sort((a, b) => b.rate! - a.rate!)
      .slice(0, 10);
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData}>
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="rate" fill="#2563eb" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 5. 데이터 내보내기

#### 5.1 CSV 내보내기

```typescript
function exportToCSV(rows: Row[], filename: string) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]).join(",");
  const csvRows = rows.map((row) =>
    Object.values(row)
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csvContent = [headers, ...csvRows].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

#### 5.2 JSON 내보내기

```typescript
function exportToJSON(rows: Row[], filename: string) {
  const jsonContent = JSON.stringify(rows, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

### 6. 데이터베이스 연동

#### 6.1 Supabase 연동

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function saveToDatabase(rows: Row[]) {
  const { error } = await supabase
    .from("competition_data")
    .insert(rows);
  
  if (error) {
    console.error("DB 저장 실패:", error);
  }
}
```

#### 6.2 자동 데이터 수집 (Cron)

```typescript
// src/app/api/cron/route.ts

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 데이터 수집
  const res = await fetch("http://localhost:3000/api/cheongyak?dataset=apt");
  const json = await res.json();
  
  // DB 저장
  await saveToDatabase(json.datasets.apt);
  
  return NextResponse.json({ success: true });
}
```

---

## 완전한 예제 코드

### 1. 전체 구조

#### 1.1 `src/lib/reb.ts`

```typescript
const SERVICE_BASE_URLS = {
  ApplyhomeInfoCmpetRtSvc: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1",
  ApplyhomeInfoDetailSvc: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
} as const;

type ServiceKey = keyof typeof SERVICE_BASE_URLS;
const DEFAULT_BASE_URL = SERVICE_BASE_URLS.ApplyhomeInfoCmpetRtSvc;
const API_KEY = process.env.REB_API_KEY as string;

type Params = Record<string, string | number | undefined>;
type FetchOptions = { service?: ServiceKey; includePaging?: boolean };

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
  const { pageNo, numOfRows, ...rest } = params;

  const query = toQuery({
    serviceKey: API_KEY,
    returnType: "json",
    ...(includePaging ? { pageNo: pageNo ?? 1, numOfRows: numOfRows ?? 10 } : {}),
    ...rest,
  });

  const url = `${baseUrl}/${endpoint}?${query}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 호출 오류: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json && typeof json === "object" && "code" in json && json.code !== 0 && json.code !== "0") {
    throw new Error(`API 비정상 응답(code=${json.code}): ${json.msg}`);
  }
  
  return json;
}
```

#### 1.2 `src/app/api/cheongyak/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { fetchRebData } from "@/lib/reb";

type DatasetConfig = {
  endpoint: string;
  service?: "ApplyhomeInfoCmpetRtSvc" | "ApplyhomeInfoDetailSvc";
  includePaging?: boolean;
};

const DATASETS = {
  apt: { endpoint: "getAPTLttotPblancCmpet" },
  officetel: { endpoint: "getUrbyOfctlLttotPblancCmpet" },
  special: { endpoint: "getAPTSplplyReqstStus" },
} as const;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const datasets = searchParams.get("dataset")?.split(",") ?? ["apt"];
  
  const results = await Promise.allSettled(
    datasets.map(async (dataset) => {
      const config = DATASETS[dataset as keyof typeof DATASETS];
      const response = await fetchRebData(config.endpoint, {}, { service: config.service });
      return { dataset, rows: response.data ?? [] };
    })
  );

  const data: Record<string, any> = {};
  const errors: Record<string, string> = {};

  results.forEach((result, i) => {
    const dataset = datasets[i];
    if (result.status === "fulfilled") {
      data[dataset] = result.value.rows;
    } else {
      errors[dataset] = result.reason.message;
    }
  });

  return NextResponse.json({ datasets: data, errors });
}
```

#### 1.3 `src/app/cheongyak/page.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";

type Row = Record<string, any>;

export default function CheongyakPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/cheongyak?dataset=apt");
      const json = await res.json();
      
      setRows(json.datasets.apt ?? []);
      setErrors(json.errors ?? {});
      setLoading(false);
    })();
  }, []);

  if (loading) return <div>로딩 중...</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>청약 경쟁률 조회</h1>
      
      {errors.apt && (
        <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, marginBottom: 16 }}>
          에러: {errors.apt}
        </div>
      )}
      
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: 8 }}>단지명</th>
            <th style={{ border: "1px solid #ddd", padding: 8 }}>경쟁률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.HOUSE_NM}</td>
              <td style={{ border: "1px solid #ddd", padding: 8 }}>{row.CMPET_RATE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

---

## 참고 자료

### 공식 문서

- **공공데이터포털**: https://www.data.go.kr
- **청약홈 API 문서**: https://www.data.go.kr/iim/api/selectAPIAcountView.do
- **Next.js 공식 문서**: https://nextjs.org/docs
- **Recharts 공식 문서**: https://recharts.org

### 관련 검색 키워드

- `ApplyhomeInfoCmpetRtSvc` - 경쟁률 서비스
- `ApplyhomeInfoDetailSvc` - 모집공고 상세 서비스
- `getAPTLttotPblancCmpet` - APT 경쟁률 엔드포인트
- `청약 접수 결과` - 공공데이터서비스명

### 유용한 링크

- 공공데이터포털 활용신청 페이지
- Next.js API Routes 가이드
- TypeScript 핸드북
- Recharts 예제 갤러리

---

## 버전 정보

- **문서 버전**: v1.0
- **Next.js**: 14.2.33
- **React**: 18.3.1
- **TypeScript**: 5.6.3
- **작성일**: 2025-01-15

---

## 라이선스

이 가이드는 프로젝트 내부 사용을 위해 작성되었습니다.

---

## 작성자 노트

> 이 문서는 다른 AI가 청약홈 API 연동을 바로 적용할 수 있도록 상세하게 작성되었습니다.  
> 각 섹션은 독립적으로 이해할 수 있으며, 전체적인 흐름을 파악한 후 단계별로 구현하시기 바랍니다.  
> 트러블슈팅 섹션은 실제 개발 중 자주 발생하는 문제들을 해결하는 데 도움이 될 것입니다.
