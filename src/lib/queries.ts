/**
 * SQLite 쿼리 함수 모음
 *
 * JSON 캐시 로딩을 대체하는 서버 사이드 DB 쿼리입니다.
 * better-sqlite3 prepared statement를 사용하여 SQL 인젝션을 방지합니다.
 * 서버 사이드 전용 — "use client" 컴포넌트에서 임포트하지 마세요.
 */

import { getDb } from './db';
import type { AptInfo } from './cache-loader';
import type { CompetitionStages, SearchParams, DashboardStatsResult, MonthlyStatItem, TypeStatItem } from '@/hooks/types';

// ─────────────────────────────────────────────
// 내부 헬퍼 타입
// ─────────────────────────────────────────────

/** getAptList 파라미터 */
export type ListParams = {
    startMonth?: string;   // YYYYMM 형식 (예: "202401")
    endMonth?: string;     // YYYYMM 형식 (예: "202412")
    sidoCode?: string;     // 시도명 (SUBSCRPT_AREA_CODE_NM)
    sigungu?: string;      // 시군구 검색 (HSSPLY_ADRES에서 텍스트 검색)
    houseNm?: string;      // 단지명 텍스트 검색 (HOUSE_NM)
    houseDtlSecd?: string; // 주택상세구분코드 (HOUSE_DTL_SECD)
    saleType?: string;     // 'sale' (분양) 또는 'rent' (임대)
    page?: number;         // 1부터 시작 (기본값 1)
    pageSize?: number;     // 페이지당 항목 수 (기본값 20)
};

/** getAptList 반환 타입 */
export type AptListResult = {
    items: AptInfo[];
    total: number;
    page: number;
    pageSize: number;
};

/** getAptDetail 반환 타입 */
export type AptDetailResult = {
    detail: Record<string, unknown> | null;
    models: Record<string, unknown>[];
    competition: Record<string, unknown>[];
    special: Record<string, unknown>[];
};

/** getMapRegionStats 단일 지역 집계 */
export type RegionStat = {
    region: string;
    itemCount: number;
    totalSupply: number;
    avgLat: number | null;
    avgLng: number | null;
    /** 가중 평균 경쟁률 (청약건수 / 공급호수) */
    competitionRate: number | null;
    totalRequest: number;
};

// ─────────────────────────────────────────────
// 1. apt_detail 목록 조회
// ─────────────────────────────────────────────

/**
 * 청약 공고 목록을 조회합니다.
 *
 * 기존 loadArchiveCache() + 클라이언트 필터링을 대체합니다.
 * 동적 WHERE 절을 배열로 조합하여 파라미터화된 쿼리를 생성합니다.
 *
 * @param params 필터 파라미터 및 페이지네이션
 * @returns 항목 목록, 전체 개수, 현재 페이지, 페이지 크기
 */
