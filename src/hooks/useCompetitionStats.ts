/**
 * useCompetitionStats Hook
 *
 * extraData와 archiveCache에서 경쟁률 통계 데이터를 조회합니다.
 * extraData를 우선 사용하고, 없으면 archiveCache로 fallback합니다.
 */

import { useMemo } from 'react';
import type { CacheData, CompetitionStatsResult } from './types';
import { getCompetitionStagesSync } from './utils';

/**
 * 경쟁률 통계 데이터를 조회합니다.
 *
 * @param key - 고유 식별자: `${HOUSE_MANAGE_NO}_${PBLANC_NO}`
 * @param extraData - 우선 데이터 소스 (상세 경쟁률 데이터, target/request 포함)
 * @param archiveCache - fallback 데이터 소스 (캐시된 통계)
 * @returns 경쟁률 단계별 데이터 및 메타데이터
 *
 * @example
 * ```typescript
 * const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
 * const { stages, hasData, source } = useCompetitionStats(key, extraData, archiveCache);
 *
 * if (hasData && stages) {
 *   console.log('전체 경쟁률:', stages.total.rate);
 *   console.log('1순위 경쟁률:', stages.rank1.rate);
 * }
 * ```
 */
export function useCompetitionStats(
  key: string,
  extraData: Record<string, any>,
  archiveCache: CacheData | null
): CompetitionStatsResult {
  return useMemo(() => {
    const stages = getCompetitionStagesSync(key, extraData, archiveCache);

    // Determine data source
    if (stages) {
      const hasExtraData =
        extraData[key]?.totals?.stages?.total?.rate !== null &&
        extraData[key]?.totals?.stages?.total?.rate !== undefined;

      return {
        stages,
        source: hasExtraData ? ('extraData' as const) : ('archiveCache' as const),
        hasData: true,
      };
    }

    return {
      stages: null,
      source: 'none' as const,
      hasData: false,
    };
  }, [key, extraData, archiveCache]);
}
