/**
 * Competition Stats 유틸리티 함수들
 *
 * useCompetitionStats hook과 로직을 공유하는 순수 함수들입니다.
 * React component 외부에서 호출 가능한 버전입니다.
 */

import type { AptInfo, CacheData, CompetitionStages, RateType } from './types';

/**
 * 경쟁률 통계 데이터를 동기적으로 조회합니다.
 *
 * useCompetitionStats hook과 동일한 로직을 사용하지만,
 * React component 외부에서도 사용 가능한 순수 함수입니다.
 *
 * @param key - 고유 식별자: `${HOUSE_MANAGE_NO}_${PBLANC_NO}`
 * @param extraData - 우선 데이터 소스
 * @param archiveCache - fallback 데이터 소스
 * @returns 경쟁률 단계별 데이터 (없으면 null)
 *
 * @example
 * ```typescript
 * const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
 * const stages = getCompetitionStagesSync(key, extraData, archiveCache);
 * if (stages) {
 *   console.log('전체 경쟁률:', stages.total.rate);
 * }
 * ```
 */
export function getCompetitionStagesSync(
  key: string,
  extraData: Record<string, any>,
  archiveCache: CacheData | null
): CompetitionStages | null {
  // Priority 1: extraData (상세 경쟁률 데이터)
  const extraStats = extraData[key]?.totals?.stages;

  if (
    extraStats &&
    extraStats.total?.rate !== null &&
    extraStats.total?.rate !== undefined
  ) {
    return extraStats;
  }

  // Priority 2: archiveCache (캐시된 통계)
  const archiveStats = archiveCache?.calculatedStats?.[key]?.totals?.stages;

  if (
    archiveStats &&
    archiveStats.total?.rate !== null &&
    archiveStats.total?.rate !== undefined
  ) {
    return archiveStats;
  }

  // No valid data available
  return extraStats || archiveStats || null;
}

export function getSupplyTotalForItem(
  item: AptInfo,
  key: string,
  extraData: Record<string, any>,
  archiveCache: CacheData | null,
  stages?: CompetitionStages | null
): number {
  const extraTotals = extraData[key]?.totals;
  const cacheTotals = archiveCache?.calculatedStats?.[key]?.totals;
  const resolvedStages = stages ?? getCompetitionStagesSync(key, extraData, archiveCache);

  return (
    extraTotals?.supplyTotal ??
    cacheTotals?.supplyTotal ??
    resolvedStages?.total?.target ??
    Number(item.TOT_SUPLY_HSHLDCO || 0)
  );
}

export function getStageRequestTarget(
  stages: CompetitionStages | null,
  rateType: RateType
): { target: number; request: number; hasData: boolean } {
  if (!stages) {
    return { target: 0, request: 0, hasData: false };
  }

  const stageData = stages[rateType];
  if (stageData?.target === undefined || stageData?.request === undefined) {
    return { target: 0, request: 0, hasData: false };
  }

  const target = stageData.target || 0;
  const request = stageData.request || 0;

  if (target <= 0) {
    return { target, request, hasData: false };
  }

  return { target, request, hasData: true };
}

export function getWeightedContribution(
  item: AptInfo,
  key: string,
  extraData: Record<string, any>,
  archiveCache: CacheData | null,
  rateType: RateType,
  options?: { allowRateFallback?: boolean }
): { supply: number; request: number; hasData: boolean } {
  const stages = getCompetitionStagesSync(key, extraData, archiveCache);
  const stageResult = getStageRequestTarget(stages, rateType);

  if (stageResult.hasData) {
    return {
      supply: stageResult.target,
      request: stageResult.request,
      hasData: true,
    };
  }

  if (options?.allowRateFallback) {
    const archiveStats = archiveCache?.calculatedStats?.[key]?.totals;
    const rate = archiveStats?.stages?.[rateType]?.rate;
    const supplyTotal = archiveStats?.supplyTotal || 0;

    if (rate !== null && rate !== undefined && rate > 0 && supplyTotal > 0) {
      return {
        supply: supplyTotal,
        request: supplyTotal * rate,
        hasData: true,
      };
    }
  }

  return { supply: 0, request: 0, hasData: false };
}

export function parseCheongyakDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanDate = dateStr.replace(/-/g, "");
  if (cleanDate.length !== 8) return null;

  const year = parseInt(cleanDate.substring(0, 4));
  const month = parseInt(cleanDate.substring(4, 6)) - 1;
  const day = parseInt(cleanDate.substring(6, 8));

  return new Date(year, month, day);
}

export function getCheongyakStatus(
  receiptEnd: string,
  announceDate: string
): { text: string; color: string; isActionable: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = parseCheongyakDate(receiptEnd);
  const announce = parseCheongyakDate(announceDate);

  if (!endDate) return { text: "일정 미정", color: "#999", isActionable: false };

  if (today <= endDate) {
    return { text: "청약 접수중/예정", color: "#0066cc", isActionable: false };
  }

  if (announce && today < announce) {
    return { text: "접수 마감", color: "#ff9800", isActionable: false };
  }

  return { text: "📊 결과 확인", color: "#28a745", isActionable: true };
}
