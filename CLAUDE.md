# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 14 + React 18 dashboard for Korean apartment subscription (청약) competition rate data. Supports **two data modes**: a legacy JSON cache mode and a newer SQLite mode using a unified database shared with sibling projects.

- **Package name**: `cheongyak-apt-search`
- **Framework**: Next.js 14 App Router, React 18, TypeScript
- **Key libraries**: Leaflet (maps), Chart.js (charts), better-sqlite3 (DB), xlsx (Excel export)
- **No TailwindCSS** — uses CSS Modules + inline styles

## Commands

```bash
npm run dev              # Quick mode: 신규 공고 병합만 + dev server (3초 이내 시작)
npm run dev:full         # Full mode: 상세 데이터 수집 + 좌표 지오코딩 포함
npm run dev:sqlite       # SQLite mode: NEXT_PUBLIC_USE_SQLITE=true + dev server
npm run build            # Production build
npm run lint             # ESLint (eslint-config-next)
npm run generate-cache   # Full JSON cache rebuild from 청약홈 API (requires REB_API_KEY)
npx playwright test      # E2E tests (Chromium only, auto-starts dev server)
```

**캐시 스크립트 플래그:**
- `--quick` — 신규 공고 병합만, 상세/좌표 작업 생략 (`npm run dev` 기본값)
- `--audit-coords` — 전수 좌표 감사 + 블록형 주소 보정 (수동 실행용)
- `--fix-coords` — 잘못된 좌표 수정
- `--backfill` — 2020년부터 전체 백필

### Unified DB Scripts (delegate to `../shared/scripts/`)

```bash
npm run init-db          # Create unified DB + migrate from existing sources
npm run update-db        # Fetch API data into unified DB (6-hour throttle)
npm run update-db:force  # Skip throttle
npm run update-db:test   # Fetch 1 page only (testing)
npm run migrate-coords   # One-time: move coordinates from archive JSON into DB
```

### C Binary (legacy CLI tool, excluded from git)

```bash
make                     # GCC build → build/cheongyak (requires libcurl + cJSON)
```

## Environment Variables

Required in `.env` or `.env.local`:
- `REB_API_KEY` — Government Open Data (data.go.kr) API key

Feature flag:
- `NEXT_PUBLIC_USE_SQLITE=true` — Switches data layer from JSON cache to SQLite

### Geocoding (API key-free)

Geocoding uses **Nominatim (OpenStreetMap)** and **DuckDuckGo web search** — no API keys needed.
- `scripts/auto-update-cache.js` uses a 5-stage pipeline: Nominatim → DuckDuckGo coordinates → DuckDuckGo→Nominatim → fallback
- Web search results are cached in `public/data/geocode-web-cache.json` (gitignored)
- Rate limits: Nominatim 1 req/sec, DuckDuckGo 2 workers with exponential backoff
- Legacy `scripts/kakao-geocode-all.js` is deprecated

## Architecture

### Dual Data Mode

The app runs in one of two modes, controlled by `NEXT_PUBLIC_USE_SQLITE`:

```
┌─ JSON Mode (default) ─────────────────────────────────────────┐
│ 청약홈 API → scripts/auto-update-cache.js → public/data/*.json │
│                                                    ↓           │
│              /api/cheongyak (proxy) ← useAptData → React UI   │
└────────────────────────────────────────────────────────────────┘

┌─ SQLite Mode ─────────────────────────────────────────────────┐
│ 청약홈 API → shared/scripts/update-unified-db.js              │
│                    → shared/cheongyak-unified.db              │
│                              ↓                                │
│              /api/apt/* endpoints (server queries) → React UI │
└────────────────────────────────────────────────────────────────┘
```

The abstraction layer is `src/lib/data-source.ts` — imports from `queries.ts` (SQLite) or `cache-loader.ts` (JSON) based on the flag.

### Shared Database (`../shared/`)

A sibling directory houses the unified SQLite DB and management scripts shared between this project and `cheongyak-spsply`:

- `shared/cheongyak-unified.db` (~25MB) — 14 tables covering APT, 무순위, 오피스텔, 임의공급
- `shared/scripts/init-unified-db.js` — Creates DB schema, optional `--migrate` from existing sources
- `shared/scripts/update-unified-db.js` — API fetch + Kakao geocoding into DB
- `shared/scripts/migrate-coordinates.js` — One-time coordinate migration from JSON

**DB tables (APT subset):** `apt_detail` (main info + coordinates), `apt_model` (house types), `apt_cmpet` (competition by rank), `apt_spsply` (special supply counts), `apt_bonus_point`

**Primary key:** `(HOUSE_MANAGE_NO, PBLANC_NO)` on all tables.

### SQLite Connection (`src/lib/db.ts`)

Singleton read-only connection with WAL mode. DB path: `public/data/cheongyak.db`.

