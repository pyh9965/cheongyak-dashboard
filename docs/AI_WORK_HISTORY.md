# 청약경쟁률 대시보드 - AI 작업 이력

**최종 업데이트:** 2026-01-22 KST

---

## 2026-01-22 작업 이력

### 1. 경쟁률 데이터 표시 문제 해결 ✅
**문제:** 테이블, 지도, 통계 대시보드에서 경쟁률이 0.00:1로 표시됨

**원인:** `archiveCache`의 rate 값이 모두 null이었으나, archiveCache를 우선 사용하여 extraData로 fallback하지 않음

**해결:**
- **파일:**
  - `src/components/CompetitionTable.tsx` (라인 67-85)
  - `src/components/CompetitionRateMap.tsx` (라인 192-219, 498-517, 677-686)

- **내용:** `extraData` (상세 캐시)를 우선 사용, `archiveCache`는 fallback

```typescript
// extraData 우선 사용 (상세 경쟁률 데이터)
const extraStats = extraData[key]?.totals?.stages;
if (extraStats && extraStats.total?.rate !== null && extraStats.total?.rate !== undefined) {
    return extraStats;
}

// fallback: archiveCache
const archiveStats = archiveCache?.calculatedStats?.[key]?.totals?.stages;
if (archiveStats && archiveStats.total?.rate !== null && archiveStats.total?.rate !== undefined) {
    return archiveStats;
}
```

### 2. 최신 청약 데이터 자동 업데이트 구현 ✅
**문제:** 드파인 연희 1순위 청약 결과가 나왔지만 프로그램에 반영되지 않음

**원인:** `fetchSingleExtraData`가 `extraData[key]`가 있으면 API를 호출하지 않음. detailCache 병합 시 경쟁률이 0인 항목도 extraData에 포함되어 API 호출 차단

**해결:**
- **파일:** `src/app/apt/page.tsx`
  - 라인 205-211: `extraDataRef` 추가
  - 라인 241-286: `fetchSingleExtraData` 로직 개선
  - 라인 293-342: 청약 시작일 기준 자동 업데이트

- **내용:**
  1. 청약 접수 시작일이 지난 모든 항목에 대해 API 호출 (기존: 당첨자 발표일 지난 항목만)
  2. 캐시에 유효한 경쟁률(rate > 0)이 없으면 API 호출
  3. `extraDataRef` 사용해서 무한 루프 방지

```typescript
// extraDataRef를 사용해서 현재 캐시 확인
const cached = extraDataRef.current[key];
const cachedRate = cached?.totals?.stages?.total?.rate;
// 캐시에 유효한 경쟁률이 있으면 API 호출 불필요
if (cachedRate !== null && cachedRate !== undefined && cachedRate > 0) {
  return;
}
```

### 3. 검색 필터 오류 수정 ✅
**문제:** "민영" 주택 구분 선택 시 결과가 0건으로 표시됨

**원인:** 드롭다운에서 "민영"이 `value="02"`로 설정되어 있었으나, 실제 API 데이터는 `HOUSE_DTL_SECD="01"`

**해결:**
- **파일:** `src/app/apt/page.tsx` (라인 1093-1096)
- **내용:** 드롭다운 값 수정
  - 민영: `02` → `01`
  - 국민: `01` → `03`

### 4. 지도 경쟁률 불일치 문제 해결 ✅
**문제:** StatsDashboard 1순위 경쟁률(147.91:1)과 지도 표시 경쟁률(192.32:1)이 다름

**원인:** 경쟁률 평균 계산 방식 차이
- **StatsDashboard:** 가중 평균 (총 청약 건수 / 총 공급량)
- **지도 (수정 전):** 산술 평균 (각 단지 경쟁률의 평균)

**해결:**
- **파일:** `src/components/CompetitionRateMap.tsx` (라인 188-219)
- **내용:** 지도도 가중 평균 방식으로 변경

```typescript
// 수정 전: 산술 평균
totalRate += rate;
rateCount += 1;
region.avgRate = rateCount > 0 ? totalRate / rateCount : null;

// 수정 후: 가중 평균 (StatsDashboard와 동일)
totalSupply += target;
totalRequest += request || 0;
region.avgRate = totalSupply > 0 ? totalRequest / totalSupply : null;
```

**예시:**
- 단지 A: 공급 10세대, 청약 1,000건 → 경쟁률 100:1
- 단지 B: 공급 1,000세대, 청약 2,000건 → 경쟁률 2:1

| 방식 | 계산 | 결과 |
|------|------|------|
| 산술 평균 (잘못됨) | (100 + 2) / 2 | 51:1 |
| 가중 평균 (올바름) | 3,000 / 1,010 | 2.97:1 |

### 5. 디버그 로그 정리 ✅
**파일:**
- `src/components/CompetitionTable.tsx` (라인 74-84 제거)
- `src/app/apt/page.tsx` (라인 244-247, 393-408 제거)

**내용:** 콘솔 디버그 로그 제거

### 6. 프로젝트 문서화 ✅
**파일:** `docs/프로젝트_분석_및_배포_가이드.md`

**내용:**
- 프로젝트 구조 상세 분석 (~4,000줄)
- 기술 스택 및 아키텍처
- 웹 배포 옵션 비교 (Vercel, Cloudflare, Railway 등)
- Vercel 배포 가이드 (추천)
- 비용 분석 및 유지보수 고려사항

---

## 완료된 작업 요약

