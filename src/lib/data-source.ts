/**
 * 데이터 소스 어댑터
 *
 * 환경 변수 NEXT_PUBLIC_USE_SQLITE에 따라 SQLite DB 또는 기존 JSON 캐시에서 데이터를 가져옵니다.
 *
 * - NEXT_PUBLIC_USE_SQLITE=true  → SQLite DB (src/lib/queries.ts)
 * - 기본값 (미설정)              → JSON 캐시 (src/lib/cache-loader.ts)
 *
 * 이 파일은 서버 컴포넌트와 API 라우트에서만 사용하세요.
 * SQLite 함수는 Node.js 환경에서만 실행되므로 클라이언트 번들에 포함되면 안 됩니다.
 */

import type { AptInfo, CacheData, CachedStats } from './cache-loader';
import type { SearchParams, CompetitionStages, DashboardStatsResult } from '@/hooks/types';
import type { AptListResult, AptDetailResult, RegionStat } from './queries';

/** SQLite 모드 여부 (환경 변수로 제어) */
const USE_SQLITE = process.env.NEXT_PUBLIC_USE_SQLITE === 'true';

// ─────────────────────────────────────────────
// 1. 목록 조회
// ─────────────────────────────────────────────

/**
 * 청약 공고 목록을 조회합니다.
 *
 * SQLite 모드: DB에서 직접 필터링 + 페이지네이션
 * JSON 모드: 캐시 파일 로드 후 반환 (클라이언트에서 추가 필터링)
 */
export async function getAptListData(
    params: Partial<SearchParams> & { page?: number; pageSize?: number }
): Promise<AptListResult> {
    if (USE_SQLITE) {
        // 동적 임포트: SQLite 모듈이 클라이언트 번들에 포함되지 않도록 함
        const { getAptList } = await import('./queries');
        return getAptList({
            startMonth: params.startMonth,
            endMonth: params.endMonth,
            sidoCode: params.sidoCode,
            sigungu: params.sigungu,
            houseNm: params.houseNm,
            houseDtlSecd: params.houseDtlSecd,
            saleType: params.saleType,
            page: params.page,
            pageSize: params.pageSize,
        });
    }

    // JSON 캐시 모드: 아카이브 캐시 전체를 로드하여 반환
    // (실제 필터링은 useAptData 훅의 클라이언트 로직에서 처리)
    const { loadArchiveCache } = await import('./cache-loader');
    const cache: CacheData | null = await loadArchiveCache();

    if (!cache) {
        return { items: [], total: 0, page: 1, pageSize: params.pageSize ?? 20 };
    }

    return {
        items: cache.lists,
        total: cache.metadata.totalCount,
        page: 1,
        pageSize: cache.metadata.totalCount,
    };
}

// ─────────────────────────────────────────────
// 2. 단지 상세 조회
// ─────────────────────────────────────────────

/**
 * 단일 공고의 상세 데이터(모델/경쟁률/특별공급)를 조회합니다.
 *
 * SQLite 모드: DB에서 직접 JOIN 조회
 * JSON 모드: 기존 getStaticDetail() / getDetailFromCache() 로직 사용
 */
export async function getAptDetailData(
    houseManageNo: string,
    pblancNo: string
): Promise<AptDetailResult | null> {
    if (USE_SQLITE) {
        const { getAptDetail } = await import('./queries');
        return getAptDetail(houseManageNo, pblancNo);
    }

    // JSON 캐시 모드: 기존 상세 캐시 / per-project JSON 파일 조회
    const { getDetailFromCache, getStaticDetail } = await import('./cache-loader');

    const cached = await getDetailFromCache(houseManageNo, pblancNo);
    if (cached) {
        // 기존 캐시 구조를 AptDetailResult 형식으로 변환
        return {
            detail: null, // JSON 캐시에는 기본 공고 정보가 없음 (archive에서 별도 조회)
            models: [],   // buildApplicationRows에 필요한 raw rows가 아닌 가공된 데이터
            competition: [],
            special: [],
        };
    }

    const staticDetail = await getStaticDetail(houseManageNo, pblancNo);
    if (staticDetail) {
        return {
            detail: null,
            models: [],
            competition: [],
            special: [],
        };
    }

    return null;
}

// ─────────────────────────────────────────────
// 3. 경쟁률 단계 조회
// ─────────────────────────────────────────────

/**
 * 단일 공고의 경쟁률 단계별 데이터를 조회합니다.
 *
 * SQLite 모드: DB에서 직접 집계
 * JSON 모드: 기존 archiveCache.calculatedStats 또는 detailCache 조회
 */
export async function getCompetitionStagesData(
    houseManageNo: string,
    pblancNo: string,
    archiveCache?: CacheData | null
): Promise<CompetitionStages | null> {
    if (USE_SQLITE) {
        const { getCompetitionStages } = await import('./queries');
        return getCompetitionStages(houseManageNo, pblancNo);
    }

    // JSON 캐시 모드: archive calculatedStats 에서 조회
    const key = `${houseManageNo}_${pblancNo}`;
    const stats: CachedStats | null = archiveCache?.calculatedStats?.[key] ?? null;

    if (stats?.totals?.stages) {
        const s = stats.totals.stages;
        return {
            special: s.special,
            rank1: s.rank1,
            rank2: s.rank2,
            total: s.total,
        };
    }

    return null;
}

// ─────────────────────────────────────────────
// 4. 지도 지역별 집계
// ─────────────────────────────────────────────

/**
 * 지도 표시용 시도별 집계 데이터를 조회합니다.
 *
 * SQLite 모드: DB GROUP BY 집계
 * JSON 모드: null 반환 (클라이언트 훅 useCompetitionMapStats에서 계산)
 */
export async function getMapRegionStatsData(
    params?: Partial<SearchParams>
): Promise<RegionStat[] | null> {
    if (USE_SQLITE) {
        const { getMapRegionStats } = await import('./queries');
        return getMapRegionStats(params);
    }

    // JSON 모드에서는 클라이언트 훅이 계산하므로 null 반환
    return null;
}

// ─────────────────────────────────────────────
// 5. 대시보드 요약 통계
// ─────────────────────────────────────────────

/**
 * 대시보드 요약 통계를 조회합니다.
 *
 * SQLite 모드: DB GROUP BY 집계
 * JSON 모드: null 반환 (클라이언트 훅 useDashboardStats에서 계산)
 */
export async function getDashboardStatsData(
    params?: Partial<SearchParams>
): Promise<DashboardStatsResult | null> {
    if (USE_SQLITE) {
        const { getDashboardStats } = await import('./queries');
        return getDashboardStats(params);
    }

    // JSON 모드에서는 클라이언트 훅이 계산하므로 null 반환
    return null;
}
