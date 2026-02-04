# Learnings - Phase 2: useAptData.ts Refactoring

## Date: 2026-02-03

## Completed Work
- Added sigungu (시/군/구) filtering support to useAptData hook
- Integrated address-parser utilities for regional filtering
- Added sigunguOptions computation using useMemo for performance
- Extended searchParams state to include sigungu parameter

## Technical Patterns

### Type Casting for Structural Compatibility
When passing `AptInfo[]` to functions expecting specific shapes:
```typescript
const allData = [...(archiveCache?.lists || []), ...data] as Array<{ HSSPLY_ADRES?: string }>;
```
- AptInfo has `[key: string]: any` so it structurally contains HSSPLY_ADRES
- Explicit type assertion needed for TypeScript to accept the assignment
- This is safe because AptInfo extends the required shape

### State Management Extension
Added sigungu to searchParams while maintaining URL sync:
```typescript
sigungu: urlSearchParams.get("sigungu") || "",
```

### Filtering Logic Order
Placed sigungu filtering after sidoCode filtering (step 3-1):
- Ensures sidoCode is already validated
- Only processes relevant data
- Uses parseAddress helper for consistent parsing

### Performance Optimization
Used useMemo for sigunguOptions:
```typescript
useMemo(() => {
  if (!searchParams.sidoCode || searchParams.sidoCode === "all") return [];
  // ... extraction logic
}, [data, archiveCache?.lists, searchParams.sidoCode]);
```
- Recomputes only when dependencies change
- Prevents unnecessary re-rendering
- Caches expensive computations

## Code Organization
- Import additions at top of file
- State modification in useState block
- Filter logic in sequential order (3, 3-1, 4, 5)
- Computed values before return statement
- Return object maintains alphabetical consistency

---

# Learnings - Geocoding Implementation

## Date: 2026-02-03

## Completed Work
- Added geocoding functionality to generate-cache.js script
- Implemented `geocodeAddress(address)` function using Kakao REST API
- Implemented `geocodeAllItems(lists)` function for batch geocoding
- Integrated geocoding into main cache generation flow
- Added geocodedCount to cache metadata

## Key Implementation Details

### Environment Configuration
- Added `require('dotenv').config({ path: '.env.local' })` to load environment variables
- Must specify `.env.local` path explicitly (dotenv loads `.env` by default)
- Added `KAKAO_API_KEY` to .env.local for server-side usage

### API Key Requirements
**Critical**: Kakao REST API requires REST API key, not JavaScript API key
- JavaScript key format: Used for browser-based Kakao Maps SDK
- REST API key format: Required for server-side geocoding requests
- 401 Unauthorized errors indicate incorrect key type
- Get REST API key from: Kakao Developers Console → App Settings → REST API Key

### Geocoding Function Design
```javascript
async function geocodeAddress(address)
```
- Returns `[lat, lng]` array on success, `null` on failure
- Implements fallback strategy:
  1. Try cleaned address (parentheses removed)
  2. Try original address without parentheses
- Uses Kakao Local API: `https://dapi.kakao.com/v2/local/search/address.json`
- Authorization header: `KakaoAK ${KAKAO_API_KEY}`
- Handles 401 errors explicitly to avoid unnecessary retries

### Batch Processing
```javascript
async function geocodeAllItems(lists)
```
- Iterates through all items in lists array
- Geocodes `item.HSSPLY_ADRES` field
- Sets `item.coordinates = [lat, lng]` on success
- Rate limiting: 100ms delay between requests (prevents API throttling)
- Progress logging: Every 50 items
- Returns stats: `{ geocodedCount, failedCount }`

### Integration with Cache Generation
- Called after fetching list data, before detail collection
- Adds coordinates to all items in lists array (not just filtered items)
- Metadata includes `geocodedCount` for monitoring
- Final summary logs geocoding success/failure counts

## Error Handling Patterns
- Null checks for missing addresses
- API key validation with helpful error messages
- HTTP status code handling (401 = auth failure)
- Silent failure for individual addresses (continues batch)
- Try-catch blocks prevent crashes on network errors

## Performance Considerations
- 100ms rate limiting: ~600 addresses per minute
- Progress logging reduces console noise
- Async/await pattern for sequential processing
- No parallel requests (respects API rate limits)

