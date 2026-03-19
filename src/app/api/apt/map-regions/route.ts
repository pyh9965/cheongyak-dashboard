import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/apt/map-regions
 *
 * Choropleth 지도용 지역별 집계 데이터를 반환합니다.
 * useCompetitionMapStats 훅의 클라이언트 계산을 대체합니다.
 *
 * 쿼리 파라미터:
 *   rateType   - 경쟁률 유형: 'special' | 'rank1' | 'rank2' | 'total' (기본: 'rank1')
 *   zoom       - 줌 레벨 (기본: 8)
 *   startMonth - 시작 월 (YYYYMM)
 *   endMonth   - 종료 월 (YYYYMM)
 *   sidoCode   - 시도 코드 필터 (선택, zoom >= 9 일 때 시군구 필터링용)
 *
 * 반환값:
 *   level      - 'sido' | 'sigungu' | 'individual'
 *   items      - 집계된 지역 항목 배열
 */
export async function GET(request: NextRequest) {
  // SQLite 모드가 아니면 JSON 캐시 모드 안내
  if (process.env.NEXT_PUBLIC_USE_SQLITE !== 'true') {
    return NextResponse.json(
      { error: 'SQLite mode disabled. Use client-side JSON cache.', level: 'sido', items: [] },
      { status: 503 }
    );
  }

  try {
    const params = request.nextUrl.searchParams;

    const rateType = params.get("rateType")?.trim() || "rank1";
    const zoom = Number(params.get("zoom")) || 8;
    const startMonth = params.get("startMonth")?.trim() ?? "";
    const endMonth = params.get("endMonth")?.trim() ?? "";
    const sidoCode = params.get("sidoCode")?.trim() ?? "";

    // 시도 코드 -> 이름 매핑
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

    // 공통 WHERE 조건
    const conditions: string[] = ["d.COORD_LAT IS NOT NULL", "d.COORD_LNG IS NOT NULL"];
    const bindParams: (string | number)[] = [];

    if (startMonth) {
      conditions.push("d.RCRIT_PBLANC_DE >= ?");
      bindParams.push(startMonth.slice(0, 4) + "-" + startMonth.slice(4, 6) + "-01");
    }
    if (endMonth) {
      conditions.push("d.RCRIT_PBLANC_DE <= ?");
      bindParams.push(endMonth.slice(0, 4) + "-" + endMonth.slice(4, 6) + "-31");
    }

    const db = getDb();

    // ─── 줌 레벨에 따라 집계 단위 결정 ─────────────────────────────────────
    // zoom < 9  : 시도(광역) 단위 Choropleth
    // zoom 9-10 : 시군구 단위 Choropleth
    // zoom >= 11: 개별 아파트 마커

    if (zoom >= 11) {
      // ── 개별 아파트 마커 ─────────────────────────────────────────────────
      if (sidoCode && sidoCode !== "all") {
        const sidoNm = sidoNameMap[sidoCode];
        if (sidoNm) {
          conditions.push("d.SUBSCRPT_AREA_CODE_NM = ?");
          bindParams.push(sidoNm);
        }
      }

      const whereClause = "WHERE " + conditions.join(" AND ");

      // 경쟁률 서브쿼리: rateType에 따라 다른 순위 코드 사용
      const rankCode = rateType === "rank2" ? 2 : 1; // special/total은 rank1 기준으로 대체

      const sql = `
        SELECT
          d.HOUSE_MANAGE_NO,
          d.PBLANC_NO,
          d.HOUSE_NM,
          d.SUBSCRPT_AREA_CODE_NM  AS sido,
          d.HSSPLY_ADRES           AS address,
          d.TOT_SUPLY_HSHLDCO      AS supply,
          d.RCRIT_PBLANC_DE        AS rcritDate,
          d.COORD_LAT              AS lat,
          d.COORD_LNG              AS lng,
          cmpet.targetSum,
          cmpet.requestSum,
          CASE
            WHEN cmpet.targetSum > 0
            THEN CAST(cmpet.requestSum AS REAL) / cmpet.targetSum
            ELSE NULL
          END AS rate
        FROM apt_detail d
        LEFT JOIN (
          SELECT
            HOUSE_MANAGE_NO,
            PBLANC_NO,
            SUM(CAST(SUPLY_HSHLDCO AS INTEGER)) AS targetSum,
            SUM(CAST(REQ_CNT AS INTEGER))        AS requestSum
          FROM apt_cmpet
          WHERE SUBSCRPT_RANK_CODE = ?
          GROUP BY HOUSE_MANAGE_NO, PBLANC_NO
        ) cmpet
          ON d.HOUSE_MANAGE_NO = cmpet.HOUSE_MANAGE_NO
          AND d.PBLANC_NO = cmpet.PBLANC_NO
        ${whereClause}
        ORDER BY d.RCRIT_PBLANC_DE DESC
        LIMIT 2000
      `;

      const items = db.prepare(sql).all(rankCode, ...bindParams);

      return NextResponse.json({ level: "individual", items });
    }

    if (zoom >= 9) {
      // ── 시군구 단위 Choropleth ────────────────────────────────────────────
      if (sidoCode && sidoCode !== "all") {
        const sidoNm = sidoNameMap[sidoCode];
        if (sidoNm) {
          conditions.push("d.SUBSCRPT_AREA_CODE_NM = ?");
          bindParams.push(sidoNm);
        }
      }

      const whereClause = "WHERE " + conditions.join(" AND ");

      const rankCode = rateType === "rank2" ? 2 : 1;

      const sql = `
        SELECT
          SUBSTR(d.HSSPLY_ADRES, 1, INSTR(d.HSSPLY_ADRES || ' ', ' ') +
            INSTR(SUBSTR(d.HSSPLY_ADRES, INSTR(d.HSSPLY_ADRES, ' ') + 1) || ' ', ' ') - 1
          ) AS region,
          d.SUBSCRPT_AREA_CODE_NM AS sido,
          COUNT(*)                AS count,
          COALESCE(SUM(d.TOT_SUPLY_HSHLDCO), 0) AS supply,
          AVG(d.COORD_LAT)        AS lat,
          AVG(d.COORD_LNG)        AS lng,
          SUM(COALESCE(cmpet.targetSum, 0))  AS targetSum,
          SUM(COALESCE(cmpet.requestSum, 0)) AS requestSum,
          CASE
            WHEN SUM(COALESCE(cmpet.targetSum, 0)) > 0
            THEN CAST(SUM(COALESCE(cmpet.requestSum, 0)) AS REAL) /
                 SUM(COALESCE(cmpet.targetSum, 0))
            ELSE NULL
          END AS rate
        FROM apt_detail d
        LEFT JOIN (
          SELECT
            HOUSE_MANAGE_NO,
            PBLANC_NO,
            SUM(CAST(SUPLY_HSHLDCO AS INTEGER)) AS targetSum,
            SUM(CAST(REQ_CNT AS INTEGER))        AS requestSum
          FROM apt_cmpet
          WHERE SUBSCRPT_RANK_CODE = ?
          GROUP BY HOUSE_MANAGE_NO, PBLANC_NO
        ) cmpet
          ON d.HOUSE_MANAGE_NO = cmpet.HOUSE_MANAGE_NO
          AND d.PBLANC_NO = cmpet.PBLANC_NO
        ${whereClause}
        GROUP BY SUBSTR(d.HSSPLY_ADRES, 1, INSTR(d.HSSPLY_ADRES || ' ', ' ') +
          INSTR(SUBSTR(d.HSSPLY_ADRES, INSTR(d.HSSPLY_ADRES, ' ') + 1) || ' ', ' ') - 1
        ), d.SUBSCRPT_AREA_CODE_NM
        ORDER BY rate DESC NULLS LAST
      `;

      const items = db.prepare(sql).all(rankCode, ...bindParams);
      return NextResponse.json({ level: "sigungu", items });
    }

    // ── 시도 단위 Choropleth (zoom < 9) ──────────────────────────────────────
    const whereClause = "WHERE " + conditions.join(" AND ");
    const rankCode = rateType === "rank2" ? 2 : 1;

    const sql = `
      SELECT
        d.SUBSCRPT_AREA_CODE_NM  AS region,
        COUNT(*)                  AS count,
        COALESCE(SUM(d.TOT_SUPLY_HSHLDCO), 0) AS supply,
        AVG(d.COORD_LAT)          AS lat,
        AVG(d.COORD_LNG)          AS lng,
        SUM(COALESCE(cmpet.targetSum, 0))  AS targetSum,
        SUM(COALESCE(cmpet.requestSum, 0)) AS requestSum,
        CASE
          WHEN SUM(COALESCE(cmpet.targetSum, 0)) > 0
          THEN CAST(SUM(COALESCE(cmpet.requestSum, 0)) AS REAL) /
               SUM(COALESCE(cmpet.targetSum, 0))
          ELSE NULL
        END AS rate
      FROM apt_detail d
      LEFT JOIN (
        SELECT
          HOUSE_MANAGE_NO,
          PBLANC_NO,
          SUM(CAST(SUPLY_HSHLDCO AS INTEGER)) AS targetSum,
          SUM(CAST(REQ_CNT AS INTEGER))        AS requestSum
        FROM apt_cmpet
        WHERE SUBSCRPT_RANK_CODE = ?
        GROUP BY HOUSE_MANAGE_NO, PBLANC_NO
      ) cmpet
        ON d.HOUSE_MANAGE_NO = cmpet.HOUSE_MANAGE_NO
        AND d.PBLANC_NO = cmpet.PBLANC_NO
      ${whereClause}
      GROUP BY d.SUBSCRPT_AREA_CODE_NM
      ORDER BY rate DESC NULLS LAST
    `;

    const items = db.prepare(sql).all(rankCode, ...bindParams);
    return NextResponse.json({ level: "sido", items });
  } catch (error) {
    console.error("[/api/apt/map-regions] 오류:", error);
    return NextResponse.json(
      { error: "지도 데이터 조회 중 오류가 발생했습니다.", detail: String(error) },
      { status: 500 }
    );
  }
}
