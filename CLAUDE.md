# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 14 + React 18 dashboard for Korean apartment subscription (청약) competition rate data. Queries the Government Open Data (청약홈) API, caches results in static JSON files, and displays competition rate analytics in list, map, and chart views.

- **Package name**: `cheongyak-apt-search`
- **Framework**: Next.js 14 App Router, React 18, TypeScript
- **Key libraries**: Leaflet (maps), Chart.js (charts), xlsx (Excel export)
- **No TailwindCSS** — uses CSS Modules + inline styles

## Commands

```bash
npm run dev              # Auto-updates JSON cache + starts dev server on port 3000
npm run build            # Production build
npm run start            # Production server on port 3000
npm run lint             # ESLint (eslint-config-next)
npm run generate-cache   # Full cache rebuild from 청약홈 API (requires REB_API_KEY)
npx playwright test      # E2E tests (Chromium only, auto-starts dev server)
```

### C Binary (legacy CLI tool, excluded from git)

```bash
make                     # GCC build → build/cheongyak (requires libcurl + cJSON)
```

## Environment Variables

Required in `.env` or `.env.local`:
- `REB_API_KEY` — Government Open Data (data.go.kr) API key
- `KAKAO_API_KEY` — Kakao REST API key (server-side geocoding in scripts)
- `NEXT_PUBLIC_KAKAO_API_KEY` — Kakao Maps client-side key

## Architecture

### Data Flow

```
청약홈 API ──→ scripts/auto-update-cache.js ──→ public/data/*.json (static cache)
                                                         ↓
                   /api/cheongyak (proxy) ←── useAptData hook ──→ React UI
                                                         ↓
                   /api/export-excel ←──────── ExportExcelButton
```

### Three-Tier Cache Strategy

1. **Archive Cache** (`public/data/cheongyak-archive.json`, ~1.2MB) — 5 years of APT notices with pre-computed `calculatedStats`
2. **Detail Cache** (`public/data/cheongyak-details-cache.json`, ~10.5MB) — Batch-cached competition rows per project
3. **Per-project Detail** (`public/data/details/{HOUSE_MANAGE_NO}_{PBLANC_NO}.json`) — Individual JSON files, fetched on demand

Cache loading uses **singleton promises** in `src/lib/cache-loader.ts` to prevent parallel fetches. The `mergeCacheAndApiData()` function merges cache and live API data — cache for items within its date range, API for newer items.

### Composite Key

`${HOUSE_MANAGE_NO}_${PBLANC_NO}` is the universal key for all data lookups across hooks, cache, and detail files.

### Data Priority

For competition rate lookups: `extraData[key]` (live API/detail cache) > `archiveCache.calculatedStats[key]` (pre-computed) > `null`. This logic exists in both the `useCompetitionStats` hook and the `getCompetitionStagesSync` pure function in `src/hooks/utils.ts`.

### API Proxy (`/api/cheongyak`)

Supports `dataset` query param (comma-separated) mapping to three 청약홈 OpenAPI services:
- `ApplyhomeInfoCmpetRtSvc` — Competition rates
- `ApplyhomeInfoDetailSvc` — Notice details
- `ApplyhomeInfoOfferSvc` — Offer/supply data

All datasets fetched via `Promise.allSettled` — partial failures return per-dataset errors, not a 502.

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
- **Leaflet requires `next/dynamic` with `{ ssr: false }`** — it needs `window`. Both `CompetitionRateMap.tsx` and `LeafletMapInner.tsx` follow this pattern.
- **Client-side filtering**: Several filters (house name text search, sigungu, 임대 classification) are applied after API response since the API doesn't support all filter combinations.
- **Parallel page fetching**: `handleSearch()` in `useAptData` fetches page 1, calculates total pages, then `Promise.allSettled` all remaining pages concurrently.
- **Async deduplication**: `fetchingPool` ref (`Set<string>`) prevents duplicate API calls for the same item.
- **Mobile responsive**: Dual rendering — table hidden on mobile via CSS, card list shown instead (not responsive table).
- **Korean throughout**: All UI text, comments, console logs in Korean.

## Testing

Playwright E2E tests in `tests/`:
- `dashboard.spec.ts` — Page load, UI elements, data loading, responsive viewports, performance, keyboard nav, map markers
- `sigungu.spec.ts` — Sigungu dropdown filter behavior

Config: single Chromium project, sequential execution (`workers: 1`), `webServer` auto-starts `npm run dev`.

## Scripts (`scripts/`)

Data pipeline scripts (Node.js, use `dotenv` for env vars):
- `auto-update-cache.js` — Run at dev startup, incrementally updates cache
- `generate-cache.js` — Full archive rebuild with geocoding
- `build-detail-cache.js` / `build-detail-cache-v2.js` — Batch detail data fetch
- `generate-all-details.js` — Per-project JSON file generation
- `add-coordinates.js` — Batch geocoding via Kakao Maps API

## Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).
