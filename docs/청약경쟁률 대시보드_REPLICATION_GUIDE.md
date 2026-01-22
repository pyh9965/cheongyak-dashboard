# 청약경쟁률 대시보드 완전 구현 가이드 (A-Z)

이 문서는 **'청약경쟁률 대시보드' 프로젝트를 처음부터 끝까지(A-Z) 100% 동일하게 구현하기 위한 마스터 가이드**입니다. 다른 AI나 개발자가 이 문서만 보고 프로젝트를 완벽하게 복제할 수 있도록 모든 기술적 세부사항, 파일 구조, 핵심 로직을 포함합니다.

---

## 1. 프로젝트 개요

- **프로젝트명**: 청약경쟁률 대시보드 (Cheongyak Dashboard)
- **목적**: 공공데이터포털의 청약홈 API를 활용하여 아파트 분양 정보 및 실시간 경쟁률을 시각화(지도, 리스트, 차트)하여 제공.
- **핵심 기능**:
    - 전국 분양 아파트 지도 시각화 (Zoom 레벨별 클러스터링)
    - 실시간 경쟁률 및 특별공급 현황 조회
    - 과거 데이터 정적 캐싱 (속도 최적화 및 API 한계 극복)
    - 모바일 반응형 UI

## 2. 기술 스택 및 환경

### 2.1 Core
- **Framework**: Next.js 14.2 (App Router)
- **Language**: TypeScript 5.6
- **Runtime**: Node.js 18+

### 2.2 Libraries
- **UI/Styling**: CSS Modules (Native), Vanilla CSS
- **Map**: Leaflet, React-Leaflet, Leaflet.markercluster
- **Chart**: Chart.js, React-Chartjs-2
- **Data Fetching**: Native Fetch API
- **Utilities**: `dotenv`, `xlsx` (Excel Export)