### SQLite API Routes (`src/app/api/apt/`)

| Route | Purpose |
|-------|---------|
| `/api/apt/list` | Paginated list with server-side filtering (sido, sigungu, house name, sale type) |
| `/api/apt/detail/[id]` | Single project detail (id = `{HOUSE_MANAGE_NO}_{PBLANC_NO}`) |
| `/api/apt/map-regions` | Three-tier geographic aggregation: sido → sigungu → individual (by zoom level) |
| `/api/apt/stats` | Dashboard summary: totals, rates by rank, monthly/type breakdowns |

All routes use parameterized queries (no SQL injection risk).

### JSON Cache Strategy (legacy mode)

1. **Archive Cache** (`public/data/cheongyak-archive.json`, ~1.2MB) — 5 years of APT notices with pre-computed `calculatedStats`
2. **Detail Cache** (`public/data/cheongyak-details-cache.json`, ~10.5MB) — Batch-cached competition rows per project
3. **Per-project Detail** (`public/data/details/{HOUSE_MANAGE_NO}_{PBLANC_NO}.json`) — Individual JSON files, on demand

Cache loading uses **singleton promises** in `src/lib/cache-loader.ts` to prevent parallel fetches.

### Composite Key

`${HOUSE_MANAGE_NO}_${PBLANC_NO}` is the universal key for all data lookups across both modes.

### Data Priority (JSON mode)

`extraData[key]` (live API/detail cache) > `archiveCache.calculatedStats[key]` (pre-computed) > `null`. Logic in `useCompetitionStats` hook and `getCompetitionStagesSync` in `src/hooks/utils.ts`.

### API Proxy (`/api/cheongyak`, JSON mode)

Supports `dataset` query param (comma-separated) mapping to three 청약홈 OpenAPI services:
- `ApplyhomeInfoCmpetRtSvc` — Competition rates
- `ApplyhomeInfoDetailSvc` — Notice details
- `ApplyhomeInfoOfferSvc` — Offer/supply data

All datasets fetched via `Promise.allSettled` — partial failures return per-dataset errors.

### Competition Rate Calculation (`src/lib/detail-data.ts`)

`buildApplicationRows()` processes `noticeModel` + `noticeCompetition` + `noticeSpecial` arrays into structured `ApplicationRow[]` per house type. Handles an API quirk where some projects return global supply totals in every row (corrected by `checkAndFixSharedTarget`).

### Hook Architecture (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useAptData` | Master data/search state (not in barrel export) |
| `useCompetitionStats` | Per-item competition rate with source tracking |
| `useRateSelector` | Select stage (special/rank1/rank2/total) |
| `useWeightedAverage` | Weighted average across items |
| `useDashboardStats` | Monthly + type-level stats for Chart.js |
| `useCompetitionMapStats` | Geographic aggregation for Leaflet map |

Types defined in `src/hooks/types.ts`: `RateType`, `CompetitionStages`, `StageData`, `SearchParams`.

## Key Patterns

- **All interactive components use `"use client"`**. Pages wrap content in `Suspense` for `useSearchParams`.
- **Leaflet requires `next/dynamic` with `{ ssr: false }`** — it needs `window`.
- **Client-side filtering** (JSON mode): house name text search, sigungu, 임대 classification applied after API response.
- **Server-side filtering** (SQLite mode): dynamic WHERE clauses built as arrays, combined with AND.
- **Parallel page fetching**: `handleSearch()` in `useAptData` fetches page 1, calculates total pages, then `Promise.allSettled` all remaining pages concurrently.
- **Async deduplication**: `fetchingPool` ref (`Set<string>`) prevents duplicate API calls.
- **Mobile responsive**: Dual rendering — table hidden on mobile via CSS, card list shown instead.
- **Korean throughout**: All UI text, comments, console logs in Korean.
- **Map zoom tiers**: <9 시도 choropleth → 9-10 시군구 choropleth → ≥11 individual markers.

## Testing

Playwright E2E tests in `tests/`:
- `dashboard.spec.ts` — Page load, UI elements, data loading, responsive viewports, performance, keyboard nav, map markers
- `sigungu.spec.ts` — Sigungu dropdown filter behavior

Config: single Chromium project, sequential execution (`workers: 1`), `webServer` auto-starts `npm run dev`.

## Scripts (`scripts/`)

Local data pipeline scripts (Node.js, use `dotenv` for env vars):
- `auto-update-cache.js` — Run at dev startup, incrementally updates JSON cache + coordinate audit
- `generate-cache.js` — Full archive rebuild with geocoding
- `build-detail-cache.js` / `build-detail-cache-v2.js` — Batch detail data fetch
- `generate-all-details.js` — Per-project JSON file generation
- `add-coordinates.js` — Batch geocoding via Kakao Maps API

## Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).
