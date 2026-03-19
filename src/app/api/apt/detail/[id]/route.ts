import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildApplicationRows } from "@/lib/detail-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/apt/detail/[id]
 *
 * 단일 아파트 공고의 상세 정보와 경쟁률 데이터를 반환합니다.
 * [id] 파라미터 형식: {HOUSE_MANAGE_NO}_{PBLANC_NO}
 *
 * 반환값: buildApplicationRows() 결과 — { rows, missingSpecialRequests, totals }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SQLite 모드가 아니면 JSON 캐시 모드 안내
  if (process.env.NEXT_PUBLIC_USE_SQLITE !== 'true') {
    return NextResponse.json(
      { error: 'SQLite mode disabled. Use client-side JSON cache.' },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "id 파라미터가 필요합니다. 형식: {HOUSE_MANAGE_NO}_{PBLANC_NO}" },
        { status: 400 }
      );
    }

    // id = "HOUSE_MANAGE_NO_PBLANC_NO" — 첫 번째 '_' 이후가 pblancNo일 수 없으니
    // 두 번째 '_' 기준으로 분리 (HOUSE_MANAGE_NO 자체에 '_'가 없다고 가정)
    const underscoreIdx = id.indexOf("_");
    if (underscoreIdx === -1) {
      return NextResponse.json(
        { error: "id 형식이 올바르지 않습니다. 형식: {HOUSE_MANAGE_NO}_{PBLANC_NO}" },
        { status: 400 }
      );
    }

    const houseManageNo = id.slice(0, underscoreIdx);
    const pblancNo = id.slice(underscoreIdx + 1);

    if (!houseManageNo || !pblancNo) {
      return NextResponse.json(
        { error: "HOUSE_MANAGE_NO 또는 PBLANC_NO가 비어 있습니다." },
        { status: 400 }
      );
    }

    const db = getDb();

    // 모델(평형) 데이터
    const models = db
      .prepare("SELECT * FROM apt_model WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?")
      .all(houseManageNo, pblancNo);

    // 경쟁률 데이터
    const competition = db
      .prepare("SELECT * FROM apt_cmpet WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?")
      .all(houseManageNo, pblancNo);

    // 특별공급 데이터
    const special = db
      .prepare("SELECT * FROM apt_spsply WHERE HOUSE_MANAGE_NO = ? AND PBLANC_NO = ?")
      .all(houseManageNo, pblancNo);

    if (models.length === 0 && competition.length === 0) {
      return NextResponse.json(
        { error: "해당 공고의 데이터가 존재하지 않습니다." },
        { status: 404 }
      );
    }

    // buildApplicationRows()를 그대로 사용 (데이터 무결성 보장)
    const result = buildApplicationRows(
      models as Parameters<typeof buildApplicationRows>[0],
      competition as Parameters<typeof buildApplicationRows>[1],
      special as Parameters<typeof buildApplicationRows>[2]
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/apt/detail] 오류:", error);
    return NextResponse.json(
      { error: "상세 정보 조회 중 오류가 발생했습니다.", detail: String(error) },
      { status: 500 }
    );
  }
}
