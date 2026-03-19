/**
 * useDashboardStats Hook
 *
 * 전체 데이터셋에 대한 종합 통계(총 공급/청약, 월별, 유형별)를 계산합니다.
 * getCompetitionStagesSync를 사용하여 일관된 데이터 우선순위를 적용합니다.
 *
 * NEXT_PUBLIC_USE_SQLITE=true 환경에서는 서버 사이드 /api/apt/stats 엔드포인트를 사용합니다.
 */

import { useMemo, useState, useEffect } from 'react';
import type { AptInfo, CacheData } from '@/lib/cache-loader';
import type { DashboardStatsResult, MonthlyStatItem, TypeStatItem } from './types';
import { getCompetitionStagesSync, getStageRequestTarget, getSupplyTotalForItem } from './utils';

const USE_SQLITE = process.env.NEXT_PUBLIC_USE_SQLITE === 'true';

const defaultStats: DashboardStatsResult = {
  supplyTotal: 0,
  requestTotal: 0,
  rateTotal: 0,
  rateRank1: 0,
  rateRank2: 0,
  rateSpecial: 0,
  maxCompetition: { name: '', rate: 0 },
  monthlyStats: {},
  typeStats: {},
};

/**
 * 대시보드용 통계 데이터를 계산합니다.
 *
 * @param data - 전체 아파트 목록
 * @param extraData - 상세 데이터 캐시
 * @param archiveCache - 아카이브 캐시
 * @param startMonth - 조회 시작 월 (YYYY-MM 형식, 선택적)
 * @param endMonth - 조회 종료 월 (YYYY-MM 형식, 선택적)
 * @returns 집계된 대시보드 통계 객체
 */
