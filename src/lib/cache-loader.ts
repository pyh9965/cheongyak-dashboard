/**
 * 캐시 로딩 유틸리티
 * 
 * 정적 캐시와 최신 API 데이터를 병합하여 제공합니다.
 */

export type AptInfo = {
    HOUSE_NM: string;
    HOUSE_MANAGE_NO?: string;
    PBLANC_NO?: string;
    RCRIT_PBLANC_DE?: string;
    PRZWNER_PRESNATN_DE?: string;
    RCEPT_ENDDE?: string;
    [key: string]: any;
};

export type CachedStats = {
    totals: {
        supplyTotal: number;
        stages: {
            special: { rate: number | null };
            rank1: { rate: number | null };
            rank2: { rate: number | null };
            total: { rate: number | null };
        };
    };
};

export type CacheData = {
    lists: AptInfo[];
    calculatedStats?: Record<string, CachedStats>;
    details?: any; // 하위 호환성 (사용 안함)
    metadata: {
        generatedAt: string;
        totalCount: number;
        statsCount?: number;
        detailCount?: number;
        dateRange: {
            start: string;
            end: string;
        };
    };
};

// 타입별 상세 데이터 구조
export type ApplicationRow = {
    modelNo: string;
    houseType: string;
    areaSqm: number | null;
    areaPyeong: number | null;
    priceThousand: number | null;
    supplyGeneral: number;
    supplySpecial: number;
    supplyTotal: number;
    specialRequests: Record<string, number | null>;
    stages: {
        special: { target: number | null; request: number | null; rate: number | null; remaining: number | null };
        rank1: { target: number | null; request: number | null; rate: number | null; remaining: number | null; localRequest?: number | null; etcRequest?: number | null };
        rank2: { target: number | null; request: number | null; rate: number | null; remaining: number | null; localRequest?: number | null; etcRequest?: number | null };
        total: { target: number | null; request: number | null; rate: number | null; remaining: number | null };
    };
};

// 상세 데이터 캐시 구조
export type DetailCacheData = {
    metadata: {
        generatedAt: string;
        totalCount: number;
        dateRange: {
            start: string;
            end: string;
        };
    };
    details: Record<string, {
        rows: ApplicationRow[];
        totals: ApplicationRow | null;
        missingSpecialRequests: boolean;
    }>;
};

let archiveCache: CacheData | null = null;
let archiveCachePromise: Promise<CacheData | null> | null = null;

let detailCache: DetailCacheData | null = null;
let detailCachePromise: Promise<DetailCacheData | null> | null = null;

/**
 * 정적 캐시 파일 로드 (singleton 패턴)
 */
export async function loadArchiveCache(): Promise<CacheData | null> {
    // 이미 로드된 경우 바로 반환
    if (archiveCache) {
        return archiveCache;
    }

    // 로딩 중인 경우 기존 Promise 반환
    if (archiveCachePromise) {
        return archiveCachePromise;
    }

    // 새로운 로딩 시작
    archiveCachePromise = (async () => {
        try {
            console.log('📦 캐시 파일 로딩 시작...');
            const response = await fetch(`/data/cheongyak-archive.json?t=${Date.now()}`);

            if (!response.ok) {
                console.log('⚠️ 캐시 파일 없음 - API에서 직접 로드합니다');
                return null;
            }

            const data: CacheData = await response.json();
            archiveCache = data;

            const count = data.metadata.statsCount || data.metadata.detailCount || 0;
            console.log(`✅ 캐시 로드 완료: ${data.metadata.totalCount}건 (통계 ${count}건)`);
            return data;
        } catch (error) {
            console.error('❌ 캐시 로드 실패:', error);
            return null;
        }
    })();

    return archiveCachePromise;
}

/**
 * 타입별 상세 데이터 캐시 로드 (singleton 패턴)
 */
export async function loadDetailCache(): Promise<DetailCacheData | null> {
    // 이미 로드된 경우 바로 반환
    if (detailCache) {
        return detailCache;
    }

    // 로딩 중인 경우 기존 Promise 반환
    if (detailCachePromise) {
        return detailCachePromise;
    }

    // 새로운 로딩 시작
    detailCachePromise = (async () => {
        try {
            console.log('📋 상세 캐시 파일 로딩 시작...');
            const response = await fetch('/data/cheongyak-details-cache.json');

            if (!response.ok) {
                console.log('⚠️ 상세 캐시 파일 없음 - API에서 직접 로드합니다');
                return null;
            }

            const data: DetailCacheData = await response.json();
            detailCache = data;

            console.log(`✅ 상세 캐시 로드 완료: ${data.metadata.totalCount}건`);
            return data;
        } catch (error) {
            console.error('❌ 상세 캐시 로드 실패:', error);
            return null;
        }
    })();

    return detailCachePromise;
}

/**
 * 날짜 파싱 유틸리티
 */
function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, '');
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

/**
 * 캐시 데이터와 API 데이터를 병합
 * 
 * @param cacheData 정적 캐시 데이터
 * @param apiData API에서 가져온 최신 데이터
 * @param startMonth 검색 시작 월 (YYYY-MM)
 * @param endMonth 검색 종료 월 (YYYY-MM)
 */