### 2.3 External APIs
- **Data Source**: 공공데이터포털 ([청약홈 - 청약접수 결과 조회](https://www.data.go.kr/data/15077455/openapi.do))
- **Geocoding**: Kakao Maps API (Client-side)

---

## 3. 프로젝트 구조 (Directory Structure)

이 구조를 정확히 준수해야 합니다.

```
/
├── .env                  # 환경변수 (REB_API_KEY 등)
├── next.config.js        # Next.js 설정
├── package.json          # 의존성 및 스크립트
├── tsconfig.json         # TypeScript 설정
├── public/
│   └── data/             # 정적 캐시 파일 저장소
│       └── cheongyak-archive.json
├── scripts/              # 데이터 수집 및 유틸리티 스크립트
│   └── generate-cache.js # 캐시 생성 핵심 스크립트
├── src/
│   ├── app/              # App Router 루트
│   │   ├── layout.tsx    # Root Layout
│   │   ├── page.tsx      # 리다이렉트 (/) -> (/apt)
│   │   ├── globals.css   # 전역 스타일
│   │   ├── api/
│   │   │   └── cheongyak/
│   │   │       └── route.ts # API Proxy Route
│   │   └── apt/
│   │       ├── page.tsx     # 메인 대시보드 페이지
│   │       └── page.module.css
│   ├── components/       # UI 컴포넌트
│   │   ├── CompetitionRateMap.tsx
│   │   ├── CompetitionTable.tsx
│   │   ├── StatsDashboard.tsx
│   │   └── ExportExcelButton.tsx
│   └── lib/              # 비즈니스 로직 및 유틸리티
│       ├── reb.ts        # API 클라이언트 (Server-side)
│       ├── cache-loader.ts # 캐시 로딩 및 병합 로직
│       ├── detail-data.ts  # 상세 데이터 파싱 로직
│       ├── detail-utils.ts # 포맷팅 유틸리티
│       └── geo-coordinates.ts # 지역별 좌표 상수
└── docs/                 # 프로젝트 문서
```

---

## 4. 환경 설정 (Setup)

### 4.1 package.json 의존성
```json
{
  "dependencies": {
    "next": "^14.2.33",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "typescript": "5.6.3",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "leaflet.markercluster": "^1.5.3",
    "chart.js": "^4.5.1",
    "react-chartjs-2": "^5.3.1",
    "xlsx": "^0.18.5",
    "file-saver": "^2.0.5",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "@types/node": "20.11.30",
    "@types/react": "18.2.66",
    "@types/leaflet": "^1.9.21",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.5"
  }
}
```

### 4.2 .env 설정 (필수)
프로젝트 루트에 `.env.local` 파일을 생성하고 다음 키를 설정해야 합니다.

```env
# 공공데이터포털 디코딩 키 (Server-side Only)
REB_API_KEY=your_public_data_portal_decoding_key

# 카카오 맵 API 키 (Client-side, JavaScript 키)
NEXT_PUBLIC_KAKAO_API_KEY=your_kakao_javascript_key
```

> **주의**: `REB_API_KEY`는 서버에서만 접근하며, `NEXT_PUBLIC_` 접두사가 붙은 키는 클라이언트에 노출됩니다.

### 4.3 next.config.js
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],
}
module.exports = nextConfig
```

---

## 5. 핵심 아키텍처 및 구현 가이드

이 프로젝트의 핵심은 **"느린 공공데이터 API를 빠르게 보여주는 하이브리드 데이터 전략"**입니다.

### 5.1 데이터 전략 (Data Strategy)
1.  **정적 캐시 (`scripts/generate-cache.js`)**:
    -   배포 시점 또는 주기적으로 스크립트를 실행하여 과거 5년치 데이터를 `public/data/cheongyak-archive.json`으로 저장합니다.
    -   통계(경쟁률 합계)를 미리 계산하여 저장합니다.
2.  **동적 조회 (API Proxy)**:
    -   최신 데이터나 상세 정보는 실시간으로 API를 호출합니다.
3.  **하이브리드 병합 (`src/lib/cache-loader.ts`)**:
    -   앱 실행 시 정적 캐시를 로드합니다.
    -   사용자가 검색/필터링할 때 API를 호출하고, 캐시 데이터와 ID(`HOUSE_MANAGE_NO` + `PBLANC_NO`) 기준으로 병합(Merge)합니다.

### 5.2 백엔드 API Proxy (`src/app/api/cheongyak/route.ts`)
-   **역할**: 클라이언트의 API 키 노출 방지 및 CORS 해결.
-   **구현**:
    -   `GET` 요청을 받아 `dataset` 파라미터(list, detail 등)에 따라 공공데이터 API의 여러 엔드포인트를 병렬 호출(`Promise.allSettled`)합니다.
    -   필수 파라미터 검증 및 검색 조건(`cond[KEY::LIKE]`) 변환을 담당합니다.

### 5.3 메인 페이지 (`src/app/apt/page.tsx`)
-   **상태 관리**:
    -   `archiveCache`: 초기 로드 된 대용량 정적 데이터.
    -   `mergedData`: 캐시 + 라이브 API 병합 데이터.
    -   `extraData`: 상세 보기 시 로드된 세부 정보 (Local Storage에 캐싱).
-   **필터링 로직**:
    -   지역 필터: 코드 매칭(예: 서울 11) 뿐만 아니라 특수 케이스(세종 36->338, 제주 50->690)를 반드시 처리해야 합니다.
    -   **중요**: 공공분양/임대/신혼희망타운은 경쟁률 데이터 형식이 다르므로 반드시 필터링 제외합니다.

### 5.4 상세 데이터 파싱 (`src/lib/detail-data.ts`)
-   **복잡성 해결**:
    -   API는 모델(평형), 경쟁률(1/2순위), 특별공급 데이터를 별도 배열로 반환합니다.
    -   `buildApplicationRows` 함수에서 이 3가지 배열을 `MODEL_NO` 또는 `HOUSE_TY` 기준으로 조인(Join)하여 하나의 UI용 객체(`ApplicationRow`)로 변환합니다.
    -   **경쟁률 계산**: `REQ_CNT`(접수) / `SUPLY_HSHLDCO`(공급) 로직을 정확히 구현해야 합니다.

### 5.5 지도 시각화 (`src/components/CompetitionRateMap.tsx`)
-   **라이브러리**: `react-leaflet`, `leaflet.markercluster`
-   **구현 포인트**:
    -   `MarkerClusterGroup`을 사용하여 줌 레벨에 따라 마커를 그룹화합니다.
    -   마커 아이콘: `L.divIcon`을 사용하여 HTML로 커스텀 디자인(알약 모양, 경쟁률 숫자가 마커 안에 표시됨)을 구현합니다.
    -   색상 코딩: 경쟁률에 따라 파란색(미달) -> 빨간색(고경쟁) 그라데이션 적용.
    -   **동적 스크립트 로드**: `layout.tsx`에 `<script>` 태그를 넣는 대신, `useEffect` 내에서 Leaflet CSS/JS와 Kakao Maps SDK를 순차적으로 동적 로드하여 초기 로딩 성능을 최적화해야 합니다.

```typescript
// 예시: 순차 로드 로직
// 1. Leaflet CSS/JS 로드
// 2. onload -> Kakao SDK 로드 (`autoload=false`)
// 3. onload -> kakao.maps.load() -> MarkerCluster 로드 -> 지도 초기화
```

### 5.6 핵심 비즈니스 로직 및 예외 처리 (Critical Business Logic)

이 프로젝트의 정확성을 위해 다음 로직은 **반드시 원본 그대로 구현**되어야 합니다.

#### 1) 지역 코드 매핑 예외 처리 (Region Mapping Edge Cases)
청약홈 API의 지역 코드와 행정구역 코드가 불일치하는 특수 케이스가 있습니다. (`page.tsx`)

| 지역 | UI 선택 코드 | 예상 API 코드 (일반) | **실제 API 코드 (매핑 필요)** | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| **세종** | `36` | `360` (충북과 중복) | **`338`** | 반드시 `338`로 변환하여 요청/필터링 |
| **제주** | `50` | `500` (광주와 중복) | **`690`** | 반드시 `690`으로 변환하여 요청/필터링 |
| **경기** | `41` | `410` | `410` | 정상 (일반 패턴: 코드 + "0") |

```typescript
// 예시: 필터링 로직
if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true; // 세종
if (targetCode === "50" && item.SUBSCRPT_AREA_CODE === "690") return true; // 제주
```

#### 2) 필터링 제외 키워드 (Exclusion Rules)
본 대시보드는 **민간 분양** 아파트 정보 제공에 집중합니다. 데이터 일관성을 위해 다음 키워드가 포함된 공고는 필터링됩니다.
-   **제외 타입**: `공공`, `임대`, `신혼희망타운`, `국민임대`, `영구임대`, `행복주택`
-   **구현 위치**: `mergeCacheAndApiData` 이후 클라이언트 필터링 단계

#### 3) 경쟁률 데이터 정규화 (`detail-data.ts`)
API는 평형(Model Type), 경쟁률, 특별공급 데이터를 서로 다른 3개의 배열로 반환합니다. 이를 하나의 Row로 합칠 때 **`MODEL_NO`(주택관리번호) 정규화**가 필수입니다.
-   API가 가끔 `" 084.99 "` 처럼 공백을 포함하거나 포맷이 다른 경우를 대비해 `normalizeModelNo` 함수를 사용해야 매칭 실패를 방지할 수 있습니다.

---

## 6. UI/UX 및 디자인 명세 (Design Specification)

프로젝트의 시각적 일관성과 사용자 경험을 위해 다음 디자인 명세를 반드시 준수해야 합니다.

### 6.1 컬러 시스템 (Color Palette)

| 역할 | 색상 코드 | 용도 |
| :--- | :--- | :--- |
| **Primary** | `#0066cc` | 메인 블루. 링크, 강조 텍스트, 활성 버튼, 결과 확인 버튼 |
| **Background** | `#f5f5f5` | 앱 전체 배경 (Soft Grey) |
| **Component BG** | `#ffffff` | 카드, 테이블, 컨테이너 배경 |
| **Header BG** | `#f3f4f6` | 테이블 헤더 배경 |
| **Border** | `#e5e7eb` | 구획 구분선 |
| **Text Primary** | `#333333` | 기본 텍스트 |
| **Text Secondary** | `#666666` | 부가 정보, 비활성 상태 |
| **Danger** | `#ef4444` | 오류 메시지, 빨간색 배경 등 |
| **Success** | `#217346` | 엑셀 다운로드 버튼 (Green) |

