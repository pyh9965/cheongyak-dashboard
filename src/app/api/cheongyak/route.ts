import { NextRequest, NextResponse } from "next/server";
import { fetchRebData } from "@/lib/reb";

type DatasetConfig = {
  endpoint: string;
  service?: "ApplyhomeInfoCmpetRtSvc" | "ApplyhomeInfoDetailSvc" | "ApplyhomeInfoOfferSvc";
  includePaging?: boolean;
  pagingMode?: "default" | "page";
  requiredParams?: string[];
  useHousePblancCond?: boolean;
  defaultPerPage?: number;
};

const DATASETS = {
  apt: { endpoint: "getAPTLttotPblancCmpet" },
  officetel: { endpoint: "getUrbyOfctlLttotPblancCmpet" },
  privateRent: { endpoint: "getPblPvtRentLttotPblancCmpet" },
  canceled: { endpoint: "getCancResplLttotPblancCmpet" },
  remaining: { endpoint: "getRemndrLttotPblancCmpet" },
  score: { endpoint: "getAPTLttotPblancScore" },
  special: { endpoint: "getAPTSplplyReqstStus" },

  notice: {
    endpoint: "getAPTLttotPblancDetail",
    service: "ApplyhomeInfoDetailSvc",
    includePaging: false,
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
  },

  noticeList: {
    endpoint: "getAPTLttotPblancDetail",
    service: "ApplyhomeInfoDetailSvc",
    pagingMode: "page",
    defaultPerPage: 20,
  },

  noticeModel: {
    endpoint: "getAPTLttotPblancMdl",
    service: "ApplyhomeInfoDetailSvc",
    includePaging: true,
    pagingMode: "page",
    defaultPerPage: 100,
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: true,
  },

  noticeCompetition: {
    endpoint: "getAPTLttotPblancCmpet",
    service: "ApplyhomeInfoCmpetRtSvc",
    includePaging: true,
    pagingMode: "page",
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: false,
    defaultPerPage: 100,
  },

  noticeSpecial: {
    endpoint: "getAPTSpsplyReqstStus",
    service: "ApplyhomeInfoCmpetRtSvc",
    includePaging: true,
    pagingMode: "page",
    requiredParams: ["houseManageNo", "pblancNo"],
    useHousePblancCond: false,
    defaultPerPage: 100,
  },
} as const satisfies Record<string, DatasetConfig>;

