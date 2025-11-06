"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { buildApplicationRows, type NoticeModelApiRow, type NoticeCompetitionApiRow, type NoticeSpecialApiRow } from "@/lib/detail-data";
import { formatNumber, formatPriceTenThousand, formatRate, formatDifference, formatSpecialRequestEntries, formatValue } from "@/lib/detail-utils";
import ExportExcelButton from "@/components/ExportExcelButton";

type AptInfo = {
  HOUSE_NM: string;
  BSNS_MBY_NM: string;
  BSNS_MBY_TELNO: string;
  RCRIT_PBLANC_DE: string;
  RCEPT_BGNDE: string;
  RCEPT_ENDDE: string;
  PRZWNER_PRESNATN_DE: string;
  SUBSCRPT_AREA_CODE_NM: string;
  HOUSE_DTL_SECD_NM: string;
  HOUSE_MANAGE_NO?: string;
  PBLANC_NO?: string;
  [key: string]: any;
};

type NoticeDetailRow = Record<string, unknown>;

type ApiResponse = {
  datasets: {
    noticeList?: AptInfo[];
  };
  metadata: {
    noticeList?: {
      page: number;
      perPage: number;
      totalCount: number;
      currentCount: number;
    };
  };
  errors: Record<string, string>;
};

export default function APTPage() {
  const urlSearchParams = useSearchParams();
  
  // 기본 날짜 설정: 5년 전부터 현재까지
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const fiveYearsAgo = new Date(currentYear - 5, currentMonth - 1, 1);
  const defaultStartMonth = `${fiveYearsAgo.getFullYear()}-${String(fiveYearsAgo.getMonth() + 1).padStart(2, '0')}`;
  const defaultEndMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // URL 파라미터에서 초기값 읽기
  const [searchParams, setSearchParams] = useState({
    houseNm: urlSearchParams.get("houseNm") || "",
    sidoCode: urlSearchParams.get("sidoCode") || "",
    houseDtlSecd: urlSearchParams.get("houseDtlSecd") || "",
    startMonth: urlSearchParams.get("startMonth") || defaultStartMonth,
    endMonth: urlSearchParams.get("endMonth") || defaultEndMonth,
    saleType: urlSearchParams.get("saleType") || "all",
  });
  const [data, setData] = useState<AptInfo[]>([]);
  const [metadata, setMetadata] = useState<ApiResponse["metadata"]["noticeList"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(Number(urlSearchParams.get("page")) || 1);
  
  // 상세정보 상태
  const [selectedItem, setSelectedItem] = useState<AptInfo | null>(null);
  const [detailRows, setDetailRows] = useState<NoticeDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [datasetErrors, setDatasetErrors] = useState<Record<string, string>>({});
  const [applicationRows, setApplicationRows] = useState<any[]>([]);
  const [missingSpecialRequestData, setMissingSpecialRequestData] = useState(false);
  const [applicationTotals, setApplicationTotals] = useState<any | null>(null);

  // 페이지 로드 시 자동으로 조회 (URL 파라미터 반영)
  useEffect(() => {
    const urlSidoCode = urlSearchParams.get("sidoCode") || "";
    const urlHouseNm = urlSearchParams.get("houseNm") || "";
    const urlHouseDtlSecd = urlSearchParams.get("houseDtlSecd") || "";
    const urlStartMonth = urlSearchParams.get("startMonth") || defaultStartMonth;
    const urlEndMonth = urlSearchParams.get("endMonth") || defaultEndMonth;
    const urlSaleType = urlSearchParams.get("saleType") || "all";
    const urlPage = Number(urlSearchParams.get("page")) || 1;
    
    // URL 파라미터로 상태 업데이트
    setSearchParams({
      houseNm: urlHouseNm,
      sidoCode: urlSidoCode,
      houseDtlSecd: urlHouseDtlSecd,
      startMonth: urlStartMonth,
      endMonth: urlEndMonth,
      saleType: urlSaleType,
    });
    setCurrentPage(urlPage);
    
    // URL 파라미터를 사용하여 검색 실행
    handleSearch(urlPage, {
      houseNm: urlHouseNm,
      sidoCode: urlSidoCode,
      houseDtlSecd: urlHouseDtlSecd,
      startMonth: urlStartMonth,
      endMonth: urlEndMonth,
      saleType: urlSaleType,
    });
  }, []);

  const handleSearch = async (page: number = 1, overrideParams?: typeof searchParams) => {
    setLoading(true);
    setError("");
    setCurrentPage(page);

    const paramsToUse = overrideParams || searchParams;

    try {
      const params = new URLSearchParams();
      params.set("dataset", "noticeList");
      params.set("page", String(page));
      // 지역 필터나 주택명 검색이 있을 때는 더 많은 데이터를 가져와서 정확한 개수 계산
      const hasFilter = (paramsToUse.sidoCode && paramsToUse.sidoCode.trim() && paramsToUse.sidoCode.trim() !== "all") ||
                        (paramsToUse.houseNm && paramsToUse.houseNm.trim());
      const perPage = hasFilter ? "200" : "10";
      params.set("perPage", perPage);
      
      if (paramsToUse.houseNm) {
        params.set("houseNm", paramsToUse.houseNm);
      }
      if (paramsToUse.sidoCode) {
        params.set("sidoCode", paramsToUse.sidoCode);
      }
      if (paramsToUse.houseDtlSecd) {
        params.set("houseDtlSecd", paramsToUse.houseDtlSecd);
      }

      // 날짜 범위 파라미터 추가
      if (paramsToUse.startMonth) {
        // 시작일: 해당 월의 1일
        const [startYear, startMonth] = paramsToUse.startMonth.split('-');
        params.set("startDate", `${startYear}${startMonth}01`);
        // 모집공고일 범위 필터링을 위한 조건식
        params.set("cond[RCRIT_PBLANC_DE::GTE]", `${startYear}${startMonth}01`);
      }
      if (paramsToUse.endMonth) {
        // 종료일: 해당 월의 마지막 일
        const [endYear, endMonth] = paramsToUse.endMonth.split('-');
        const lastDay = new Date(parseInt(endYear), parseInt(endMonth), 0).getDate();
        params.set("endDate", `${endYear}${endMonth}${String(lastDay).padStart(2, '0')}`);
        params.set("cond[RCRIT_PBLANC_DE::LTE]", `${endYear}${endMonth}${String(lastDay).padStart(2, '0')}`);
      }

      const res = await fetch(`/api/cheongyak?${params.toString()}`);
      const json: ApiResponse = await res.json();

      if (json.errors && Object.keys(json.errors).length > 0) {
        setError(Object.values(json.errors)[0]);
        setData([]);
      } else {
        let filteredData = json.datasets.noticeList || [];
        
        // 주택명 검색은 클라이언트 측에서 필터링 (API가 지원하지 않을 수 있음)
        if (paramsToUse.houseNm && paramsToUse.houseNm.trim()) {
          const searchKeyword = paramsToUse.houseNm.trim().toLowerCase();
          filteredData = filteredData.filter((item: AptInfo) => {
            const houseNm = (item.HOUSE_NM || "").toLowerCase();
            const bsnsMbyNm = (item.BSNS_MBY_NM || "").toLowerCase(); // 시공사명
            return houseNm.includes(searchKeyword) || bsnsMbyNm.includes(searchKeyword);
          });
        }
        
        setData(filteredData);
        // 메타데이터 업데이트
        const originalMetadata = json.metadata.noticeList;
        
        // 지역 필터나 주택명 검색이 있을 때는 실제 필터링된 데이터 개수로 totalCount 업데이트
        const hasFilter = (paramsToUse.sidoCode && paramsToUse.sidoCode.trim() && paramsToUse.sidoCode.trim() !== "all") ||
                          (paramsToUse.houseNm && paramsToUse.houseNm.trim());
        
        if (hasFilter) {
          // 필터가 적용되었을 때는 실제 필터링된 데이터 개수를 totalCount로 사용
          // 단, 현재 페이지의 데이터만 필터링했으므로, 전체 개수를 정확히 알기 위해서는
          // 첫 페이지에서 더 많은 데이터를 가져와야 함
          if (page === 1 && perPage === "200") {
            // 첫 페이지에서 200개를 가져왔으므로, 필터링된 개수가 전체 개수
            setMetadata({
              ...originalMetadata,
              currentCount: filteredData.length,
              totalCount: filteredData.length,
            });
          } else {
            // 다른 페이지에서는 원본 메타데이터 사용 (정확한 개수는 첫 페이지에서 계산됨)
            setMetadata({
              ...originalMetadata,
              currentCount: filteredData.length,
            });
          }
        } else {
          // 필터가 없을 때는 원본 메타데이터 유지
          setMetadata(originalMetadata);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(1);
  };

  // 상세정보 조회 함수
  const fetchDetail = useCallback(async (houseManageNo: string, pblancNo: string) => {
    if (!houseManageNo || !pblancNo) {
      setDetailRows([]);
      setDetailError("상세 조회에 필요한 식별자가 없습니다.");
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);
    setDatasetErrors({});
    setApplicationRows([]);
    setMissingSpecialRequestData(false);

    try {
      const params = new URLSearchParams({
        dataset: "notice,noticeModel,noticeCompetition,noticeSpecial",
        houseManageNo,
        pblancNo,
      });
      const res = await fetch(`/api/cheongyak?${params.toString()}`);
      let json: any = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (json.errors) {
        setDatasetErrors(json.errors);
      } else {
        setDatasetErrors({});
      }

      if (!res.ok) {
        const message = typeof json.error === "string" && json.error.trim().length > 0 
          ? json.error 
          : `API 요청 실패 (${res.status})`;
        throw new Error(message);
      }

      const rows = Array.isArray(json.datasets?.notice) 
        ? (json.datasets.notice as NoticeDetailRow[]) 
        : [];
      setDetailRows(rows);

      const modelRows = Array.isArray(json.datasets?.noticeModel) 
        ? (json.datasets.noticeModel as NoticeModelApiRow[]) 
        : [];
      const competitionRows = Array.isArray(json.datasets?.noticeCompetition) 
        ? (json.datasets.noticeCompetition as NoticeCompetitionApiRow[]) 
        : [];
      const specialRows = Array.isArray(json.datasets?.noticeSpecial) 
        ? (json.datasets.noticeSpecial as NoticeSpecialApiRow[]) 
        : [];
      
      const { rows: applicationSummary, missingSpecialRequests, totals } = buildApplicationRows(
        modelRows, 
        competitionRows, 
        specialRows
      );
      setApplicationRows(applicationSummary);
      setMissingSpecialRequestData(missingSpecialRequests);
      setApplicationTotals(totals);
    } catch (err) {
      const message = err instanceof Error ? err.message : "상세 데이터를 불러오지 못했습니다.";
      setDetailError(message);
      setDetailRows([]);
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      setApplicationTotals(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 선택된 항목 변경 시 상세정보 조회
  useEffect(() => {
    if (!selectedItem?.HOUSE_MANAGE_NO || !selectedItem?.PBLANC_NO) {
      setDetailRows([]);
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      setApplicationTotals(null);
      return;
    }
    void fetchDetail(String(selectedItem.HOUSE_MANAGE_NO), String(selectedItem.PBLANC_NO));
  }, [fetchDetail, selectedItem]);

  const totalPages = metadata ? Math.ceil(metadata.totalCount / metadata.perPage) : 0;

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#1a1a1a" }}>
        APT 분양정보 및 경쟁률 조회
      </h1>
      
      <div style={{ 
        padding: "16px 20px", 
        backgroundColor: "#fff9e6", 
        border: "1px solid #ffd700",
        borderRadius: "6px",
        marginBottom: "32px",
        fontSize: "14px",
        lineHeight: "1.6",
        color: "#5c4a00"
      }}>
        <p style={{ margin: 0 }}>
          <strong>안내:</strong> 청약 예정 또는 과거 5년 이내 공급주택의 분양정보와 경쟁률을 조회할 수 있습니다.
        </p>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
          주택 조회
        </h2>
        <SearchForm 
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>

      <div>
        <h2 style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}>
          조회 결과
        </h2>
        {error && (
          <div style={{ 
            padding: "16px 20px", 
            backgroundColor: "#fee2e2", 
            border: "1px solid #ef4444",
            borderRadius: "6px",
            marginBottom: "20px",
            color: "#991b1b",
            fontSize: "14px",
            lineHeight: "1.5"
          }}>
            <strong>오류가 발생했습니다:</strong> {error}
          </div>
        )}
        <SearchResults 
          data={data} 
          loading={loading}
          totalCount={metadata?.totalCount || 0}
          onHouseNameClick={(item) => setSelectedItem(item)}
        />
        {totalPages > 1 && (
          <Pagination 
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handleSearch}
          />
        )}
        
        {/* 상세정보 모달 */}
        {selectedItem && (
          <DetailModal
            item={selectedItem}
            detailRows={detailRows}
            detailLoading={detailLoading}
            detailError={detailError}
            datasetErrors={datasetErrors}
            applicationRows={applicationRows}
            missingSpecialRequestData={missingSpecialRequestData}
            applicationTotals={applicationTotals}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </div>
  );
}

function SearchForm({
  searchParams,
  setSearchParams,
  onSubmit,
  loading,
}: {
  searchParams: any;
  setSearchParams: any;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  // 과거 5년부터 미래 12개월까지 선택 가능
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const startYear = currentYear - 5;
  const startMonth = currentMonth;
  const totalMonths = 5 * 12 + 12; // 과거 5년 + 미래 12개월
  
  const months = [];
  for (let i = 0; i < totalMonths; i++) {
    const date = new Date(startYear, startMonth - 1 + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    months.push({ value: `${year}-${month}`, label: `${year}년 ${month}월` });
  }

  return (
    <div style={{ 
      border: "1px solid #ddd", 
      borderRadius: "4px", 
      padding: "20px",
      backgroundColor: "#f9f9f9"
    }}>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: "18px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ minWidth: "100px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
            조회 기간:
          </label>
          <select 
            value={searchParams.startMonth}
            onChange={(e) => setSearchParams({ ...searchParams, startMonth: e.target.value })}
            style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "14px" }}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <span style={{ fontSize: "14px", color: "#666" }}>~</span>
          <select 
            value={searchParams.endMonth}
            onChange={(e) => setSearchParams({ ...searchParams, endMonth: e.target.value })}
            style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd", fontSize: "14px" }}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "18px", display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ minWidth: "100px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
            주택 구분:
          </label>
          <select 
            value={searchParams.houseDtlSecd}
            onChange={(e) => setSearchParams({ ...searchParams, houseDtlSecd: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ddd", flex: 1 }}
          >
            <option value="">전체</option>
            <option value="01">국민</option>
            <option value="02">민영</option>
          </select>
        </div>

        <div style={{ marginBottom: "18px", display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ minWidth: "100px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
            공급 지역:
          </label>
          <select 
            value={searchParams.sidoCode}
            onChange={(e) => setSearchParams({ ...searchParams, sidoCode: e.target.value })}
            style={{ padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd", flex: 1, fontSize: "14px" }}
          >
            <option value="">전체</option>
            <option value="11">서울특별시</option>
            <option value="26">부산광역시</option>
            <option value="27">대구광역시</option>
            <option value="28">인천광역시</option>
            <option value="29">광주광역시</option>
            <option value="30">대전광역시</option>
            <option value="31">울산광역시</option>
            <option value="36">세종특별자치시</option>
            <option value="41">경기도</option>
            <option value="42">강원도</option>
            <option value="43">충청북도</option>
            <option value="44">충청남도</option>
            <option value="45">전라북도</option>
            <option value="46">전라남도</option>
            <option value="47">경상북도</option>
            <option value="48">경상남도</option>
            <option value="50">제주특별자치도</option>
          </select>
        </div>

        <div style={{ marginBottom: "18px", display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ minWidth: "100px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
            주택명 또는 시공사명:
          </label>
          <input 
            type="text" 
            value={searchParams.houseNm}
            onChange={(e) => setSearchParams({ ...searchParams, houseNm: e.target.value })}
            style={{ 
              padding: "8px 12px", 
              borderRadius: "4px", 
              border: "1px solid #ddd", 
              flex: 1,
              fontSize: "14px"
            }}
            placeholder="주택명 또는 시공사명을 입력하세요"
          />
          <button 
            type="submit"
            disabled={loading}
            style={{ 
              padding: "8px 24px", 
              backgroundColor: loading ? "#999" : "#0066cc", 
              color: "white", 
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500",
              minWidth: "80px"
            }}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ marginRight: "20px", fontSize: "14px", fontWeight: "500", color: "#333" }}>
            분양·임대 구분:
          </label>
          <label style={{ marginRight: "20px", fontSize: "14px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="saleType" 
              value="all" 
              checked={searchParams.saleType === "all"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              style={{ marginRight: "6px" }}
            /> 전체
          </label>
          <label style={{ marginRight: "20px", fontSize: "14px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="saleType" 
              value="sale"
              checked={searchParams.saleType === "sale"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              style={{ marginRight: "6px" }}
            /> 분양주택
          </label>
          <label style={{ marginRight: "20px", fontSize: "14px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="saleType" 
              value="rent"
              checked={searchParams.saleType === "rent"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              style={{ marginRight: "6px" }}
            /> 분양전환 가능임대
          </label>
          <label style={{ fontSize: "14px", cursor: "pointer" }}>
            <input 
              type="radio" 
              name="saleType" 
              value="rentNo"
              checked={searchParams.saleType === "rentNo"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              style={{ marginRight: "6px" }}
            /> 분양전환 불가임대
          </label>
        </div>

        <button 
          type="button"
          style={{ 
            padding: "10px 24px", 
            backgroundColor: "#ffd700", 
            color: "#333", 
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "600",
            fontSize: "14px"
          }}
        >
          알림 설정
        </button>
      </form>
    </div>
  );
}

function SearchResults({
  data,
  loading,
  totalCount,
  onHouseNameClick,
}: {
  data: AptInfo[];
  loading: boolean;
  totalCount: number;
  onHouseNameClick: (item: AptInfo) => void;
}) {
  return (
    <div>
      <div style={{ 
        marginBottom: "16px", 
        padding: "12px 16px",
        backgroundColor: "#f8f9fa",
        borderRadius: "4px",
        fontSize: "13px", 
        lineHeight: "1.6",
        color: "#495057"
      }}>
        <p style={{ margin: "0 0 8px 0" }}>
          • 주택명을 클릭하면 입주자모집공고 상세 정보를 확인할 수 있습니다.
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          • 주택명, 청약기간, 당첨자발표 컬럼 헤더를 클릭하면 오름차순/내림차순으로 정렬됩니다.
        </p>
        <p style={{ margin: 0 }}>
          • 본 정보는 참고용이며, 청약 신청 시 반드시 해당 입주자모집공고 내용을 확인하시기 바랍니다.
        </p>
      </div>

      <div style={{ textAlign: "right", marginBottom: "12px" }}>
        <strong style={{ fontSize: "14px", color: "#333" }}>총 {totalCount.toLocaleString()}건</strong>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ 
          width: "100%", 
          borderCollapse: "collapse", 
          border: "1px solid #ddd",
          backgroundColor: "white",
          tableLayout: "fixed",
          minWidth: "1200px"
        }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "5%" }}>지역</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "6%" }}>주택구분</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "6%" }}>분양/임대</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", cursor: "pointer", width: "22%", whiteSpace: "normal", lineHeight: "1.4" }}>
                주택명 <span style={{ fontSize: "11px", color: "#999" }}>↕</span>
              </th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "normal", width: "12%", wordBreak: "break-word" }}>시공사</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "6%" }}>문의처</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "8%" }}>모집공고일</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", cursor: "pointer", whiteSpace: "normal", width: "9%", wordBreak: "break-word" }}>
                청약기간 <span style={{ fontSize: "11px", color: "#999" }}>↕</span>
              </th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", width: "8%" }}>
                당첨자발표 <span style={{ fontSize: "11px", color: "#999" }}>↕</span>
              </th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "normal", width: "10%", wordBreak: "break-word" }}>특별공급 신청현황</th>
              <th style={{ padding: "12px", border: "1px solid #ddd", textAlign: "left", whiteSpace: "nowrap", width: "8%" }}>1·2순위 경쟁률</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ padding: "40px", textAlign: "center" }}>
                  조회 중...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: "60px 40px", textAlign: "center", color: "#999", fontSize: "14px" }}>
                  조회 결과가 없습니다.<br />
                  <span style={{ fontSize: "13px", color: "#bbb", marginTop: "8px", display: "inline-block" }}>
                    검색 조건을 변경하여 다시 조회해 주세요.
                  </span>
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr key={index}>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {item.SUBSCRPT_AREA_CODE_NM || "-"}
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {item.HOUSE_DTL_SECD_NM || "-"}
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>분양주택</td>
                  <td 
                    className="house-name-cell"
                    style={{ 
                      padding: "12px", 
                      border: "1px solid #ddd",
                      verticalAlign: "top",
                      cursor: "pointer",
                      color: "#0066cc"
                    }}
                    onClick={() => {
                      if (item.HOUSE_MANAGE_NO && item.PBLANC_NO) {
                        onHouseNameClick(item);
                      }
                    }}
                  >
                    <div className="house-name-text" style={{ textDecoration: "underline" }}>
                      {item.HOUSE_NM || "-"}
                    </div>
                  </td>
                  <td 
                    className="constructor-cell"
                    style={{ 
                      padding: "12px", 
                      border: "1px solid #ddd",
                      verticalAlign: "top"
                    }}
                  >
                    <div className="constructor-text">
                      {item.BSNS_MBY_NM || "-"}
                    </div>
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {item.BSNS_MBY_TELNO || "-"}
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {item.RCRIT_PBLANC_DE || "-"}
                  </td>
                  <td style={{ 
                    padding: "12px", 
                    border: "1px solid #ddd", 
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    lineHeight: "1.4"
                  }}>
                    {item.RCEPT_BGNDE && item.RCEPT_ENDDE 
                      ? `${item.RCEPT_BGNDE} ~ ${item.RCEPT_ENDDE}`
                      : "-"}
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>
                    {item.PRZWNER_PRESNATN_DE || "-"}
                  </td>
                  <td style={{ 
                    padding: "12px", 
                    border: "1px solid #ddd", 
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    lineHeight: "1.4"
                  }}>
                    사업주체문의
                  </td>
                  <td style={{ padding: "12px", border: "1px solid #ddd", whiteSpace: "nowrap" }}>경쟁률</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = [];
  const startPage = Math.max(1, currentPage - 5);
  const endPage = Math.min(totalPages, startPage + 9);

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div style={{ 
      marginTop: "20px", 
      display: "flex", 
      justifyContent: "center", 
      gap: "5px",
      alignItems: "center"
    }}>
      <button 
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        style={{ 
          padding: "5px 10px", 
          border: "1px solid #ddd", 
          backgroundColor: "white", 
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          opacity: currentPage === 1 ? 0.5 : 1
        }}
      >
        &lt;&lt;
      </button>
      <button 
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        style={{ 
          padding: "5px 10px", 
          border: "1px solid #ddd", 
          backgroundColor: "white", 
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          opacity: currentPage === 1 ? 0.5 : 1
        }}
      >
        &lt;
      </button>
      {pages.map((num) => (
        <button 
          key={num}
          onClick={() => onPageChange(num)}
          style={{ 
            padding: "5px 10px", 
            border: "1px solid #ddd", 
            backgroundColor: num === currentPage ? "#0066cc" : "white",
            color: num === currentPage ? "white" : "black",
            cursor: "pointer"
          }}
        >
          {num}
        </button>
      ))}
      <button 
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{ 
          padding: "5px 10px", 
          border: "1px solid #ddd", 
          backgroundColor: "white", 
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          opacity: currentPage === totalPages ? 0.5 : 1
        }}
      >
        &gt;
      </button>
      <button 
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        style={{ 
          padding: "5px 10px", 
          border: "1px solid #ddd", 
          backgroundColor: "white", 
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          opacity: currentPage === totalPages ? 0.5 : 1
        }}
      >
        &gt;&gt;
      </button>
    </div>
  );
}

// 상세정보 모달 컴포넌트
function DetailModal({
  item,
  detailRows,
  detailLoading,
  detailError,
  datasetErrors,
  applicationRows,
  missingSpecialRequestData,
  applicationTotals,
  onClose,
}: {
  item: AptInfo;
  detailRows: NoticeDetailRow[];
  detailLoading: boolean;
  detailError: string | null;
  datasetErrors: Record<string, string>;
  applicationRows: any[];
  missingSpecialRequestData: boolean;
  applicationTotals: any | null;
  onClose: () => void;
}) {
  const FIELD_SECTIONS = [
    {
      title: "기본 정보",
      fields: [
        { key: "HOUSE_NM", label: "주택명" },
        { key: "HSSPLY_ADRES", label: "공급위치" },
        { key: "TOT_SUPLY_HSHLDCO", label: "총 공급 세대수" },
        { key: "SUPLY_AR", label: "공급 규모" },
        { key: "HMPG_URL", label: "모집공고 URL" },
        { key: "BSNS_MBY_NM", label: "사업주체" },
        { key: "BSNS_MBY_TELNO", label: "사업주체 문의처" },
        { key: "MNGT_INSTT_NM", label: "관리기관" },
        { key: "MNGT_INSTT_TELNO", label: "관리기관 문의처" },
      ],
    },
    {
      title: "청약 일정",
      fields: [
        { key: "RCEPT_BGNDE", label: "청약접수 시작" },
        { key: "RCEPT_ENDDE", label: "청약접수 종료" },
        { key: "PRZWNER_PRESNATN_DE", label: "당첨자 발표일" },
        { key: "CNTRCT_CNCLS_BGNDE", label: "계약 시작" },
        { key: "CNTRCT_CNCLS_ENDDE", label: "계약 종료" },
        { key: "SUBSCRPT_AREA_CODE_NM", label: "접수 지역" },
        { key: "RCEPT_SE_NM", label: "접수 방식" },
        { key: "RCEPT_PLACE", label: "접수 장소" },
      ],
    },
  ];

  function buildSectionData(row: NoticeDetailRow) {
    const usedKeys = new Set<string>();
    
    const sections = FIELD_SECTIONS.map(({ title, fields }) => {
      const items = fields
        .map(({ key, label }) => {
          const value = row[key];
          if (value === undefined || value === null || value === "") {
            return null;
          }
          usedKeys.add(key);
          return { key, label, value };
        })
        .filter((item): item is { key: string; label: string; value: unknown } => item !== null);
      return { title, items };
    });

    return sections.filter((section) => section.items.length > 0);
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          maxWidth: "1200px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "24px",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "8px 16px",
            backgroundColor: "#f0f0f0",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
          title="모달 닫기"
        >
          ✕
        </button>

        <h2 style={{ marginBottom: "24px", fontSize: "24px", fontWeight: "600" }}>
          {item.HOUSE_NM || "상세 정보"}
        </h2>

        {detailLoading && (
          <div style={{ padding: "40px", textAlign: "center" }}>조회 중...</div>
        )}

        {detailError && (
          <div style={{ 
            padding: "16px 20px", 
            backgroundColor: "#fee2e2", 
            border: "1px solid #ef4444",
            borderRadius: "6px",
            marginBottom: "20px",
            color: "#991b1b",
          }}>
            <strong>오류:</strong> {detailError}
          </div>
        )}

        {Object.entries(datasetErrors).map(([key, error]) => (
          <div key={key} style={{ 
            marginBottom: "16px", 
            padding: "14px", 
            background: "#fef3c7", 
            border: "1px solid #fde68a", 
            borderRadius: "10px", 
            color: "#92400e", 
            fontSize: "14px" 
          }}>
            {key} 조회 오류: {error}
          </div>
        ))}

        {detailRows.map((row, index) => {
          const sections = buildSectionData(row);
          return (
            <article key={index} style={{ marginBottom: 32, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              <header style={{ padding: "16px 20px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>{String(row["HOUSE_NM"] ?? "모집공고")}</h3>
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  주택관리번호 {formatValue(row["HOUSE_MANAGE_NO"])}, 모집공고번호 {formatValue(row["PBLANC_NO"])}
                </p>
              </header>

              {sections.map((section) => (
                <section key={section.title} style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                  <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{section.title}</h4>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {section.items.map((item) => (
                        <tr key={item.key}>
                          <th style={{ width: "35%", textAlign: "left", padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600 }}>
                            {item.label}
                          </th>
                          <td style={{ padding: "8px 12px", border: "1px solid #e5e7eb", fontSize: 13, color: "#374151" }}>
                            {formatValue(item.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </article>
          );
        })}

        {/* 청약 접수 결과 테이블 */}
        {applicationRows.length > 0 && (
          <section style={{ marginTop: 24, marginBottom: 24, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
            <header style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>청약 접수 결과</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  API 제공 데이터 기준(대상·접수·경쟁률, 특별공급 실접수 포함)으로 구성했습니다.
                </p>
              </div>
              <ExportExcelButton 
                rows={applicationRows} 
                totals={applicationTotals}
                houseName={item.HOUSE_NM}
              />
            </header>
            
            <div className="table-responsive" style={{ overflowX: "auto" }}>
              <table className="table-results" style={{ minWidth: 1100 }}>
                <colgroup>
                  <col style={{ width: "100px" }} /> {/* 타입 */}
                  <col style={{ width: "90px" }} /> {/* 공급면적 */}
                  <col style={{ width: "90px" }} /> {/* 공급평형 */}
                  <col style={{ width: "70px" }} /> {/* 공급 일반 */}
                  <col style={{ width: "70px" }} /> {/* 공급 특별 */}
                  <col style={{ width: "70px" }} /> {/* 공급 합계 */}
                  <col style={{ width: "100px" }} /> {/* 최고 분양가 */}
                  <col style={{ width: "70px" }} /> {/* 특별공급 대상 */}
                  <col style={{ width: "120px" }} /> {/* 특별공급 접수 */}
                  <col style={{ width: "80px" }} /> {/* 특별공급 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 1순위 대상 */}
                  <col style={{ width: "100px" }} /> {/* 1순위 접수 */}
                  <col style={{ width: "80px" }} /> {/* 1순위 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 2순위 대상 */}
                  <col style={{ width: "100px" }} /> {/* 2순위 접수 */}
                  <col style={{ width: "80px" }} /> {/* 2순위 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 합계 대상 */}
                  <col style={{ width: "80px" }} /> {/* 합계 접수 */}
                  <col style={{ width: "80px" }} /> {/* 합계 경쟁률 */}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} scope="col">타입</th>
                    <th rowSpan={2} scope="col" className="numeric">공급면적(㎡)</th>
                    <th rowSpan={2} scope="col" className="numeric">공급평형(평)</th>
                    <th colSpan={3} scope="colgroup">공급세대</th>
                    <th rowSpan={2} scope="col" className="numeric">최고 분양가(만원)</th>
                    <th colSpan={3} scope="colgroup">특별공급</th>
                    <th colSpan={3} scope="colgroup">1순위 접수</th>
                    <th colSpan={3} scope="colgroup">2순위 접수</th>
                    <th colSpan={3} scope="colgroup">합계</th>
                  </tr>
                  <tr>
                    <th scope="col" className="numeric">일반</th>
                    <th scope="col" className="numeric">특별</th>
                    <th scope="col" className="numeric">합계</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col" className="numeric">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                  </tr>
                </thead>
                <tbody>
                  {applicationRows.map((row) => (
                    <tr key={row.modelNo}>
                      <td data-label="타입" style={{ fontWeight: 600 }}>{row.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric">{row.areaSqm ? `${row.areaSqm.toFixed(2)}` : "-"}</td>
                      <td data-label="공급평형(평)" className="numeric">{row.areaPyeong ? `${row.areaPyeong.toFixed(1)}` : "-"}</td>
                      <td data-label="공급 일반" className="numeric">{formatNumber(row.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric">{formatNumber(row.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric">{formatNumber(row.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric">{formatPriceTenThousand(row.priceThousand)}</td>
                      <td data-label="특별공급 대상" className="numeric">{formatNumber(row.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.special.request)}</div>
                        {row.specialRequests && formatSpecialRequestEntries(row.specialRequests).length > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            {formatSpecialRequestEntries(row.specialRequests).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td data-label="특별공급 경쟁률" className="numeric">{formatRate(row.stages.special.request, row.stages.special.target)}</td>
                      <td data-label="1순위 대상" className="numeric">{formatNumber(row.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank1.request)}</div>
                        {(row.stages.rank1.localRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank1.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank1.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="1순위 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.rank1.request, row.stages.rank1.target)}</div>
                        {formatDifference(row.stages.rank1.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.rank1.remaining)}</div>
                        )}
                      </td>
                      <td data-label="2순위 대상" className="numeric">{formatNumber(row.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank2.request)}</div>
                        {(row.stages.rank2.localRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank2.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank2.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="2순위 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.rank2.request, row.stages.rank2.target)}</div>
                        {formatDifference(row.stages.rank2.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.rank2.remaining)}</div>
                        )}
                      </td>
                      <td data-label="합계 대상" className="numeric">{formatNumber(row.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric">{formatNumber(row.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.total.request, row.stages.total.target)}</div>
                        {formatDifference(row.stages.total.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.total.remaining)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {applicationTotals && (
                  <tfoot>
                    <tr style={{ background: "#f9fafb", fontWeight: 600 }}>
                      <td data-label="타입">{applicationTotals.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric">-</td>
                      <td data-label="공급평형(평)" className="numeric">-</td>
                      <td data-label="공급 일반" className="numeric">{formatNumber(applicationTotals.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric">{formatNumber(applicationTotals.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric">{formatNumber(applicationTotals.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric">-</td>
                      <td data-label="특별공급 대상" className="numeric">{formatNumber(applicationTotals.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="numeric">{formatNumber(applicationTotals.stages.special.request)}</td>
                      <td data-label="특별공급 경쟁률" className="numeric">{formatRate(applicationTotals.stages.special.request, applicationTotals.stages.special.target)}</td>
                      <td data-label="1순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank1.request)}</td>
                      <td data-label="1순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank1.request, applicationTotals.stages.rank1.target)}</td>
                      <td data-label="2순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank2.request)}</td>
                      <td data-label="2순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank2.request, applicationTotals.stages.rank2.target)}</td>
                      <td data-label="합계 대상" className="numeric">{formatNumber(applicationTotals.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric">{formatNumber(applicationTotals.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric">{formatRate(applicationTotals.stages.total.request, applicationTotals.stages.total.target)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            
            <div style={{ padding: "12px 20px", fontSize: 12, color: "#6b7280", borderTop: "1px solid #e5e7eb" }}>
              <div>※ 경쟁률 = 접수 ÷ 대상, 금액 단위: 만원 기준</div>
              {missingSpecialRequestData && (
                <div>※ 특별공급 접수 인원은 현재 공개된 API에서 제공되지 않아 '-'로 표기됩니다.</div>
              )}
            </div>
            
            {/* 하단 닫기 버튼 */}
            <div style={{ padding: "20px", textAlign: "center", borderTop: "1px solid #e5e7eb", marginTop: "16px" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 32px",
                  backgroundColor: "#0066cc",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: "500",
                  minWidth: "120px",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#0052a3";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "#0066cc";
                }}
              >
                닫기
              </button>
            </div>
          </section>
        )}
        
        {/* 모달 하단 닫기 버튼 (상세정보만 있고 청약 접수 결과가 없는 경우) */}
        {detailRows.length > 0 && applicationRows.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", borderTop: "1px solid #e5e7eb", marginTop: "24px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 32px",
                backgroundColor: "#0066cc",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "500",
                minWidth: "120px",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#0052a3";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#0066cc";
              }}
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
