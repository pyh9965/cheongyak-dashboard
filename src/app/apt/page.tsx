"use client";

import React, { useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import { AptInfo } from "@/lib/cache-loader";
import { useAptData } from "@/hooks/useAptData";
import { NoticeDetailRow, NoticeModelApiRow, NoticeCompetitionApiRow, NoticeSpecialApiRow, buildApplicationRows } from "@/lib/detail-data";
import { getStaticDetail } from "@/lib/cache-loader";
import { getCompetitionStagesSync, getSupplyTotalForItem } from "@/hooks/utils";

// Components
import SearchForm from "@/components/SearchForm";
import SearchResults from "@/components/SearchResults";
import Pagination from "@/components/Pagination";
import DetailModal from "@/components/DetailModal";

// 지도 컴포넌트 동적 임포트 (SSR 비활성화)
const CompetitionRateMap = dynamic(
  () => import("@/components/CompetitionRateMap"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>지도를 불러오는 중...</div> }
) as React.ComponentType<any>;

// 경쟁률 표 컴포넌트 동적 임포트
const CompetitionTable = dynamic(
  () => import("@/components/CompetitionTable"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>표를 불러오는 중...</div> }
);

// 통계 대시보드 컴포넌트 동적 임포트
const StatsDashboard = dynamic(
  () => import("@/components/StatsDashboard"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>통계 분석 중...</div> }
);

type RateType = "special" | "rank1" | "rank2" | "total";
type ViewTab = "list" | "map" | "table";

export default function APTPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>로딩 중...</div>}>
      <APTPageContent />
    </Suspense>
  );
}

