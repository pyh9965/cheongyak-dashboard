/**
 * useWeightedAverage Hook
 *
 * 다중 아이템에 대한 가중 평균 경쟁률을 계산합니다.
 * 공식: totalRequest / totalSupply
 */

import { useMemo, useCallback } from 'react';
import type { AptInfo, CacheData, RateType, WeightedAverageResult } from './types';
import { getWeightedContribution } from './utils';

/**
 * 다중 아이템의 가중 평균 경쟁률을 계산합니다.
 *
 * extraData를 우선 사용하고 (target/request 직접 사용),
 * archiveCache는 fallback으로 사용합니다 (rate로부터 역산).
 *
 * @param items - 집계할 APT 아이템 배열
 * @param extraData - 우선 데이터 소스
 * @param archiveCache - fallback 데이터 소스
 * @param rateType - 집계할 경쟁률 타입
 * @returns 가중 평균 통계 (averageRate, totalSupply, totalRequest, itemCount)
 *
 * @example
 * ```typescript
 * // 지역별 평균 경쟁률 계산
 * const { averageRate, totalSupply, totalRequest } = useWeightedAverage(
 *   region.items,
 *   extraData,
 *   archiveCache,
 *   'rank1'
 * );
 *
 * console.log(`평균 1순위 경쟁률: ${averageRate}:1`);
 * console.log(`총 공급: ${totalSupply}, 총 청약: ${totalRequest}`);
 * ```
 */
export function useWeightedAverage(
  items: AptInfo[],
  extraData: Record<string, any>,
  archiveCache: CacheData | null,
  rateType: RateType
): WeightedAverageResult {
  // 계산 함수를 useCallback으로 메모이제이션
  const calculate = useCallback(() => {
    let totalSupply = 0;
    let totalRequest = 0;
    let itemCount = 0;

    items.forEach((item) => {
      const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
      const contribution = getWeightedContribution(
        item,
        itemKey,
        extraData,
        archiveCache,
        rateType,
        { allowRateFallback: true }
      );

      if (contribution.hasData) {
        totalSupply += contribution.supply;
        totalRequest += contribution.request;
        itemCount++;
      }
    });

    // 가중 평균 계산: totalRequest / totalSupply
    const averageRate = totalSupply > 0 ? totalRequest / totalSupply : null;

    return {
      averageRate,
      totalSupply,
      totalRequest,
      itemCount,
    };
  }, [items, extraData, archiveCache, rateType]);

  // useMemo로 결과 캐싱
  return useMemo(() => calculate(), [calculate]);
}