export function mergeCacheAndApiData(
    cacheData: CacheData | null,
    apiData: AptInfo[],
    startMonth?: string,
    endMonth?: string
): AptInfo[] {
    if (!cacheData) {
        // 캐시가 없으면 API 데이터만 반환
        return apiData;
    }

    // 캐시 범위 확인 (캐시 메타데이터에서 종료일 읽기)
    const cacheEndDateStr = cacheData.metadata?.dateRange?.end || '2025-12-31';
    const cacheEndDate = parseDate(cacheEndDateStr.replace(/-/g, ''));

    // 검색 범위 파싱
    const searchStart = startMonth ? parseDate(startMonth.replace('-', '') + '01') : null;
    const searchEndYear = endMonth ? parseInt(endMonth.split('-')[0]) : null;
    const searchEndMonth = endMonth ? parseInt(endMonth.split('-')[1]) : null;
    const searchEnd = searchEndYear && searchEndMonth
        ? new Date(searchEndYear, searchEndMonth, 0) // 해당 월의 마지막 날
        : null;

    let result: AptInfo[] = [];

    // 1. 캐시 데이터에서 필터링
    if (!searchStart || (cacheEndDate && searchStart <= cacheEndDate)) {
        const cachedItems = cacheData.lists.filter(item => {
            const itemDate = parseDate(item.RCRIT_PBLANC_DE || '');
            if (!itemDate) return false;

            // 검색 범위 확인
            if (searchStart && itemDate < searchStart) return false;
            if (searchEnd && itemDate > searchEnd) return false;

            // 캐시 범위 내인지 확인
            if (cacheEndDate && itemDate <= cacheEndDate) return true;

            return false;
        });

        result = [...cachedItems];
        console.log(`📦 캐시에서 ${cachedItems.length}건 로드`);
    }

    // 2. API 데이터 병합 (중복 제거 - ID 기준)
    const cacheIds = new Set(result.map(i => `${i.HOUSE_MANAGE_NO}_${i.PBLANC_NO}`));

    const newApiItems = apiData.filter(item => {
        const id = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        // 캐시에 이미 있는 데이터는 API 결과에서 제외 (캐시 우선)
        // 만약 API 데이터가 더 최신이라 덮어쓰고 싶다면 로직을 반대로 해야 하지만,
        // 현재는 캐시의 통계 연결성을 위해 캐시 데이터를 유지합니다.
        return !cacheIds.has(id);
    });

    result = [...result, ...newApiItems];
    console.log(`🔄 API에서 ${newApiItems.length}건 추가 (총 ${result.length}건)`);

    return result;
}

/**
 * 상세 데이터 조회 (DetailCache 우선)
 */
export async function getDetailFromCache(
    houseManageNo: string,
    pblancNo: string
): Promise<{ rows: ApplicationRow[]; totals: ApplicationRow | null; missingSpecialRequests: boolean } | null> {
    // DetailCache에서 먼저 확인
    if (!detailCache) {
        await loadDetailCache();
    }

    if (detailCache) {
        const key = `${houseManageNo}_${pblancNo}`;
        const cached = detailCache.details[key];
        if (cached) {
            console.log(`[DetailCache] Hit: ${key}`);
            return cached;
        }
    }

    // 캐시에 없으면 null 반환 (API로 가져와야 함)
    return null;
}

/**
 * 정적 상세 데이터 (Pre-generated JSON) 조회
 */
export async function getStaticDetail(
    houseManageNo: string,
    pblancNo: string
): Promise<{ rows: ApplicationRow[]; totals: ApplicationRow | null; missingSpecialRequests: boolean } | null> {
    try {
        // 캐시 버스팅을 위해 타임스탬프 추가
        const path = `/data/details/${houseManageNo}_${pblancNo}.json?t=${Date.now()}`;
        const res = await fetch(path);

        if (!res.ok) return null;

        const data = await res.json();
        // console.log(`⚡ 정적 상세 데이터 로드 성공: ${houseManageNo}_${pblancNo}`);
        return data;
    } catch (e) {
        return null;
    }
}

/**
 * 미리 계산된 통계 정보 조회
 */
export function getCalculatedStats(
    cache: CacheData | null,
    houseManageNo: string,
    pblancNo: string
): CachedStats | null {
    if (!cache || !cache.calculatedStats) return null;
    const key = `${houseManageNo}_${pblancNo}`;
    return cache.calculatedStats[key] || null;
}

/**
 * 캐시 통계 정보 조회
 */
export function getCacheStats(cache: CacheData | null): {
    hasCached: boolean;
    totalCount: number;
    statsCount: number;
    dateRange: string;
} {
    if (!cache) {
        return {
            hasCached: false,
            totalCount: 0,
            statsCount: 0,
            dateRange: '-',
        };
    }

    return {
        hasCached: true,
        totalCount: cache.metadata.totalCount,
        statsCount: cache.metadata.statsCount || cache.metadata.detailCount || 0,
        dateRange: `${cache.metadata.dateRange.start} ~ ${cache.metadata.dateRange.end}`,
    };
}