export function getAptList(params: ListParams): AptListResult {
    const db = getDb();

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // WHERE 절 조각과 바인딩 파라미터를 함께 관리
    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    // 청약 공고 시작일 기준 월 필터 (YYYYMM → YYYYMMDD)
    if (params.startMonth) {
        conditions.push("strftime('%Y%m', RCRIT_PBLANC_DE) >= ?");
        bindParams.push(params.startMonth);
    }
    if (params.endMonth) {
        conditions.push("strftime('%Y%m', RCRIT_PBLANC_DE) <= ?");
        bindParams.push(params.endMonth);
    }

    // 시도 필터 (SUBSCRPT_AREA_CODE_NM: "서울특별시", "경기도" 등)
    if (params.sidoCode && params.sidoCode !== '') {
        conditions.push('SUBSCRPT_AREA_CODE_NM = ?');
        bindParams.push(params.sidoCode);
    }

    // 시군구 필터 (HSSPLY_ADRES 주소에서 부분 검색)
    if (params.sigungu && params.sigungu !== '') {
        conditions.push('HSSPLY_ADRES LIKE ?');
        bindParams.push(`%${params.sigungu}%`);
    }

    // 단지명 텍스트 검색
    if (params.houseNm && params.houseNm !== '') {
        conditions.push('HOUSE_NM LIKE ?');
        bindParams.push(`%${params.houseNm}%`);
    }

    // 주택 상세 구분 코드 필터 (예: "01" = APT, "04" = 오피스텔)
    if (params.houseDtlSecd && params.houseDtlSecd !== '') {
        conditions.push('HOUSE_DTL_SECD = ?');
        bindParams.push(params.houseDtlSecd);
    }

    // 분양/임대 구분 (RENT_SECD: '0' = 분양, 나머지 = 임대)
    if (params.saleType === 'sale') {
        conditions.push("RENT_SECD = '0'");
    } else if (params.saleType === 'rent') {
        conditions.push("RENT_SECD != '0'");
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // 전체 개수 조회 (페이지네이션 계산용)
    const countSql = `SELECT COUNT(*) as cnt FROM apt_detail ${whereClause}`;
    const countRow = db.prepare(countSql).get(...bindParams) as { cnt: number };
    const total = countRow?.cnt ?? 0;

    // 목록 조회 (최신순 정렬, COORD_LAT/LNG 포함)
    const listSql = `
        SELECT
            HOUSE_NM,
            HOUSE_MANAGE_NO,
            PBLANC_NO,
            RCRIT_PBLANC_DE,
            PRZWNER_PRESNATN_DE,
            RCEPT_BGNDE,
            RCEPT_ENDDE,
            HSSPLY_ADRES,
            SUBSCRPT_AREA_CODE_NM,
            HOUSE_DTL_SECD,
            HOUSE_DTL_SECD_NM,
            RENT_SECD,
            RENT_SECD_NM,
            TOT_SUPLY_HSHLDCO,
            GNRL_RNKG1_CRSPAREA_RCEPT_PD,
            GNRL_RNKG1_ETC_AREA_RCEPT_PD,
            GNRL_RNKG2_CRSPAREA_RCEPT_PD,
            GNRL_RNKG2_ETC_AREA_RCEPT_PD,
            SPSPLY_RCEPT_BGNDE,
            SPSPLY_RCEPT_ENDDE,
            COORD_LAT,
            COORD_LNG
        FROM apt_detail
        ${whereClause}
        ORDER BY RCRIT_PBLANC_DE DESC
        LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(listSql).all(...bindParams, pageSize, offset) as AptInfo[];

    // COORD_LAT/LNG를 coordinates 배열로 변환 (기존 AptInfo 형식 호환)
    const items: AptInfo[] = rows.map(row => {
        const lat = row.COORD_LAT as unknown as number | null;
        const lng = row.COORD_LNG as unknown as number | null;
        const item: AptInfo = { ...row };
        if (lat != null && lng != null) {
            item.coordinates = [lat, lng];
        }
        return item;
    });

    return { items, total, page, pageSize };
}

// ─────────────────────────────────────────────
// 2. 단지 상세 정보 조회
// ─────────────────────────────────────────────

/**
 * 단일 청약 공고의 상세 데이터를 조회합니다.
 *
 * 기존 per-project JSON 파일(public/data/details/*.json)을 대체합니다.
 * apt_detail + apt_model + apt_cmpet + apt_spsply 테이블을 각각 조회합니다.
 * buildApplicationRows()에 필요한 모든 데이터를 반환합니다.
 *
 * @param houseManageNo 주택관리번호
 * @param pblancNo 공고번호
 */
export function getAptDetail(
    houseManageNo: string,
    pblancNo: string
): AptDetailResult {
    const db = getDb();

    // 기본 공고 정보
    const detail = db.prepare(`
        SELECT * FROM apt_detail
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
        LIMIT 1
    `).get(houseManageNo, pblancNo) as Record<string, unknown> | null;

    // 주택형별 모델 정보 (면적, 공급호수, 특별공급 세대수 등)
    const models = db.prepare(`
        SELECT * FROM apt_model
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
    `).all(houseManageNo, pblancNo) as Record<string, unknown>[];

    // 순위별 경쟁률 데이터 (1순위/2순위, 해당지역/기타지역)
    const competition = db.prepare(`
        SELECT * FROM apt_cmpet
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
    `).all(houseManageNo, pblancNo) as Record<string, unknown>[];

    // 특별공급 유형별 청약 건수
    const special = db.prepare(`
        SELECT * FROM apt_spsply
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
    `).all(houseManageNo, pblancNo) as Record<string, unknown>[];

    return { detail, models, competition, special };
}

// ─────────────────────────────────────────────
// 3. 경쟁률 단계별 집계
// ─────────────────────────────────────────────

/**
 * 단일 공고의 경쟁률 단계별 데이터를 계산하여 반환합니다.
 *
 * 기존 getCompetitionStagesSync() + cache 조회를 DB 쿼리로 대체합니다.
 * apt_cmpet와 apt_model을 직접 집계하여 special/rank1/rank2/total 경쟁률을 계산합니다.
 *
 * @param houseManageNo 주택관리번호
 * @param pblancNo 공고번호
 * @returns CompetitionStages 또는 데이터 없으면 null
 */
export function getCompetitionStages(
    houseManageNo: string,
    pblancNo: string
): CompetitionStages | null {
    const db = getDb();

    // 1순위/2순위 집계 (해당지역 + 기타지역 합산)
    const cmpetRows = db.prepare(`
        SELECT
            SUBSCRPT_RANK_CODE,
            SUM(CAST(SUPLY_HSHLDCO AS REAL)) as total_target,
            SUM(CAST(REQ_CNT AS REAL)) as total_request
        FROM apt_cmpet
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
        GROUP BY SUBSCRPT_RANK_CODE
    `).all(houseManageNo, pblancNo) as {
        SUBSCRPT_RANK_CODE: string;
        total_target: number | null;
        total_request: number | null;
    }[];

    // 특별공급 집계 (apt_model에서 SPSPLY_HSHLDCO 합산)
    const modelRow = db.prepare(`
        SELECT
            SUM(CAST(SUPLY_HSHLDCO AS REAL)) as general_supply,
            SUM(CAST(SPSPLY_HSHLDCO AS REAL)) as special_supply
        FROM apt_model
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
    `).get(houseManageNo, pblancNo) as {
        general_supply: number | null;
        special_supply: number | null;
    } | null;

    // 특별공급 청약 건수 합산 (apt_spsply에서 각 유형별 확정+예비 합산)
    const specialRow = db.prepare(`
        SELECT
            SUM(
                COALESCE(CAST(INSTT_RECOMEND_DCSN_CNT AS REAL), 0) +
                COALESCE(CAST(INSTT_RECOMEND_PREPAR_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(TRANSR_INSTT_ENFSN_CNT AS REAL), 0) +
                COALESCE(CAST(CRSPAREA_YGMN_CNT AS REAL), 0) +
                COALESCE(CAST(CTPRVN_YGMN_CNT AS REAL), 0) +
                COALESCE(CAST(ETC_AREA_YGMN_CNT AS REAL), 0)
            ) as total_request
        FROM apt_spsply
        WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?
    `).get(houseManageNo, pblancNo) as { total_request: number | null } | null;

    // 데이터가 전혀 없으면 null 반환
    if (cmpetRows.length === 0 && !modelRow) return null;

    // 1순위/2순위 행 분리
    const rank1Row = cmpetRows.find(r => String(r.SUBSCRPT_RANK_CODE) === '1');
    const rank2Row = cmpetRows.find(r => String(r.SUBSCRPT_RANK_CODE) === '2');

    const rank1Target = rank1Row?.total_target ?? null;
    const rank1Request = rank1Row?.total_request ?? null;
    const rank2Target = rank2Row?.total_target ?? rank1Target;
    const rank2Request = rank2Row?.total_request ?? null;

    const specialTarget = modelRow?.special_supply ?? null;
    const specialRequest = specialRow?.total_request ?? null;

    const totalTarget = rank1Target ?? rank2Target;
    const totalRequest =
        (rank1Request !== null || rank2Request !== null)
            ? (rank1Request ?? 0) + (rank2Request ?? 0)
            : null;

    /** 경쟁률 = 청약건수 / 공급호수 (공급호수가 0이면 null) */
    const calcRate = (req: number | null, tgt: number | null): number | null => {
        if (req === null || tgt === null || tgt <= 0) return null;
        return req / tgt;
    };

    return {
        special: {
            rate: calcRate(specialRequest, specialTarget),
            target: specialTarget ?? undefined,
            request: specialRequest ?? undefined,
        },
        rank1: {
            rate: calcRate(rank1Request, rank1Target),
            target: rank1Target ?? undefined,
            request: rank1Request ?? undefined,
        },
        rank2: {
            rate: calcRate(rank2Request, rank2Target),
            target: rank2Target ?? undefined,
            request: rank2Request ?? undefined,
        },
        total: {
            rate: calcRate(totalRequest, totalTarget),
            target: totalTarget ?? undefined,
            request: totalRequest ?? undefined,
        },
    };
}

// ─────────────────────────────────────────────
// 4. 지도용 지역별 집계
// ─────────────────────────────────────────────

/**
 * 지도 표시용 시도별 집계 데이터를 계산합니다.
 *
 * 기존 useCompetitionMapStats 훅의 클라이언트 계산을 DB 집계로 대체합니다.
 * apt_detail과 apt_cmpet를 JOIN하여 지역별 공급 수량과 가중 평균 경쟁률을 계산합니다.
 *
 * @param params 날짜 범위 등 필터 파라미터 (SearchParams 호환)
 * @returns 지역별 통계 배열
 */
export function getMapRegionStats(
    params?: Partial<SearchParams>
): RegionStat[] {
    const db = getDb();

    const conditions: string[] = ['d.COORD_LAT IS NOT NULL'];
    const bindParams: unknown[] = [];

    if (params?.startMonth) {
        conditions.push("strftime('%Y%m', d.RCRIT_PBLANC_DE) >= ?");
        bindParams.push(params.startMonth);
    }
    if (params?.endMonth) {
        conditions.push("strftime('%Y%m', d.RCRIT_PBLANC_DE) <= ?");
        bindParams.push(params.endMonth);
    }
    if (params?.sidoCode && params.sidoCode !== '') {
        conditions.push('d.SUBSCRPT_AREA_CODE_NM = ?');
        bindParams.push(params.sidoCode);
    }
    if (params?.saleType === 'sale') {
        conditions.push("d.RENT_SECD = '0'");
    } else if (params?.saleType === 'rent') {
        conditions.push("d.RENT_SECD != '0'");
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 지역별 집계: 공급 수량 합계, 좌표 평균, 경쟁률 집계용 청약건수 합산
    const sql = `
        SELECT
            d.SUBSCRPT_AREA_CODE_NM as region,
            COUNT(DISTINCT d.HOUSE_MANAGE_NO || '_' || d.PBLANC_NO) as item_count,
            SUM(CAST(d.TOT_SUPLY_HSHLDCO AS REAL)) as total_supply,
            AVG(CAST(d.COORD_LAT AS REAL)) as avg_lat,
            AVG(CAST(d.COORD_LNG AS REAL)) as avg_lng,
            -- 가중 평균 경쟁률 계산: 전체 청약건수 / 전체 공급호수
            SUM(CAST(c.REQ_CNT AS REAL)) as total_request
        FROM apt_detail d
        LEFT JOIN apt_cmpet c
            ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND c.PBLANC_NO = d.PBLANC_NO
        ${whereClause}
        GROUP BY d.SUBSCRPT_AREA_CODE_NM
        ORDER BY total_supply DESC
    `;

    const rows = db.prepare(sql).all(...bindParams) as {
        region: string;
        item_count: number;
        total_supply: number | null;
        avg_lat: number | null;
        avg_lng: number | null;
        total_request: number | null;
    }[];

    return rows.map(row => {
        const supply = row.total_supply ?? 0;
        const request = row.total_request ?? 0;
        const competitionRate = supply > 0 && request > 0 ? request / supply : null;

        return {
            region: row.region,
            itemCount: row.item_count,
            totalSupply: supply,
            avgLat: row.avg_lat,
            avgLng: row.avg_lng,
            competitionRate,
            totalRequest: request,
        };
    });
}

// ─────────────────────────────────────────────
// 5. 대시보드 요약 통계
// ─────────────────────────────────────────────

/**
 * 대시보드 요약 통계를 계산합니다.
 *
 * 기존 useDashboardStats 훅의 클라이언트 집계를 DB 집계로 대체합니다.
 * 월별 공급/청약 현황, 주택유형별 현황, 전체 경쟁률 등을 반환합니다.
 *
 * @param params 날짜 범위 등 필터 파라미터
 * @returns DashboardStatsResult 형식의 집계 데이터
 */
export function getDashboardStats(
    params?: Partial<SearchParams>
): DashboardStatsResult {
    const db = getDb();

    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    if (params?.startMonth) {
        conditions.push("strftime('%Y%m', d.RCRIT_PBLANC_DE) >= ?");
        bindParams.push(params.startMonth);
    }
    if (params?.endMonth) {
        conditions.push("strftime('%Y%m', d.RCRIT_PBLANC_DE) <= ?");
        bindParams.push(params.endMonth);
    }
    if (params?.sidoCode && params.sidoCode !== '') {
        conditions.push('d.SUBSCRPT_AREA_CODE_NM = ?');
        bindParams.push(params.sidoCode);
    }
    if (params?.saleType === 'sale') {
        conditions.push("d.RENT_SECD = '0'");
    } else if (params?.saleType === 'rent') {
        conditions.push("d.RENT_SECD != '0'");
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // 전체 공급/청약 합계 및 단계별 집계
    const totalsSql = `
        SELECT
            SUM(CAST(d.TOT_SUPLY_HSHLDCO AS REAL)) as supply_total,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '1' THEN CAST(c.SUPLY_HSHLDCO AS REAL) END) as rank1_target,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '1' THEN CAST(c.REQ_CNT AS REAL) END) as rank1_request,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '2' THEN CAST(c.SUPLY_HSHLDCO AS REAL) END) as rank2_target,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '2' THEN CAST(c.REQ_CNT AS REAL) END) as rank2_request,
            SUM(CAST(c.REQ_CNT AS REAL)) as total_request
        FROM apt_detail d
        LEFT JOIN apt_cmpet c
            ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND c.PBLANC_NO = d.PBLANC_NO
        ${whereClause}
    `;
    const totalsRow = db.prepare(totalsSql).get(...bindParams) as {
        supply_total: number | null;
        rank1_target: number | null;
        rank1_request: number | null;
        rank2_target: number | null;
        rank2_request: number | null;
        total_request: number | null;
    } | null;

    const supplyTotal = totalsRow?.supply_total ?? 0;
    const requestTotal = totalsRow?.total_request ?? 0;
    const rank1Target = totalsRow?.rank1_target ?? 0;
    const rank1Request = totalsRow?.rank1_request ?? 0;
    const rank2Target = totalsRow?.rank2_target ?? 0;
    const rank2Request = totalsRow?.rank2_request ?? 0;

    const calcRate = (req: number, tgt: number) =>
        tgt > 0 ? Math.round((req / tgt) * 100) / 100 : 0;

    // 최고 경쟁률 단지 조회
    const maxCompSql = `
        SELECT
            d.HOUSE_NM as name,
            CAST(c.REQ_CNT AS REAL) / NULLIF(CAST(c.SUPLY_HSHLDCO AS REAL), 0) as rate
        FROM apt_detail d
        JOIN apt_cmpet c
            ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND c.PBLANC_NO = d.PBLANC_NO
        ${whereClause ? whereClause + ' AND c.SUPLY_HSHLDCO > 0' : 'WHERE c.SUPLY_HSHLDCO > 0'}
        ORDER BY rate DESC
        LIMIT 1
    `;
    const maxCompRow = db.prepare(maxCompSql).get(...bindParams) as {
        name: string;
        rate: number;
    } | null;

    // 월별 집계
    const monthlySql = `
        SELECT
            strftime('%Y-%m', d.RCRIT_PBLANC_DE) as month,
            SUM(CAST(d.TOT_SUPLY_HSHLDCO AS REAL)) as supply,
            SUM(CAST(c.REQ_CNT AS REAL)) as request,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '1' THEN CAST(c.SUPLY_HSHLDCO AS REAL) END) as rank1_supply,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '1' THEN CAST(c.REQ_CNT AS REAL) END) as rank1_request,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '2' THEN CAST(c.SUPLY_HSHLDCO AS REAL) END) as rank2_supply,
            SUM(CASE WHEN c.SUBSCRPT_RANK_CODE = '2' THEN CAST(c.REQ_CNT AS REAL) END) as rank2_request
        FROM apt_detail d
        LEFT JOIN apt_cmpet c
            ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND c.PBLANC_NO = d.PBLANC_NO
        ${whereClause}
        GROUP BY month
        ORDER BY month ASC
    `;
    const monthlyRows = db.prepare(monthlySql).all(...bindParams) as {
        month: string;
        supply: number | null;
        request: number | null;
        rank1_supply: number | null;
        rank1_request: number | null;
        rank2_supply: number | null;
        rank2_request: number | null;
    }[];

    const monthlyStats: Record<string, MonthlyStatItem> = {};
    for (const row of monthlyRows) {
        if (!row.month) continue;
        monthlyStats[row.month] = {
            supply: row.supply ?? 0,
            request: row.request ?? 0,
            special: { supply: 0, request: 0 }, // 특별공급 월별 집계는 별도 쿼리 필요시 확장
            rank1: { supply: row.rank1_supply ?? 0, request: row.rank1_request ?? 0 },
            rank2: { supply: row.rank2_supply ?? 0, request: row.rank2_request ?? 0 },
        };
    }

    // 주택유형별 집계 (HOUSE_DTL_SECD_NM 기준)
    const typeSql = `
        SELECT
            COALESCE(d.HOUSE_DTL_SECD_NM, '기타') as type_nm,
            SUM(CAST(d.TOT_SUPLY_HSHLDCO AS REAL)) as supply,
            SUM(CAST(c.REQ_CNT AS REAL)) as request
        FROM apt_detail d
        LEFT JOIN apt_cmpet c
            ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND c.PBLANC_NO = d.PBLANC_NO
        ${whereClause}
        GROUP BY d.HOUSE_DTL_SECD_NM
    `;
    const typeRows = db.prepare(typeSql).all(...bindParams) as {
        type_nm: string;
        supply: number | null;
        request: number | null;
    }[];

    const typeStats: Record<string, TypeStatItem> = {};
    for (const row of typeRows) {
        typeStats[row.type_nm] = {
            supply: row.supply ?? 0,
            request: row.request ?? 0,
        };
    }

    // 특별공급 경쟁률: apt_model + apt_spsply 기반 전체 합산
    const specialSql = `
        SELECT
            SUM(CAST(m.SPSPLY_HSHLDCO AS REAL)) as special_supply,
            SUM(
                COALESCE(CAST(s.INSTT_RECOMEND_DCSN_CNT AS REAL), 0) +
                COALESCE(CAST(s.INSTT_RECOMEND_PREPAR_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_LFE_FRST_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_MNYCH_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_NWWDS_NMTW_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_OPS_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_NWBB_NWBBSHR_CNT AS REAL), 0) +
                COALESCE(CAST(s.TRANSR_INSTT_ENFSN_CNT AS REAL), 0) +
                COALESCE(CAST(s.CRSPAREA_YGMN_CNT AS REAL), 0) +
                COALESCE(CAST(s.CTPRVN_YGMN_CNT AS REAL), 0) +
                COALESCE(CAST(s.ETC_AREA_YGMN_CNT AS REAL), 0)
            ) as special_request
        FROM apt_detail d
        JOIN apt_model m
            ON m.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND m.PBLANC_NO = d.PBLANC_NO
        LEFT JOIN apt_spsply s
            ON s.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
            AND s.PBLANC_NO = d.PBLANC_NO
        ${whereClause}
    `;
    const specialAgg = db.prepare(specialSql).get(...bindParams) as {
        special_supply: number | null;
        special_request: number | null;
    } | null;

    const specialSupply = specialAgg?.special_supply ?? 0;
    const specialRequest = specialAgg?.special_request ?? 0;

    return {
        supplyTotal,
        requestTotal,
        rateTotal: calcRate(requestTotal, supplyTotal),
        rateRank1: calcRate(rank1Request, rank1Target),
        rateRank2: calcRate(rank2Request, rank2Target),
        rateSpecial: calcRate(specialRequest, specialSupply),
        maxCompetition: {
            name: maxCompRow?.name ?? '-',
            rate: maxCompRow?.rate ?? 0,
        },
        monthlyStats,
        typeStats,
    };
}