### 6.2 타이포그래피 (Typography)

-   **Font Family**:
    -   기본: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
    -   강조(한글): `"Noto Sans KR", system-ui` (테이블 등 가독성 중요 영역)
-   **Size Strategy**:
    -   Header/Title: `20px ~ 28px` (Bold 600)
    -   Table Header: `13px` (Semi-bold 600)
    -   Table Body: `14px` (Regular 400)
    -   Detail/Description: `12px` (Color `#6b7280`)

### 6.3 레이아웃 및 반응형 전략

-   **Desktop (> 740px)**
    -   **Table Layout**: 정보의 밀도를 높인 테이블 형태 유지.
    -   **Sticky Header**: 스크롤 시에도 항목명이 보이도록 고정.
    -   **Tooltip**: 마커 등에서 Hover 시 정보 표시.

-   **Mobile (< 740px)**
    -   **Card Layout**: 테이블의 각 행(Row)을 독립된 카드 형태로 변환 (`display: flex`, `flex-direction: column`).
    -   **Labeling**: `::before` 가상 요소를 사용하여 `data-label` 속성값을 항목명으로 표시 (CSS Content).
    -   **Scroll**: 가로 스크롤이 필요한 경우 `overflow-x: auto` 적용 및 직관적인 힌트("좌우로 스크롤하세요") 제공.

