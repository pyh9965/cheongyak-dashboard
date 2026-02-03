/**
 * useCompetitionMapStats Hook
 *
 * 지도의 줌 레벨과 필터링된 데이터에 기반하여 지역별 경쟁률 통계를 계산합니다.
 * 지오코딩 및 마커 클러스터링 로직과 데이터 집계 로직을 분리하기 위함입니다.
 */

import { useState, useEffect } from 'react';
import { AptInfo, CacheData } from '@/lib/cache-loader';
import { parseAddress, normalizeSidoName } from '@/lib/address-parser';
import { getCoordinates as getGeoCoordinates, Coordinates } from '@/lib/geo-coordinates';
import { getCompetitionStagesSync, getStageRequestTarget, getSupplyTotalForItem } from './utils';
import { RateType } from './types';

export type RegionData = {
  key: string;
  coordinates: Coordinates;
  items: AptInfo[];
  totalSupply: number;
  avgRate: number | null;
  itemCount: number;
};

export type ProcessingStatus = {
  isProcessing: boolean;
  message: string;
  percent: number;
};

export function useCompetitionMapStats(
  filteredData: AptInfo[],
  extraData: Record<string, any>,
  archiveCache: CacheData | null,
  rateType: RateType,
  currentZoom: number
) {
  const [asyncRegionData, setAsyncRegionData] = useState<RegionData[]>([]);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    isProcessing: false,
    message: "",
    percent: 0
  });

  useEffect(() => {
    if (filteredData.length === 0) {
      setAsyncRegionData([]);
      return;
    }

    setProcessingStatus({
      isProcessing: true,
      message: "데이터 처리 중...",
      percent: 0
    });

    // UI 렌더링을 잠시 양보한 후 즉시 처리
    const timer = setTimeout(() => {
      const regions = new Map<string, RegionData>();

      // 1. 지역 그룹핑 (줌 레벨에 따라 광역/기초 구분)
      const isSidoLevel = currentZoom < 9;

      filteredData.forEach((item) => {
        const address = item.HSSPLY_ADRES;
        const parsed = parseAddress(address);
        
        // 주소 파싱 실패 시 시도 코드로 fallback 시도 (일부 데이터 보정)
        let key = "";
        let coords: Coordinates | null = null;

        if (parsed) {
          key = isSidoLevel ? parsed.sido : parsed.fullKey;
          coords = getGeoCoordinates(key);

          if (!coords && !isSidoLevel) {
            key = parsed.sido;
            coords = getGeoCoordinates(key);
          }
        }

        if (!coords) {
          const fallbackSido = normalizeSidoName(item.SUBSCRPT_AREA_CODE_NM || "");
          if (fallbackSido) {
            key = fallbackSido;
            coords = getGeoCoordinates(key);
          }
        }

        if (!coords) return;

        const existing = regions.get(key);
        if (existing) {
          existing.items.push(item);
          existing.itemCount += 1;
          
          // 실공급량(상세데이터) 우선 사용 (대시보드 로직 일치화)
          const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
          const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
          const realSupply = getSupplyTotalForItem(item, itemKey, extraData, archiveCache, stages);
          
          existing.totalSupply += realSupply;
        } else {
          const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
          const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
          const realSupply = getSupplyTotalForItem(item, itemKey, extraData, archiveCache, stages);

          regions.set(key, {
            key,
            coordinates: coords,
            items: [item],
            totalSupply: realSupply,
            avgRate: null,
            itemCount: 1,
          });
        }
      });

      // 2. 통계 매핑 및 평균 계산
      const regionArray = Array.from(regions.values());

      regionArray.forEach((region) => {
        let totalSupply = 0;
        let totalRequest = 0;

        region.items.forEach((item) => {
          const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

          // 공통 유틸리티를 사용하여 통계 데이터 조회
          const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
          
          if (stages) {
            const stageResult = getStageRequestTarget(stages, rateType);
            if (stageResult.hasData) {
              totalSupply += stageResult.target;
              totalRequest += stageResult.request;
            }
          }
        });

        // 가중 평균 경쟁률 계산
        region.avgRate = totalSupply > 0 ? totalRequest / totalSupply : null;
      });

      setAsyncRegionData(regionArray);

      setProcessingStatus({
        isProcessing: false,
        message: "완료",
        percent: 100
      });
    }, 10);

    return () => clearTimeout(timer);
  }, [filteredData, extraData, rateType, archiveCache, currentZoom]);

  return {
    regionData: asyncRegionData,
    processingStatus
  };
}
