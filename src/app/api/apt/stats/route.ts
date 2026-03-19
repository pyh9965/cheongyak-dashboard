import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/apt/stats
 *
 * 대시보드용 통계 데이터를 반환합니다.
 * useDashboardStats 훅의 클라이언트 계산을 대체하는 서버 사이드 집계입니다.
 *
 * 쿼리 파라미터:
 *   startMonth - 시작 월 (YYYYMM)
 *   endMonth   - 종료 월 (YYYYMM)
 *   sidoCode   - 시도 코드 (선택)
 *
 * 반환값:
 *   supplyTotal    - 총 공급 세대수
 *   requestTotal   - 총 신청 건수 (1순위 기준)
 *   rateTotal      - 전체 경쟁률
 *   rateRank1      - 1순위 경쟁률
 *   rateRank2      - 2순위 경쟁률
 *   rateSpecial    - 특별공급 경쟁률
 *   maxCompetition - 최고 경쟁률
 *   monthlyStats   - 월별 통계 배열
 *   typeStats      - 주택유형별 통계 배열
 */
export async function GET(request: NextRequest) {
  // SQLite 모드가 아니면 JSON 캐시 모드 안내
  if (process.env.NEXT_PUBLIC_USE_SQLITE !== 'true') {
    return NextResponse.json(
      { error: 'SQLite mode disabled. Use client-side JSON cache.' },
      { status: 503 }
    );
  }

  try {
    const params = request.nextUrl.searchParams;

    const startMonth = params.get("startMonth")?.trim() ?? "";
    const endMonth = params.get("endMonth")?.trim() ?? "";
    const sidoCode = params.get("sidoCode")?.trim() ?? "";

    // 시도 코드 -> SUBSCRPT_AREA_CODE_NM 매핑
    const sidoNameMap: Record<string, string> = {
      "11": "서울",
      "26": "부산",
      "27": "대구",
      "28": "인천",
      "29": "광주",
      "30": "대전",
      "31": "울산",
      "36": "세종",
      "41": "경기",
      "42": "강원",
      "43": "충북",
      "44": "충남",
      "45": "전북",
      "46": "전남",
      "47": "경북",
      "48": "경남",
      "50": "제주",
    };

    // WHERE 절 구성
    const conditions: string[] = [];
    const bindParams: (string | number)[] = [];

    if (startMonth) {
      conditions.push("d.RCRIT_PBLANC_DE >= ?");
      bindParams.push(startMonth.slice(0, 4) + "-" + startMonth.slice(4, 6) + "-01");
    }
    if (endMonth) {
      conditions.push("d.RCRIT_PBLANC_DE <= ?");
      bindParams.push(endMonth.slice(0, 4) + "-" + endMonth.slice(4, 6) + "-31");
    }
    if (sidoCode && sidoCode !== "all") {
      const sidoNm = sidoNameMap[sidoCode];
      if (sidoNm) {
        conditions.push("d.SUBSCRPT_AREA_CODE_NM = ?");
        bindParams.push(sidoNm);
      }
    }

    const whereClause = conditions.length > 0
      ? "WHERE " + conditions.join(" AND ")
      : "";

    const db = getDb();

    // ─── 1. 전체 요약 통계 ───────────────────────────────────────────────────
    const summarySql = `
      SELECT
        COALESCE(SUM(d.TOT_SUPLY_HSHLDCO), 0)  AS supplyTotal,
        COUNT(*)                                  AS projectCount
      FROM apt_detail d
      ${whereClause}
    `;
    const summary = db.prepare(summarySql).get(...bindParams) as {
      supplyTotal: number;
      projectCount: number;
    };

    // ─── 2. 경쟁률 집계 (apt_cmpet JOIN) ────────────────────────────────────
    const cmpetConditions = [...conditions];
    const cmpetParams = [...bindParams];

    const cmpetWhereClause = cmpetConditions.length > 0
      ? "WHERE " + cmpetConditions.join(" AND ")
      : "";

    const cmpetSql = `
      SELECT
        c.SUBSCRPT_RANK_CODE,
        COALESCE(SUM(CAST(c.SUPLY_HSHLDCO AS INTEGER)), 0) AS targetSum,
        COALESCE(SUM(CAST(c.REQ_CNT AS INTEGER)), 0)       AS requestSum
      FROM apt_cmpet c
      INNER JOIN apt_detail d
        ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
        AND c.PBLANC_NO = d.PBLANC_NO
      ${cmpetWhereClause}
      GROUP BY c.SUBSCRPT_RANK_CODE
    `;

    const cmpetRows = db.prepare(cmpetSql).all(...cmpetParams) as Array<{
      SUBSCRPT_RANK_CODE: string | number;
      targetSum: number;
      requestSum: number;
    }>;

    let rank1Target = 0;
    let rank1Request = 0;
    let rank2Target = 0;
    let rank2Request = 0;

    cmpetRows.forEach((row) => {
      const code = Number(row.SUBSCRPT_RANK_CODE);
      if (code === 1) {
        rank1Target += row.targetSum;
        rank1Request += row.requestSum;
      } else if (code === 2) {
        rank2Target += row.targetSum;
        rank2Request += row.requestSum;
      }
    });

    const totalTarget = rank1Target + rank2Target;
    const totalRequest = rank1Request + rank2Request;

    const rateRank1 = rank1Target > 0 ? rank1Request / rank1Target : null;
    const rateRank2 = rank2Target > 0 ? rank2Request / rank2Target : null;
    const rateTotal = totalTarget > 0 ? totalRequest / totalTarget : null;

    // ─── 3. 특별공급 경쟁률 ─────────────────────────────────────────────────
    const spsplyConditions = [...conditions];
    const spsplyParams = [...bindParams];
    const spsplyWhereClause = spsplyConditions.length > 0
      ? "WHERE " + spsplyConditions.join(" AND ")
      : "";

    const spsplySql = `
      SELECT
        COALESCE(SUM(CAST(s.SPSPLY_HSHLDCO AS INTEGER)), 0) AS specialTarget,
        COALESCE(SUM(
          COALESCE(CAST(s.INSTT_RECOMEND_DCSN_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.INSTT_RECOMEND_PREPAR_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_LFE_FRST_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_LFE_FRST_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_LFE_FRST_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_MNYCH_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_MNYCH_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_MNYCH_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_NWWDS_NMTW_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_NWWDS_NMTW_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_NWWDS_NMTW_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_OPS_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_OPS_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_OPS_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_NWBB_NWBBSHR_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_NWBB_NWBBSHR_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_NWBB_NWBBSHR_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.TRANSR_INSTT_ENFSN_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CRSPAREA_YGMN_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.ETC_AREA_YGMN_CNT AS INTEGER), 0) +
          COALESCE(CAST(s.CTPRVN_YGMN_CNT AS INTEGER), 0)
        ), 0) AS specialRequest
      FROM apt_detail d
      LEFT JOIN apt_spsply s
        ON d.HOUSE_MANAGE_NO = s.HOUSE_MANAGE_NO
        AND d.PBLANC_NO = s.PBLANC_NO
      ${spsplyWhereClause}
    `;

    const spsplyRow = db.prepare(spsplySql).get(...spsplyParams) as {
      specialTarget: number;
      specialRequest: number;
    };

    const rateSpecial = spsplyRow.specialTarget > 0
      ? spsplyRow.specialRequest / spsplyRow.specialTarget
      : null;

    // ─── 4. 최고 경쟁률 ─────────────────────────────────────────────────────
    const maxCmpetSql = `
      SELECT MAX(CAST(c.REQ_CNT AS REAL) / NULLIF(CAST(c.SUPLY_HSHLDCO AS REAL), 0)) AS maxRate
      FROM apt_cmpet c
      INNER JOIN apt_detail d
        ON c.HOUSE_MANAGE_NO = d.HOUSE_MANAGE_NO
        AND c.PBLANC_NO = d.PBLANC_NO
      ${cmpetWhereClause}
    `;
    const maxRow = db.prepare(maxCmpetSql).get(...cmpetParams) as { maxRate: number | null };
    const maxCompetition = maxRow?.maxRate ?? null;

    // ─── 5. 월별 통계 ────────────────────────────────────────────────────────
    const monthlySql = `
      SELECT
        SUBSTR(d.RCRIT_PBLANC_DE, 1, 7) AS month,
        COUNT(*)                          AS projectCount,
        COALESCE(SUM(d.TOT_SUPLY_HSHLDCO), 0) AS supply
      FROM apt_detail d
      ${whereClause}
      GROUP BY SUBSTR(d.RCRIT_PBLANC_DE, 1, 7)
      ORDER BY month ASC
    `;
    const monthlyStats = db.prepare(monthlySql).all(...bindParams) as Array<{
      month: string;
      projectCount: number;
      supply: number;
    }>;

    // ─── 6. 주택유형별 통계 ─────────────────────────────────────────────────
    const typeSql = `
      SELECT
        COALESCE(d.HOUSE_DTL_SECD_NM, '기타') AS houseType,
        COUNT(*)                                AS projectCount,
        COALESCE(SUM(d.TOT_SUPLY_HSHLDCO), 0)  AS supply
      FROM apt_detail d
      ${whereClause}
      GROUP BY d.HOUSE_DTL_SECD_NM
      ORDER BY supply DESC
    `;
    const typeStats = db.prepare(typeSql).all(...bindParams) as Array<{
      houseType: string;
      projectCount: number;
      supply: number;
    }>;

    return NextResponse.json({
      supplyTotal: summary.supplyTotal,
      requestTotal: totalRequest,
      rateTotal,
      rateRank1,
      rateRank2,
      rateSpecial,
      maxCompetition,
      monthlyStats,
      typeStats,
    });
  } catch (error) {
    console.error("[/api/apt/stats] 오류:", error);
    return NextResponse.json(
      { error: "통계 조회 중 오류가 발생했습니다.", detail: String(error) },
      { status: 500 }
    );
  }
}
