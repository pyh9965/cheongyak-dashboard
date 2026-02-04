# Autopilot Spec: Pre-Cached Apartment Geocoding

## Requirements Summary

### Functional Requirements
1. Pre-geocode apartment addresses during cache generation using Kakao REST API
2. Store coordinates in `cheongyak-archive.json` per item (`coordinates: [lat, lng]`)
3. Client uses cached coordinates only - no runtime Kakao API calls
4. Fallback to district-level coordinates from `geo-coordinates.ts`

### Non-Functional Requirements
- 85%+ geocoding success rate
- Map load under 2 seconds (no geocoding delay)
- Zero client-side API calls to Kakao

### Key Decisions
1. Embed coordinates directly in `lists` items (not separate map)
2. Server-side `KAKAO_API_KEY` (not NEXT_PUBLIC)
3. Remove client-side geocoding entirely

## Technical Specification

### Data Structure

```json
{
  "lists": [
    {
      "HOUSE_NM": "...",
      "HSSPLY_ADRES": "...",
      "coordinates": [lat, lng]
    }
  ],
  "metadata": {
    "geocodedCount": 487
  }
}
```

### Implementation Steps

1. **Type Definitions** (`cache-loader.ts`)
   - Add `coordinates?: Coordinates` to `AptInfo`
   - Add `geocodedCount?: number` to metadata

2. **Generate Cache Script** (`scripts/generate-cache.js`)
   - Add `geocodeAddress()` function using Kakao REST API
   - Add `geocodeAllItems()` batch function with rate limiting
   - Integrate into main() flow

3. **CompetitionRateMap Simplification**
   - Remove `individualMarkers` state
   - Remove `checkAndGeocode()` function
   - Remove Kakao SDK loading for geocoding
   - Use `item.coordinates` directly with district fallback

4. **Testing**
   - Verify map displays markers from cached coordinates
   - Verify fallback works for items without coordinates

### Files to Modify
- `src/lib/cache-loader.ts` - Type definitions
- `scripts/generate-cache.js` - Add geocoding
- `src/components/CompetitionRateMap.tsx` - Simplify
- `public/data/cheongyak-archive.json` - Will have coordinates added

## Acceptance Criteria
- [ ] Cache generation adds coordinates to 85%+ items
- [ ] Map displays markers without Kakao geocoding API calls
- [ ] Fallback to district coordinates works
- [ ] Build passes, no TypeScript errors