### 6.4 주요 컴포넌트 스타일링 가이드

#### 1) 메인 리스트 및 테이블
-   **헤더**: 회색 배경(`f3f4f6`) + 중앙 정렬 + BoldText.
-   **셀(Cell)**:
    -   텍스트(주택명 등): 좌측 정렬, 말줄임(`ellipsis`) 처리.
    -   숫자(경쟁률, 공급세대): **반드시 우측 정렬**, 등폭 숫자(`tabular-nums`) 적용.
    -   설명(비고): 작은 글씨(`12px`), 회색조.
-   **강조**: 경쟁률 숫자는 `#0066cc`로 강조.

#### 2) 경쟁률 지도 (Map)
-   **마커**:
    -   기본 마커 대신 `divIcon`을 활용한 커스텀 HTML 마커 사용.
    -   모양: 알약(Pill) 형태 (배경색 + 텍스트).
    -   **색상 코딩**: 경쟁률 수치에 따라 `Blue(미달)` -> `Yellow` -> `Red(고경쟁)` 그라데이션 적용.
    -   **클러스터링**: 줌 아웃 시 지역 단위로 원형 클러스터링(`leafet.markercluster`).

### 6.5 CSS 구현 원칙 (구현 시 주의사항)
1.  **CSS Modules 사용**: 컴포넌트별 스타일 격리 (`*.module.css`).
2.  **Global Reset**: `src/app/globals.css`에서 기본 box-sizing 및 폰트 설정.
3.  **Utility Styles**: 자주 쓰는 정렬이나 색상은 유틸리티 클래스로 정의하지 않고, 각 모듈에서 시멘틱하게 정의하는 것을 선호(유지보수 용이성).
4.  **Important Usage**: 서드파티 라이브러리(Leaflet 등) 오버라이딩 시에만 `!important` 제한적 사용.

### 6.6 UI 레이아웃 구조도 (Visual Wireframes)

단순한 텍스트 설명을 넘어, 실제 구현해야 할 UI의 구조를 시각적으로 정의합니다. 이 와이어프레임은 **반드시 준수해야 할 디자인 가이드라인**입니다.

#### 1) 데스크탑 메인 리스트 (Desktop Table)
헤더는 고정(Sticky)되며, 숫자는 우측 정렬되어야 합니다.

```text
+-----------------------------------------------------------------------+
|  주택명 (Left)          | 공급세대 (Right) |  경쟁률 (Right)  |   결과   | <-- Header (Grey)
+-----------------------------------------------------------------------+
| [Hot] 래미안 원펜타스     |           120  |      1,234.5:1  | [확인]  | <-- Row (Hover Effect)
| 서울 서초구 / 민영       |                |   (1순위 해당)   |         |
+-----------------------------------------------------------------------+
|  ...                    |           ...  |            ...  |   ...   |
+-----------------------------------------------------------------------+
```

#### 2) 상세 정보 아코디언 (Detail Expandable View)
주택명 클릭 시 하단에 펼쳐지는 상세 영역입니다. 타입(Model) 컬럼이 좌측에 고정됩니다.

```text
+-----------------------------------------------------------------------+
| v 래미안 원펜타스 (Clicked)                                            |
+=======================================================================+
| [ 상세 정보 테이블 ]  (Horizontal Scroll Allowed)                      |
|                                                                       |
| | 타입  |  공급  | 특별공급 |  1순위  |  2순위  | 당첨자발표일 |      |
| |------|-------|---------|--------|--------|-------------|      |
| | 59A  |   25  |    10   | 150.2:1|   -    |  2024-05-01 |      |
| | 84B  |   15  |     5   | 210.5:1| 10.0:1 |  2024-05-01 |      |
|                                                                       |
+=======================================================================+
```