type DatasetKey = keyof typeof DATASETS;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // 1. 데이터셋 파싱
  const requestedDatasets = searchParams
    .get("dataset")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is DatasetKey => value in DATASETS)
    ?? ["noticeList"];

  // 2. 페이지네이션 파라미터
  const pageNo = Number(searchParams.get("page")) || Number(searchParams.get("pageNo")) || undefined;
  const numOfRows = Number(searchParams.get("perPage")) || Number(searchParams.get("numOfRows")) || undefined;

  // 3. 추가 파라미터 전달
  const passthroughParams: Record<string, string | number> = {};
  searchParams.forEach((value, key) => {
    if (key === "dataset" || key === "pageNo" || key === "numOfRows" || key === "page" || key === "perPage") return;
    if (value) passthroughParams[key] = value;
  });

  // 4. 병렬 호출
  const settled = await Promise.allSettled(
    requestedDatasets.map(async (dataset) => {
      const config = DATASETS[dataset];

      // 4-1. 필수 파라미터 검증
      const required = (config as DatasetConfig).requiredParams ?? [];
      const missing = required.filter((param) => {
        const value = searchParams.get(param);
        return value === null || value.trim().length === 0;
      });
      if (missing.length > 0) {
        throw new Error(`필수 파라미터 누락: ${missing.join(", ")}`);
      }

      // 4-2. 파라미터 구성
      const datasetParams: Record<string, string | number | undefined> = {
        ...passthroughParams,
      };

      // 4-3. 주택/공고 조건 처리
      if ((config as DatasetConfig).useHousePblancCond) {
        const houseManageNo = searchParams.get("houseManageNo");
        const pblancNo = searchParams.get("pblancNo");

        delete datasetParams.houseManageNo;
        delete datasetParams.pblancNo;

        if (houseManageNo) {
          datasetParams["cond[HOUSE_MANAGE_NO::EQ]"] = houseManageNo;
        }
        if (pblancNo) {
          datasetParams["cond[PBLANC_NO::EQ]"] = pblancNo;
        }
      }

      // 4-4. 검색 키워드 처리 (API가 지원하지 않을 수 있으므로 클라이언트 측 필터링으로 처리)
      // houseNm, q 등은 파라미터에서 제외하고 클라이언트 단에서 필터링함

      // 4-4-1. 지역 필터 처리 (시도 코드를 API 지역 코드로 변환)
      const sidoCode = searchParams.get("sidoCode");
      if (sidoCode && sidoCode.trim() && sidoCode.trim() !== "all") {
        // 시도 코드를 API 지역 코드로 변환
        const sidoToAreaCodeMap: Record<string, string> = {
          "11": "100", // 서울특별시
          "26": "600", // 부산광역시
          "27": "700", // 대구광역시
          "28": "400", // 인천광역시
          "29": "500", // 광주광역시
          "30": "300", // 대전광역시
          "31": "621", // 울산광역시
          "36": "338", // 세종특별자치시
          "41": "410", // 경기도
          "42": "513", // 강원도
          "43": "360", // 충청북도
          "44": "312", // 충청남도
          "45": "520", // 전라북도
          "46": "530", // 전라남도
          "47": "712", // 경상북도
          "48": "620", // 경상남도
          "50": "900", // 제주특별자치도
        };
        const areaCode = sidoToAreaCodeMap[sidoCode.trim()];
        if (areaCode) {
          datasetParams["cond[SUBSCRPT_AREA_CODE::EQ]"] = areaCode;
        }
        delete datasetParams.sidoCode;
      }

      // 4-4-2. 주택구분 필터 처리
      const houseDtlSecd = searchParams.get("houseDtlSecd");
      if (houseDtlSecd && houseDtlSecd.trim()) {
        datasetParams["cond[HOUSE_DTL_SECD::EQ]"] = houseDtlSecd.trim();
        delete datasetParams.houseDtlSecd;
      }

      // 4-4-3. 날짜 필터 처리 (이미 조건식으로 전달된 경우 유지)
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      const rcritGte = searchParams.get("cond[RCRIT_PBLANC_DE::GTE]");
      const rcritLte = searchParams.get("cond[RCRIT_PBLANC_DE::LTE]");

      if (rcritGte) {
        datasetParams["cond[RCRIT_PBLANC_DE::GTE]"] = rcritGte;
        delete datasetParams.startDate;
      } else if (startDate) {
        datasetParams["cond[RCRIT_PBLANC_DE::GTE]"] = startDate;
        delete datasetParams.startDate;
      }

      if (rcritLte) {
        datasetParams["cond[RCRIT_PBLANC_DE::LTE]"] = rcritLte;
        delete datasetParams.endDate;
      } else if (endDate) {
        datasetParams["cond[RCRIT_PBLANC_DE::LTE]"] = endDate;
        delete datasetParams.endDate;
      }

      // 4-5. 페이지네이션 처리
      const pagingMode = (config as DatasetConfig).pagingMode ?? "default";
      if (pagingMode === "page") {
        datasetParams.page = pageNo ?? 1;
        datasetParams.perPage = numOfRows ?? (config as DatasetConfig).defaultPerPage ?? 10;
      }

      if ((config as DatasetConfig).includePaging !== false && pagingMode !== "page") {
        datasetParams.pageNo = pageNo ?? 1;
        datasetParams.numOfRows = numOfRows ?? (config as DatasetConfig).defaultPerPage ?? 10;
      }

      // 4-6. API 호출
      const response = await fetchRebData(
        (config as DatasetConfig).endpoint,
        datasetParams,
        { service: (config as DatasetConfig).service, includePaging: (config as DatasetConfig).includePaging !== false }
      );

      // 4-7. 메타데이터 추출
      const metadata: Record<string, unknown> = {};
      if (response && typeof response === "object") {
        const metaSource = response as Record<string, unknown>;
        const metaKeys = [
          "page", "perPage", "currentCount", "totalCount",
          "matchCount", "pageNo", "numOfRows",
        ];
        for (const key of metaKeys) {
          const value = metaSource[key];
          if (value !== undefined && value !== null && value !== "") {
            metadata[key] = value;
          }
        }
      }

      // 4-8. 데이터 추출
      let rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.body)
          ? response.body
          : response?.data
            ? [response.data]
            : [];

      // 4-9. noticeCompetition과 noticeSpecial의 경우 클라이언트 측 필터링
      if ((dataset === "noticeCompetition" || dataset === "noticeSpecial") &&
          searchParams.get("houseManageNo") && searchParams.get("pblancNo")) {
        const targetHouseNo = searchParams.get("houseManageNo");
        const targetPblancNo = searchParams.get("pblancNo");
        rows = rows.filter((row: any) =>
          String(row.HOUSE_MANAGE_NO) === targetHouseNo &&
          String(row.PBLANC_NO) === targetPblancNo
        );
      }

      return {
        dataset,
        rows,
        metadata,
      } as const;
    })
  );

  // 5. 결과 정리
  const datasets: Partial<Record<DatasetKey, unknown[]>> = {};
  const metadata: Partial<Record<DatasetKey, Record<string, unknown>>> = {};
  const errors: Partial<Record<DatasetKey, string>> = {};

  let successCount = 0;

  settled.forEach((result, index) => {
    const dataset = requestedDatasets[index];
    if (!dataset) return;

    if (result.status === "fulfilled") {
      datasets[dataset] = result.value.rows;
      if (Object.keys(result.value.metadata).length > 0) {
        metadata[dataset] = result.value.metadata;
      }
      successCount += 1;
    } else {
      const reason = result.reason;
      errors[dataset] = reason instanceof Error ? reason.message : "알 수 없는 오류";
    }
  });

  const status = successCount > 0 ? 200 : 502;

  // 6. 응답 반환
  return NextResponse.json(
    {
      datasets,
      metadata,
      errors,
      error: successCount > 0 ? undefined : "요청한 모든 데이터셋 조회에 실패했습니다.",
    },
    { status }
  );
}

