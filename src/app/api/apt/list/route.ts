import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/apt/list
 *
 * 아파트 공고 목록을 페이지네이션으로 반환합니다.
 * JSON 캐시(loadArchiveCache)를 대체하는 SQLite 기반 엔드포인트입니다.
 *
 * 쿼리 파라미터:
 *   startMonth  - 시작 월 (YYYYMM), 기준: RCRIT_PBLANC_DE >= startMonth+'01'
 *   endMonth    - 종료 월 (YYYYMM), 기준: RCRIT_PBLANC_DE <= endMonth+'31'
 *   sidoCode    - 시도 코드 (SUBSCRPT_AREA_CODE_NM 매핑)
 *   sigungu     - 시군구 필터 (HSSPLY_ADRES LIKE)
 *   houseNm     - 주택명 필터 (HOUSE_NM LIKE)
 *   houseDtlSecd - 주택구분 코드 (HOUSE_DTL_SECD 정확 일치)
 *   saleType    - 'sale' = 분양(RENT_SECD='0'), 'rent' = 임대(RENT_SECD!='0')
 *   page        - 페이지 번호 (기본값: 1)
 *   pageSize    - 페이지당 항목 수 (기본값: 100)
 */
export async function GET(request: NextRequest) {
  // SQLite 모드가 아니면 JSON 캐시 모드 안내
  if (process.env.NEXT_PUBLIC_USE_SQLITE !== 'true') {
    return NextResponse.json(
      { error: 'SQLite mode disabled. Use client-side JSON cache.', items: [], total: 0 },
      { status: 503 }
    );
  }

  try {
    const params = request.nextUrl.searchParams;

    // 1. 파라미터 파싱
    const startMonth = params.get("startMonth")?.trim() ?? "";
    const endMonth = params.get("endMonth")?.trim() ?? "";
    const sidoCode = params.get("sidoCode")?.trim() ?? "";
    const sigungu = params.get("sigungu")?.trim() ?? "";
    const houseNm = params.get("houseNm")?.trim() ?? "";
    const houseDtlSecd = params.get("houseDtlSecd")?.trim() ?? "";
    const saleType = params.get("saleType")?.trim() ?? "";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(params.get("pageSize")) || 100));
    const offset = (page - 1) * pageSize;

    // 2. 시도 코드 -> SUBSCRPT_AREA_CODE_NM 매핑
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

    // 3. WHERE 절 동적 생성
    const conditions: string[] = [];
    const bindParams: (string | number)[] = [];

    if (startMonth) {
      conditions.push("d.RCRIT_PBLANC_DE >= ?");
      // YYYYMM → YYYY-MM-01
      bindParams.push(startMonth.slice(0, 4) + "-" + startMonth.slice(4, 6) + "-01");
    }

    if (endMonth) {
      conditions.push("d.RCRIT_PBLANC_DE <= ?");
      // YYYYMM → YYYY-MM-31 (문자열 비교이므로 31로 충분)
      bindParams.push(endMonth.slice(0, 4) + "-" + endMonth.slice(4, 6) + "-31");
    }

    if (sidoCode && sidoCode !== "all") {
      const sidoNm = sidoNameMap[sidoCode];
      if (sidoNm) {
        conditions.push("d.SUBSCRPT_AREA_CODE_NM = ?");
        bindParams.push(sidoNm);
      }
    }

    if (sigungu) {
      conditions.push("d.HSSPLY_ADRES LIKE ?");
      bindParams.push(`%${sigungu}%`);
    }

    if (houseNm) {
      conditions.push("d.HOUSE_NM LIKE ?");
      bindParams.push(`%${houseNm}%`);
    }

    if (houseDtlSecd) {
      conditions.push("d.HOUSE_DTL_SECD = ?");
      bindParams.push(houseDtlSecd);
    }

    if (saleType === "sale") {
      conditions.push("(d.RENT_SECD = '0' OR d.RENT_SECD IS NULL)");
    } else if (saleType === "rent") {
      conditions.push("d.RENT_SECD != '0' AND d.RENT_SECD IS NOT NULL");
    }

    const whereClause = conditions.length > 0
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // 4. DB 쿼리
    const db = getDb();

    // 전체 개수
    const countSql = `SELECT COUNT(*) as total FROM apt_detail d ${whereClause}`;
    const countRow = db.prepare(countSql).get(...bindParams) as { total: number };
    const total = countRow?.total ?? 0;

    // 목록 조회 (좌표는 apt_detail에 직접 포함)
    const listSql = `
      SELECT d.*
      FROM apt_detail d
      ${whereClause}
      ORDER BY d.RCRIT_PBLANC_DE DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(listSql).all(...bindParams, pageSize, offset) as Record<string, unknown>[];

    // 5. 좌표를 [lat, lng] 배열로 변환하고 원본 컬럼 제거
    const items = rows.map((row) => {
      const { COORD_LAT, COORD_LNG, ...rest } = row;
      const lat = typeof COORD_LAT === "number" ? COORD_LAT : null;
      const lng = typeof COORD_LNG === "number" ? COORD_LNG : null;
      return {
        ...rest,
        coordinates: lat !== null && lng !== null ? [lat, lng] : null,
      };
    });

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("[/api/apt/list] 오류:", error);
    return NextResponse.json(
      { error: "목록 조회 중 오류가 발생했습니다.", detail: String(error) },
      { status: 500 }
    );
  }
}
