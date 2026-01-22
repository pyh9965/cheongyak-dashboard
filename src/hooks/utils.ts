/**
 * Competition Stats 유틸리티 함수들
 *
 * useCompetitionStats hook과 로직을 공유하는 순수 함수들입니다.
 * React component 외부에서 호출 가능한 버전입니다.
 */

import type { CacheData, CompetitionStages } from './types';

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