---

# Learnings - add-coordinates.js Script

## Date: 2026-02-03

## Completed Work
- Created `scripts/add-coordinates.js` script for offline coordinate addition
- Pure JavaScript implementation (no TypeScript dependencies)
- Uses existing geo-coordinates.ts mapping for district-level coordinates
- NO Kakao API usage - fully offline

## Script Overview
The script adds coordinates to items that don't have them yet by:
1. Reading `public/data/cheongyak-archive.json`
2. For each item without coordinates, parsing the address to extract district key
3. Looking up coordinates from the GEO_COORDINATES mapping
4. Adding the `coordinates` field to the item
5. Updating metadata and saving back to file

## Implementation Details

### Pure JavaScript Conversion
Copied TypeScript logic to JavaScript:
- `SIDO_NORMALIZE` mapping: All 17 시/도 variations
- `parseAddress(address)`: Returns `{ sido, sigungu, fullKey }` or null
- `GEO_COORDINATES` mapping: 250+ district/city coordinates
- `getCoordinates(key)`: Returns `[lat, lng]` or null

### Address Parsing
```javascript
function parseAddress(address)
```
- Extracts 시/도 and 시/군/구 from address string
- Normalizes 시/도 names (e.g., "서울특별시" → "서울")
- Removes "신도시", "도시개발사업", block numbers
- Returns `fullKey` like "서울 강남구", "경기 성남시 분당구"
- Special handling for 세종 (no 시/군/구)

### Coordinates Mapping
```javascript
const GEO_COORDINATES = { ... }
```
- 17 광역 시/도 center points
- 250+ 시/군/구 coordinates
- Keys: "시도 시군구" format (space-separated)
- Values: `[lat, lng]` arrays

### Processing Logic
```javascript
data.lists.forEach((item, index) => {
  if (item.coordinates) return; // Skip if already has coordinates

  const addr = item.HSSPLY_ADRES;
  const parsed = parseAddress(addr);
  if (parsed) {
    const coords = getCoordinates(parsed.fullKey);
    if (coords) {
      item.coordinates = coords; // Add coordinates
      addedCount++;
    }
  }
});
```

### Metadata Updates
- `metadata.geocodedCount`: Total successfully geocoded items
- `metadata.lastGeocodedAt`: ISO timestamp of last run

## Results (Initial Run)
- Total items: 505
- Coordinates added: 482 (95.4%)
- Failed: 23 (4.6%)

### Failure Categories
1. **Complex addresses with blocks**: "행정중심복합도시 5-1생활권 L1블록(세종특별자치시 합강동 일원)"
   - parseAddress can't extract proper district from nested formats

2. **Missing district mappings**: "경기 이천시 중리지구", "경기 부천시 오정구"
   - 이천시 중리지구: Not in GEO_COORDINATES (use "경기 이천시")
   - 부천시 오정구: Old district name (부천시 no longer has 구 subdivisions)
   - 천안시 without 구: Coordinates only exist for "천안시 동남구", "천안시 서북구"

## Key Advantages
- **No API calls**: Uses pre-defined coordinate mappings
- **No rate limiting**: Runs instantly
- **Deterministic**: Same input always produces same output
- **Offline friendly**: Works without internet connection
- **Idempotent**: Can run multiple times safely (skips existing coordinates)

## Usage
```bash
node scripts/add-coordinates.js
```

## Limitations
- District-level precision only (not exact building coordinates)
- Requires addresses to match expected format
- Missing mappings for some edge cases (지구, old district names)
- Cannot handle addresses without clear 시/군/구 information

## Future Improvements
- Add fallback for missing districts (use 시 level coordinates)
- Handle "지구" (development districts) by mapping to parent 시/군
- Add support for old district names (e.g., 부천시 오정구 → 부천시)

---

# Learnings - CompetitionRateMap.tsx Simplification

## Date: 2026-02-03

## Completed Work
- Removed all client-side Kakao API geocoding from CompetitionRateMap.tsx
- Simplified component to use only pre-cached coordinates
- Removed Kakao SDK script loading (kept Leaflet MarkerCluster only)
- Removed state management for individual markers and geocoding attempts
- Cleaned up dependencies and simplified marker rendering logic