### 2026-01-22 작업
1. **경쟁률 데이터 표시 문제 해결** ✅
   - CompetitionTable, CompetitionRateMap에서 extraData 우선 사용

2. **최신 청약 데이터 자동 업데이트** ✅
   - 청약 시작일 기준 API 호출, extraDataRef로 무한 루프 방지

3. **검색 필터 오류 수정** ✅
   - 민영/국민 주택 구분 코드 수정 (02→01, 01→03)

4. **지도 경쟁률 불일치 해결** ✅
   - 산술 평균 → 가중 평균으로 변경

5. **프로젝트 문서화** ✅
   - 프로젝트 분석 및 배포 가이드 작성 (Vercel 추천)

### 2026-01-11 이전 작업
1. **통계 0 표시 문제 해결** ✅
   - `src/components/StatsDashboard.tsx`: `extraData` 우선 사용

2. **월별 차트 4가지 경쟁률 표시** ✅
   - `src/components/StatsDashboard.tsx`: 특별공급, 1순위, 2순위, 전체

3. **세종 ↔ 충북 혼입 해결** ✅
   - `src/app/apt/page.tsx`: `36 → 338` 특수 매핑

4. **제주 ↔ 광주 혼입 해결** ✅
   - `src/app/apt/page.tsx`: `50 → 690` 특수 매핑

---

## 핵심 코드 위치

### 경쟁률 데이터 우선순위 (extraData 우선)
`src/components/CompetitionTable.tsx` 라인 67-85:
```typescript
const getStats = (item: AptInfo) => {
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

    // extraData 우선 사용 (상세 경쟁률 데이터)
    const extraStats = extraData[key]?.totals?.stages;
    if (extraStats && extraStats.total?.rate !== null && extraStats.total?.rate !== undefined) {
        return extraStats;
    }

    // fallback: archiveCache
    const archiveStats = archiveCache?.calculatedStats?.[key]?.totals?.stages;
    if (archiveStats && archiveStats.total?.rate !== null && archiveStats.total?.rate !== undefined) {
        return archiveStats;
    }

    return extraStats || archiveStats || null;
};
```

### 청약 데이터 자동 업데이트 (청약 시작일 기준)
`src/app/apt/page.tsx` 라인 293-342:
```typescript
const itemsToFetch = data.filter(item => {
    if (!item.HOUSE_MANAGE_NO || !item.PBLANC_NO) return false;

    // 청약 접수 시작일이 지난 항목들 (청약이 시작된 항목)
    const startDate = parseCheongyakDate(item.RCEPT_BGNDE || "");
    if (!startDate || today < startDate) return false; // 아직 시작 안 됨

    // 캐시에 유효한 경쟁률이 없는 항목만
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    const cachedRate = extraDataRef.current[key]?.totals?.stages?.total?.rate;
    if (cachedRate !== null && cachedRate !== undefined && cachedRate > 0) {
        return false; // 이미 유효한 경쟁률이 있음
    }

    return true;
});
```

### 지도 경쟁률 가중 평균 계산
`src/components/CompetitionRateMap.tsx` 라인 188-219:
```typescript
regionArray.forEach((region) => {
    let totalSupply = 0;
    let totalRequest = 0;

    region.items.forEach((item) => {
        const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        // extraData 우선 사용 (상세 경쟁률 데이터)
        const extraStats = extraData[itemKey]?.totals;
        if (extraStats?.stages) {
            const stageData = extraStats.stages[rateType];
            const target = stageData?.target || 0;
            const request = stageData?.request || 0;

            if (target > 0) {
                totalSupply += target;
                totalRequest += request || 0;
                return;
            }
        }

        // fallback: archiveCache...
    });

    // 가중 평균 경쟁률 계산 (StatsDashboard와 동일한 방식)
    region.avgRate = totalSupply > 0 ? totalRequest / totalSupply : null;
});
```

### 지역 필터링 로직
`src/app/apt/page.tsx` 라인 549-572:
```typescript
mergedData = mergedData.filter(item => {
  if (item.SUBSCRPT_AREA_CODE === targetCode) return true;
  
  // 세종 특수 처리: 36 -> 338
  if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true;
  
  // 제주 특수 처리: 50 -> 690
  if (targetCode === "50" && item.SUBSCRPT_AREA_CODE === "690") return true;
  
  // 일반 지역: +0 (세종, 제주 제외)
  if (targetCode !== "36" && targetCode !== "50" && 
      item.SUBSCRPT_AREA_CODE === targetCode + "0") return true;

  // 이름 정확 일치
  if (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName) return true;

  return false;
});
```

### 통계 데이터 소스
`src/components/StatsDashboard.tsx` 라인 76-82:
```typescript
const extraStats = extraData[key]?.totals;
const cacheStats = archiveCache?.calculatedStats?.[key]?.totals;
const itemStats = extraStats || cacheStats;
```

---

## 미해결 이슈

현재 없음 (2026-01-22 기준)

---

## 브라우저 캐시 문제 시

```javascript
localStorage.clear()
// 그 다음 Ctrl + Shift + R
```

---

## 유틸리티 스크립트

| 스크립트 | 용도 |
|---------|------|
| `scripts/fix-sejong-simple.js` | 세종 매핑 수정 |
| `scripts/fix-jeju.js` | 제주 매핑 수정 |
| `scripts/fix-region-filter.js` | 필터 정확도 개선 |

---

자세한 내용은 `.gemini/antigravity/brain/.../WORK_HISTORY.md` 참고