#### 3) 모바일 카드 뷰 (Mobile Card Layout, < 740px)
좁은 화면에서는 테이블의 행(Row)이 카드(Card) 형태로 변환됩니다. `data-label`을 이용해 항목명을 표시합니다.

```text
+-----------------------------------+
|  [Hot] 래미안 원펜타스              | <-- Bold Title
+-----------------------------------+
|  공급세대 :              120 세대  | <-- Flex Layout
|  경쟁률   :           1,234.5 : 1 | <-- Highlight Color
|  접수기간 :       2024-01-20 ~ 22 |
|                                   |
|             [ 결과 확인 ]          | <-- Full Width Button
+-----------------------------------+
```

#### 4) 지도 마커 디자인 (Map Custom Marker)
기본 핀 대신 정보를 담은 알약(Pill) 형태를 사용합니다.

```text
      [  25.4:1  ]  <-- Background Color (Blue/Yellow/Red)
          \/        <-- Pointer
```

---

## 7. 구현 단계별 체크리스트

### Step 1: 기본 골격 생성
- [ ] `create-next-app`으로 프로젝트 생성
- [ ] 폴더 구조 세팅 (src/app, src/lib, src/components, scripts)
- [ ] 패키지 설치 (`leaflet`, `chart.js` 등)

### Step 2: API 클라이언트 및 Proxy 구현
- [ ] `.env` 설정
- [ ] `src/lib/reb.ts`: `fetchRebData` 함수 구현 (재시도 로직, 파라미터 직렬화)
- [ ] `src/app/api/cheongyak/route.ts`: 데이터셋별 엔드포인트 매핑 구현

### Step 3: 데이터 로직 구현
- [ ] `src/lib/detail-data.ts`: 복잡한 응답 데이터 정규화 로직 작성 (가장 중요)
- [ ] `scripts/generate-cache.js`: 전체 데이터 수집 스크립트 작성 및 테스트 실행 -> `public/data/` 파일 생성 확인

### Step 4: UI 컴포넌트 개발
- [ ] `CompetitionRateMap.tsx`: 지도 및 마커 클러스터링
- [ ] `CompetitionTable.tsx`: 상세 정보 테이블 (수평 스크롤, Sticky 컬럼)
- [ ] `StatsDashboard.tsx`: `Chart.js`를 이용한 월별/지역별 경쟁률 차트

### Step 5: 메인 페이지 통합
- [ ] `src/app/apt/page.tsx`에서 모든 컴포넌트 조립
- [ ] `useEffect`를 통한 데이터 로딩 파이프라인 구축 (Cache Load -> Setup -> Live Fetch -> Merge)
- [ ] `LocalStorage` 캐싱 로직 추가 (재방문 시 속도 향상)

---

## 8. 주요 파일 소스 코드 (핵심 요약)

### 7.1 데이터 병합 예시 (`src/lib/cache-loader.ts`)
```typescript
export function mergeCacheAndApiData(cache, apiData) {
  // 캐시 데이터를 ID(관리번호+공고번호) 기준으로 Set 생성
  // API 데이터 중 캐시에 없는 것만 필터링하여 추가
  // 최신성을 위해 API 데이터를 우선할 수도 있으나, 본 프로젝트는 '안정성' 위주로 캐시 유지
  return [...cacheList, ...newApiItems];
}
```

### 7.2 상세 데이터 조인 예시 (`src/lib/detail-data.ts`)
```typescript
// 모델, 경쟁률, 특공 배열을 받아 하나의 Row로 합침
export function buildApplicationRows(models, competition, special) {
  // 1. 경쟁률 Map 생성 (Key: ModelNo)
  // 2. 특공 Map 생성 (Key: ModelNo)
  // 3. Models 순회하며 Map에서 데이터 조회 및 Row 생성
  // 4. 합계(Totals) 행 계산
}
```

---

## 9. 실행 및 배포

### 8.1 개발 실행
```bash
npm run dev
```

### 8.2 캐시 재생성 (데이터 업데이트 시)
```bash
npm run generate-cache
# 실행 후 public/data/cheongyak-archive.json 업데이트 확인
```

### 8.3 배포
- **Vercel** 배포 권장
- 배포 전 `npm run build` 성공 확인 필수
- 환경 변수(`REB_API_KEY`) 설정 필수

---

이 가이드를 따르면 원본 프로젝트와 100% 동일한 기능을 가진 청약경쟁률 대시보드를 구축할 수 있습니다.