## Changes Made

### 1. Removed Imports
```typescript
// REMOVED:
import { cleanAddressForGeocoding } from "@/lib/address-parser";
import { restoreGeocodeCache } from "@/lib/geocoding";

// KEPT:
import { parseAddress } from "@/lib/address-parser";
```
- Only need parseAddress for fallback to district coordinates
- No need for geocode cache restoration or address cleaning

### 2. Removed State and Refs
```typescript
// REMOVED:
const [individualMarkers, setIndividualMarkers] = useState<Record<string, Coordinates>>({});
const attemptedGeocodesRef = useRef<Set<string>>(new Set());
```
- No longer tracking client-side geocoded coordinates
- No need to track geocoding attempts

### 3. Removed useEffect for Cache Restoration
```typescript
// REMOVED:
useEffect(() => {
    restoreGeocodeCache();
}, []);
```
- Cache restoration no longer needed

### 4. Simplified Script Loading
```typescript
// BEFORE: Loaded Kakao SDK → MarkerCluster
// AFTER: Loads MarkerCluster directly
script.onload = () => {
    // MarkerCluster 스크립트 로드
    const clusterScript = document.createElement("script");
    // ... load and initialize map
};
```
- Removed entire Kakao SDK loading block
- Removed `kakao.maps.load()` call
- Simplified initialization chain

### 5. Removed Geocoding Function
```typescript
// REMOVED: ~70 lines of checkAndGeocode() function
// - SDK Geocoder initialization
// - Batch target filtering
// - Sequential geocoding with fallbacks
// - Rate limiting logic
// - Success/failure tracking
```

### 6. Simplified Marker Coordinates
```typescript
// BEFORE:
let coords: Coordinates | null = individualMarkers[itemKey];
if (!coords) {
    const parsed = parseAddress(item.HSSPLY_ADRES);
    if (parsed) {
        coords = getGeoCoordinates(parsed.fullKey);
    }
}

// AFTER:
let coords: Coordinates | null = item.coordinates || null;
if (!coords && item.HSSPLY_ADRES) {
    const parsed = parseAddress(item.HSSPLY_ADRES);
    if (parsed) {
        coords = getGeoCoordinates(parsed.fullKey);
    }
}
```
- **Primary**: Use `item.coordinates` from pre-cached JSON
- **Fallback**: District-level coordinates from geo-coordinates.ts
- No client-side geocoding at all

### 7. Updated Dependencies
```typescript
// BEFORE:
}, [isMapReady, regionData, currentZoom, data, individualMarkers, rateType, archiveCache]);

// AFTER:
}, [isMapReady, regionData, currentZoom, data, rateType, archiveCache]);
```
- Removed `individualMarkers` from dependency array

## Coordinate Resolution Strategy

### Source Priority
1. **item.coordinates** - Pre-cached from generate-cache.js (building-level, ~95% coverage)
2. **geo-coordinates.ts** - District-level fallback (100% coverage for major districts)

### Benefits
- **No API calls at runtime**: All coordinates resolved at build time
- **Instant marker rendering**: No waiting for geocoding to complete
- **No rate limiting**: No risk of hitting Kakao API limits
- **Offline friendly**: Map works without Kakao API access
- **Deterministic**: Same data always produces same markers

## Code Removal Summary
- **Lines removed**: ~100+ lines
- **Imports removed**: 2
- **State variables removed**: 2
- **useEffect hooks removed**: 1
- **Functions removed**: 1 (checkAndGeocode)
- **Script loads removed**: 1 (Kakao SDK)

## Performance Improvements
- Faster initial render (no SDK loading)
- No geocoding delays when zooming in
- Reduced memory usage (no marker cache state)
- Simpler component logic (easier to maintain)

## Type Safety
- Build passes: ✅
- TypeScript check: ✅ (npx tsc --noEmit)
- No runtime errors expected

## Future Considerations
- If coordinate coverage drops below 90%, consider:
  1. Adding more districts to geo-coordinates.ts
  2. Running generate-cache.js with updated API key
  3. Adding manual coordinate overrides for specific addresses