function APTPageContent() {
  const {
    data,
    loading,
    error,
    searchParams,
    setSearchParams,
    currentPage,
    setCurrentPage,
    handleSearch,
    fetchSingleExtraData,
    extraData,
    archiveCache,
    cacheLoading,
    sigunguOptions
  } = useAptData();

  // 탭 상태
  const [activeTab, setActiveTab] = useState<ViewTab>("list");
  
  // 지도 상태
  const [mapRateType, setMapRateType] = useState<RateType>("total");
  const [mapStartDate, setMapStartDate] = useState("");
  const [mapEndDate, setMapEndDate] = useState("");
  
  // 상세정보 상태
  const [selectedItem, setSelectedItem] = useState<AptInfo | null>(null);
  const [detailRows, setDetailRows] = useState<NoticeDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [datasetErrors, setDatasetErrors] = useState<Record<string, string>>({});
  const [applicationRows, setApplicationRows] = useState<any[]>([]);
  const [missingSpecialRequestData, setMissingSpecialRequestData] = useState(false);
  const [applicationTotals, setApplicationTotals] = useState<any | null>(null);

  // Pagination logic
  const [itemsPerPage, setItemsPerPage] = useState(15);
  
  // 초기 데이터 로드 및 날짜 범위 변경 감지
  const prevStartMonth = React.useRef(searchParams.startMonth);
  const prevEndMonth = React.useRef(searchParams.endMonth);

  React.useEffect(() => {
    if (cacheLoading) return; // 캐시 로딩 완료 대기
    handleSearch(1);
  }, [archiveCache, cacheLoading]);

  // 날짜 범위 변경 감지 및 자동 재조회 (표 탭 활성 시)
  React.useEffect(() => {
    const startChanged = prevStartMonth.current !== searchParams.startMonth;
    const endChanged = prevEndMonth.current !== searchParams.endMonth;

    if (startChanged || endChanged) {
      console.log(`📅 [page.tsx] 날짜 범위 변경 감지: ${prevStartMonth.current}~${prevEndMonth.current} → ${searchParams.startMonth}~${searchParams.endMonth}`);

      // 표 탭이 활성화되어 있으면 즉시 재조회
      if (activeTab === "table") {
        console.log(`🔄 [page.tsx] 표 탭 활성 상태 - 자동 재조회 실행`);
        handleSearch(1);
      }

      // ref 업데이트
      prevStartMonth.current = searchParams.startMonth;
      prevEndMonth.current = searchParams.endMonth;
    }
  }, [searchParams.startMonth, searchParams.endMonth, activeTab, handleSearch]);

  const filteredList = useMemo(() => {
    return [...data].sort((a, b) => {
      const dateA = a.RCRIT_PBLANC_DE || "";
      const dateB = b.RCRIT_PBLANC_DE || "";
      return dateB.localeCompare(dateA);
    });
  }, [data]);

  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage, itemsPerPage]);

  const totalPagesCount = Math.ceil(filteredList.length / itemsPerPage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(1);
  };

  // 상세정보 조회
  const fetchDetail = async (houseManageNo: string, pblancNo: string) => {
    if (!houseManageNo || !pblancNo) return;

    setDetailLoading(true);
    setDetailError(null);
    setDatasetErrors({});
    setApplicationRows([]);
    setMissingSpecialRequestData(false);

    try {
      // 1. Static Detail File 확인
      const staticDetail = await getStaticDetail(houseManageNo, pblancNo);

      if (staticDetail) {
        // 캐시 데이터 검증: 1순위 접수 데이터가 있는지 확인
        const hasRank1Data = staticDetail.rows.some(row => row.stages.rank1.request !== null);

        if (hasRank1Data) {
          setApplicationRows(staticDetail.rows);
          setMissingSpecialRequestData(staticDetail.missingSpecialRequests);
          setApplicationTotals(staticDetail.totals);
          setDetailRows([]);
          return;
        }
      }

      // 2. API 호출
        const params = new URLSearchParams({
          dataset: "notice,noticeModel,noticeCompetition,noticeSpecial",
          houseManageNo,
          pblancNo,
          perPage: "100"
        });
        const res = await fetch(`/api/cheongyak?${params.toString()}`);
        
        let json: any = {};
        try {
          json = await res.json();
        } catch {
          json = {};
        }

        if (json.errors) setDatasetErrors(json.errors);
        
        if (!res.ok) throw new Error(json.error || `API 요청 실패 (${res.status})`);

        setDetailRows(Array.isArray(json.datasets?.notice) ? json.datasets.notice : []);
        
        const { rows, missingSpecialRequests, totals } = buildApplicationRows(
          json.datasets?.noticeModel || [],
          json.datasets?.noticeCompetition || [],
          json.datasets?.noticeSpecial || []
        );
        
        setApplicationRows(rows);
        setMissingSpecialRequestData(missingSpecialRequests);
        setApplicationTotals(totals);
    } catch (err) {
      // API 인증 오류 등은 사용자에게 친화적 메시지로 변환
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("인증키") || msg.includes("400") || msg.includes("SERVICE_KEY")) {
        setDetailError("상세 데이터를 불러올 수 없습니다. 캐시된 데이터만 표시됩니다.");
      } else {
        setDetailError(msg || "상세 데이터를 불러오지 못했습니다.");
      }
    } finally {
      setDetailLoading(false);
    }
  };

  // 상세정보 조회 트리거
  React.useEffect(() => {
    if (selectedItem?.HOUSE_MANAGE_NO && selectedItem?.PBLANC_NO) {
      fetchDetail(String(selectedItem.HOUSE_MANAGE_NO), String(selectedItem.PBLANC_NO));
    } else {
      setDetailRows([]);
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      setApplicationTotals(null);
    }
  }, [selectedItem]);

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#1a1a1a" }}>
        APT 분양정보 및 경쟁률 조회
      </h1>

      <div style={{
        padding: "16px 20px",
        backgroundColor: "#fff9e6",
        border: "1px solid #ffd700",
        borderRadius: "8px",
        marginBottom: "30px",
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
          sigunguOptions={sigunguOptions}
          dataAvailableFrom={(() => {
            const raw = archiveCache?.metadata?.dateRange?.start;
            if (!raw) return undefined;
            // Handles both YYYYMMDD and YYYY-MM-DD formats → YYYY-MM
            const clean = raw.replace(/-/g, '');
            if (clean.length >= 6) return `${clean.substring(0, 4)}-${clean.substring(4, 6)}`;
            return undefined;
          })()}
        />
      </div>

      <div>
        <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#333" }}>
            조회 결과
          </h2>
          <div className={styles.tabContainer}>
            <button
              className={`${styles.tabButton} ${activeTab === "list" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("list")}
            >
              📋 목록
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "map" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("map")}
            >
              🗺️ 지도
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "table" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("table")}
            >
              📊 표
            </button>
          </div>
        </div>

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

        {/* 목록 탭 */}
        {activeTab === "list" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "13px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                <option value={15}>15개씩</option>
                <option value={30}>30개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
              </select>
            </div>
            <SearchResults
              data={paginatedList}
              loading={loading}
              extraData={extraData}
              totalCount={filteredList.length}
              onHouseNameClick={(item) => setSelectedItem(item)}
              onFetchExtra={fetchSingleExtraData}
            />
            {totalPagesCount > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPagesCount}
                onPageChange={(page) => {
                  if (page >= 1 && page <= totalPagesCount) setCurrentPage(page);
                }}
              />
            )}
          </>
        )}

        {/* 지도 탭 */}
        {activeTab === "map" && (
          <CompetitionRateMap
            data={data}
            extraData={extraData}
            archiveCache={archiveCache}
            rateType={mapRateType}
            startDate={mapStartDate}
            endDate={mapEndDate}
            onRateTypeChange={setMapRateType}
            onDateChange={(start: string, end: string) => {
              setMapStartDate(start);
              setMapEndDate(end);
            }}
            onItemClick={(item: AptInfo) => setSelectedItem(item)}
          />
        )}

        {/* 표 탭 */}
        {activeTab === "table" && (
          <>
            <StatsDashboard
              data={data}
              extraData={extraData}
              archiveCache={archiveCache}
              startMonth={searchParams.startMonth}
              endMonth={searchParams.endMonth}
            />
            <CompetitionTable
              data={data}
              extraData={extraData}
              archiveCache={archiveCache}
              loading={loading}
              totalCount={data.length}
              onExcelDownload={() => {
                const rows = data.map(item => {
                  const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                  const stats = getCompetitionStagesSync(key, extraData, archiveCache);
                  const supplyTotal = getSupplyTotalForItem(item, key, extraData, archiveCache, stats);
                  return {
                    지역: item.SUBSCRPT_AREA_CODE_NM || "-",
                    주택명: item.HOUSE_NM || "-",
                    시공사: item.BSNS_MBY_NM || "-",
                    모집공고일: item.RCRIT_PBLANC_DE || "-",
                    청약시작: item.RCEPT_BGNDE || "-",
                    청약종료: item.RCEPT_ENDDE || "-",
                    공급세대수: supplyTotal,
                    분양가: item.LTTOT_TOP_AMOUNT || 0,
                    특공경쟁률: stats?.special?.rate?.toFixed(2) || "-",
                    "1순위경쟁률": stats?.rank1?.rate?.toFixed(2) || "-",
                    "2순위경쟁률": stats?.rank2?.rate?.toFixed(2) || "-",
                    전체경쟁률: stats?.total?.rate?.toFixed(2) || "-",
                  };
                });

                const headers = Object.keys(rows[0] || {});
                const csvContent = [
                  headers.join(","),
                  ...rows.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(","))
                ].join("\n");

                const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `청약경쟁률_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            />
          </>
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