export function useDashboardStats(
  data: AptInfo[],
  extraData: Record<string, any>,
  archiveCache: CacheData | null,
  startMonth?: string,
  endMonth?: string
): DashboardStatsResult {
  // SQLite 모드: 서버에서 미리 집계된 통계를 가져옴
  const [sqliteStats, setSqliteStats] = useState<DashboardStatsResult>(defaultStats);

  useEffect(() => {
    if (!USE_SQLITE) return;

    const params = new URLSearchParams();
    if (startMonth) params.set('startMonth', startMonth.replace('-', ''));
    if (endMonth) params.set('endMonth', endMonth.replace('-', ''));

    fetch(`/api/apt/stats?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`stats API 오류: ${res.status}`);
        return res.json();
      })
      .then((res) => {
        // monthlyStats 배열 → Record<string, MonthlyStatItem>
        const monthlyStatsMap: Record<string, MonthlyStatItem> = {};
        if (Array.isArray(res.monthlyStats)) {
          for (const item of res.monthlyStats) {
            monthlyStatsMap[item.month] = {
              supply: item.supply ?? 0,
              request: 0,
              special: { supply: 0, request: 0 },
              rank1: { supply: 0, request: 0 },
              rank2: { supply: 0, request: 0 },
            };
          }
        }

        // typeStats 배열 → Record<string, TypeStatItem>
        const typeStatsMap: Record<string, TypeStatItem> = {};
        if (Array.isArray(res.typeStats)) {
          for (const item of res.typeStats) {
            typeStatsMap[item.houseType] = {
              supply: item.supply ?? 0,
              request: 0,
            };
          }
        }

        setSqliteStats({
          supplyTotal: res.supplyTotal ?? 0,
          requestTotal: res.requestTotal ?? 0,
          rateTotal: res.rateTotal ?? 0,
          rateRank1: res.rateRank1 ?? 0,
          rateRank2: res.rateRank2 ?? 0,
          rateSpecial: res.rateSpecial ?? 0,
          maxCompetition: { name: '', rate: res.maxCompetition ?? 0 },
          monthlyStats: monthlyStatsMap,
          typeStats: typeStatsMap,
        });
      })
      .catch((err) => {
        console.error('[useDashboardStats] SQLite 통계 조회 실패:', err);
      });
  }, [startMonth, endMonth, data.length]);

  // JSON 모드: 클라이언트 사이드 집계 (기존 로직 유지)
  const jsonStats = useMemo(() => {
    if (USE_SQLITE) return defaultStats; // SQLite 모드에서는 무거운 연산 생략

    // 날짜 범위 파싱 (이중 안전장치)
    const searchStart = startMonth ? new Date(startMonth + '-01') : null;
    const searchEnd = endMonth ? (() => {
      const [year, month] = endMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      return new Date(year, month - 1, lastDay, 23, 59, 59, 999);
    })() : null;
    let supplyTotal = 0;
    let requestTotal = 0;

    let supplyRank1 = 0;
    let requestRank1 = 0;

    let supplyRank2 = 0;
    let requestRank2 = 0;

    let supplySpecial = 0;
    let requestSpecial = 0;

    let maxCompetition = { name: "", rate: 0 };

    // 월별 집계
    const monthlyStats: Record<string, MonthlyStatItem> = {};

    // 주택구분별 집계
    const typeStats: Record<string, TypeStatItem> = {};

    console.log(`[useDashboardStats] 집계 시작: ${data.length}개 항목`);
    let processedCount = 0;
    let hasDetailedStatsCount = 0;

    data.forEach((item) => {
      // 날짜 필터 재검증 (이중 안전장치)
      if (searchStart || searchEnd) {
        const itemDateStr = item.RCRIT_PBLANC_DE;
        if (!itemDateStr) return; // 날짜 없으면 제외

        const itemDate = new Date(
          itemDateStr.substring(0, 4) + '-' +
          itemDateStr.substring(4, 6) + '-' +
          itemDateStr.substring(6, 8)
        );

        if (searchStart && itemDate < searchStart) return;
        if (searchEnd && itemDate > searchEnd) return;
      }

      const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

      // 공통 유틸리티를 사용하여 통계 데이터 조회 (우선순위: extraData > archiveCache)
      const stages = getCompetitionStagesSync(key, extraData, archiveCache);
      const hasDetailedStats = !!stages && (stages.total.rate !== undefined && stages.total.rate !== null);
      const itemSupply = getSupplyTotalForItem(item, key, extraData, archiveCache, stages);
      const totalStage = getStageRequestTarget(stages, 'total');

      // 1. 통계 데이터 누적
      if (hasDetailedStats && stages) {
        hasDetailedStatsCount++;
        processedCount++;

        // 공급수 중복 합산 방지 (이미 calculatedStats 생성 시 처리됨)
        // stages.total.target은 해당 단지의 총 공급세대수와 동일해야 함
        const itemRequestTotal = totalStage.request || 0;

        supplyTotal += itemSupply;
        requestTotal += itemRequestTotal;

        // 순위별 합산
        const rank1Stage = getStageRequestTarget(stages, 'rank1');
        supplyRank1 += rank1Stage.target || 0;
        requestRank1 += rank1Stage.request || 0;

        const rank2Stage = getStageRequestTarget(stages, 'rank2');
        supplyRank2 += rank2Stage.target || 0;
        requestRank2 += rank2Stage.request || 0;

        const specialStage = getStageRequestTarget(stages, 'special');
        supplySpecial += specialStage.target || 0;
        requestSpecial += specialStage.request || 0;

        // 최고 경쟁률 갱신
        const currentTotalRate = stages.total.rate || 0;
        if (currentTotalRate > maxCompetition.rate) {
          maxCompetition = { name: item.HOUSE_NM || "", rate: currentTotalRate };
        }
      } else {
        // [FALLBACK] 통계 데이터가 없거나 불완전할 경우, 기본 필드 사용
        supplyTotal += itemSupply;
        // 경쟁률/청약건수 정보는 API 기본 응답에 없으므로 0으로 처리 (기존 로직 유지)
      }

      // 2. 월별/유형별 집계 (공통)
      // 월별 집계
      if (item.RCRIT_PBLANC_DE) {
        const monthKey = item.RCRIT_PBLANC_DE.substring(0, 7); // YYYY-MM
        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = {
            supply: 0,
            request: 0,
            special: { supply: 0, request: 0 },
            rank1: { supply: 0, request: 0 },
            rank2: { supply: 0, request: 0 }
          };
        }

        monthlyStats[monthKey].supply += itemSupply;

        if (hasDetailedStats && stages) {
          // 전체 통계
          monthlyStats[monthKey].request += totalStage.request || 0;

          // 순위별 통계
          const monthlySpecial = getStageRequestTarget(stages, 'special');
          monthlyStats[monthKey].special.supply += monthlySpecial.target || 0;
          monthlyStats[monthKey].special.request += monthlySpecial.request || 0;

          const monthlyRank1 = getStageRequestTarget(stages, 'rank1');
          monthlyStats[monthKey].rank1.supply += monthlyRank1.target || 0;
          monthlyStats[monthKey].rank1.request += monthlyRank1.request || 0;

          const monthlyRank2 = getStageRequestTarget(stages, 'rank2');
          monthlyStats[monthKey].rank2.supply += monthlyRank2.target || 0;
          monthlyStats[monthKey].rank2.request += monthlyRank2.request || 0;
        }
      }

      // 주택 구분별 집계
      const houseType = item.HOUSE_DTL_SECD_NM || "기타";
      if (!typeStats[houseType]) {
        typeStats[houseType] = { supply: 0, request: 0 };
      }

      typeStats[houseType].supply += itemSupply;

      if (hasDetailedStats && stages) {
        const req = totalStage.request || 0;
        typeStats[houseType].request += req;
      }
    });

    console.log(`[useDashboardStats] 집계 완료:`, {
      총항목수: data.length,
      통계있는항목수: hasDetailedStatsCount,
      총공급: supplyTotal,
      총청약: requestTotal,
      전체경쟁률: supplyTotal > 0 ? requestTotal / supplyTotal : 0
    });

    return {
      supplyTotal,
      requestTotal,
      rateTotal: supplyTotal > 0 ? requestTotal / supplyTotal : 0,
      rateRank1: supplyRank1 > 0 ? requestRank1 / supplyRank1 : 0,
      rateRank2: supplyRank2 > 0 ? requestRank2 / supplyRank2 : 0,
      rateSpecial: supplySpecial > 0 ? requestSpecial / supplySpecial : 0,
      maxCompetition,
      monthlyStats,
      typeStats,
    };
  }, [data, extraData, archiveCache, startMonth, endMonth]);

  return USE_SQLITE ? sqliteStats : jsonStats;
}
