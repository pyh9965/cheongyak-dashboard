/**
 * Custom Hooks 타입 정의
 *
 * 경쟁률 계산 로직에 사용되는 공통 타입들을 정의합니다.
 */

// Re-export from cache-loader for convenience
export type { CachedStats, ApplicationRow, AptInfo, CacheData } from '@/lib/cache-loader';

/**
 * 경쟁률 단계 타입
 * - special: 특별공급
 * - rank1: 1순위
 * - rank2: 2순위
 * - total: 전체
 */
export type RateType = 'special' | 'rank1' | 'rank2' | 'total';

/**
 * 단계별 경쟁률 데이터
 */
export type StageData = {
  rate: number | null;
  target?: number;
  request?: number;
};

/**
 * 전체 경쟁률 단계 구조
 */
export type CompetitionStages = {
  special: StageData;
  rank1: StageData;
  rank2: StageData;
  total: StageData;
};

/**
 * useCompetitionStats Hook 반환 타입
 */
export type CompetitionStatsResult = {
  /** 경쟁률 단계별 데이터 */
  stages: CompetitionStages | null;
  /** 데이터 소스 (extraData, archiveCache, 또는 없음) */
  source: 'extraData' | 'archiveCache' | 'none';
  /** 유효한 데이터 존재 여부 */
  hasData: boolean;
};

/**
 * useRateSelector Hook 반환 타입
 */
export type RateSelectorResult = {
  /** 경쟁률 */
  rate: number | null;
  /** 공급 수량 */
  target: number | null;
  /** 청약 건수 */
  request: number | null;
  /** 유효한 경쟁률 존재 여부 */
  hasRate: boolean;
};

/**
 * useWeightedAverage Hook 반환 타입
 */
export type WeightedAverageResult = {
  /** 가중 평균 경쟁률 (totalRequest / totalSupply) */
  averageRate: number | null;
  /** 총 공급 수량 */
  totalSupply: number;
  /** 총 청약 건수 */
  totalRequest: number;
  /** 집계된 아이템 개수 */
  itemCount: number;
};

/**
 * 대시보드용 월별 통계
 */
export type MonthlyStatItem = {
  supply: number;
  request: number;
  special: { supply: number; request: number };
  rank1: { supply: number; request: number };
  rank2: { supply: number; request: number };
};

/**
 * 대시보드용 주택유형별 통계
 */
export type TypeStatItem = {
  supply: number;
  request: number;
};

/**
 * useDashboardStats Hook 반환 타입
 */
export type DashboardStatsResult = {
  /** 총 공급 규모 */
  supplyTotal: number;
  /** 총 청약 건수 */
  requestTotal: number;
  /** 전체 경쟁률 */
  rateTotal: number;
  /** 1순위 경쟁률 */
  rateRank1: number;
  /** 2순위 경쟁률 */
  rateRank2: number;
  /** 특별공급 경쟁률 */
  rateSpecial: number;
  /** 최고 경쟁률 단지 정보 */
  maxCompetition: { name: string; rate: number };
  /** 월별 집계 데이터 */
  monthlyStats: Record<string, MonthlyStatItem>;
  /** 주택유형별 집계 데이터 */
  typeStats: Record<string, TypeStatItem>;
};
