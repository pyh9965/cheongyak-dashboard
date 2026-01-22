/**
 * useRateSelector Hook
 *
 * 경쟁률 단계(special/rank1/rank2/total)에서 특정 타입의 데이터를 선택합니다.
 * if-else 체인을 제거하고 타입 안전성을 보장합니다.
 */

import { useMemo } from 'react';
import type { CompetitionStages, RateType, RateSelectorResult } from './types';

/**
 * 특정 경쟁률 타입의 데이터를 선택합니다.
 *
 * @param stages - 경쟁률 단계별 데이터 (useCompetitionStats에서 반환된 값)
 * @param rateType - 선택할 경쟁률 타입 ('special' | 'rank1' | 'rank2' | 'total')
 * @returns 선택된 경쟁률 데이터 (rate, target, request)
 *
 * @example
 * ```typescript
 * const { stages } = useCompetitionStats(key, extraData, archiveCache);
 * const { rate, target, request, hasRate } = useRateSelector(stages, 'rank1');
 *
 * if (hasRate) {
 *   console.log(`1순위 경쟁률: ${rate}:1`);
 *   console.log(`공급: ${target}, 청약: ${request}`);
 * }
 * ```
 */
export function useRateSelector(
  stages: CompetitionStages | null,
  rateType: RateType
): RateSelectorResult {
  return useMemo(() => {
    if (!stages) {
      return {
        rate: null,
        target: null,
        request: null,
        hasRate: false,
      };
    }

    // 타입 안전한 indexed access로 if-else 체인 제거
    const stageData = stages[rateType];

    const rate = stageData.rate;
    const hasRate = rate !== null && rate !== undefined;

    return {
      rate,
      target: stageData.target ?? null,
      request: stageData.request ?? null,
      hasRate,
    };
  }, [stages, rateType]);
}
