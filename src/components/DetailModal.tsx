"use client";

import React from "react";
import { AptInfo } from "@/lib/cache-loader";
import { formatNumber, formatPriceTenThousand, formatRate, formatDifference, formatSpecialRequestEntries, formatValue } from "@/lib/detail-utils";

type NoticeDetailRow = Record<string, unknown>;

interface DetailModalProps {
  item: AptInfo;
  detailRows: NoticeDetailRow[];
  detailLoading: boolean;
  detailError: string | null;
  datasetErrors: Record<string, string>;
  applicationRows: any[];
  missingSpecialRequestData: boolean;
  applicationTotals: any | null;
  onClose: () => void;
}

export default function DetailModal({
  item,
  detailRows,
  detailLoading,
  detailError,
  datasetErrors,
  applicationRows,
  missingSpecialRequestData,
  applicationTotals,
  onClose,
}: DetailModalProps) {
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
          return { key, label, value } as { key: string; label: string; value: unknown };
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
            </header>

            <div className="table-responsive" style={{ overflowX: "auto" }}>
              <table className="table-results" style={{ minWidth: 1100, borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
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
                  <tr style={{ backgroundColor: "#f8f9fa" }}>
                    <th rowSpan={2} scope="col" style={{ padding: "8px", border: "1px solid #dee2e6" }}>타입</th>
                    <th rowSpan={2} scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6" }}>공급면적(㎡)</th>
                    <th rowSpan={2} scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6" }}>공급평형(평)</th>
                    <th colSpan={3} scope="colgroup" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f1f5f9" }}>공급세대</th>
                    <th rowSpan={2} scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6" }}>최고 분양가(만원)</th>
                    <th colSpan={3} scope="colgroup" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#e6f4ff", color: "#0054a6", fontWeight: "bold" }}>특별공급</th>
                    <th colSpan={3} scope="colgroup" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff0f0", color: "#d92828", fontWeight: "bold" }}>1순위 접수</th>
                    <th colSpan={3} scope="colgroup" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f5f5f5", color: "#555555", fontWeight: "bold" }}>2순위 접수</th>
                    <th colSpan={3} scope="colgroup" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#eeeeee", color: "#333333", fontWeight: "bold" }}>합계</th>
                  </tr>
                  <tr style={{ backgroundColor: "#f8f9fa" }}>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f8fafc", textAlign: "center", fontSize: "11px" }}>일반</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f8fafc", textAlign: "center", fontSize: "11px" }}>특별</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f8fafc", textAlign: "center", fontSize: "11px" }}>합계</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f8ff", color: "#0054a6", textAlign: "center", fontSize: "11px" }}>대상</th>
                    <th scope="col" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f8ff", color: "#0054a6", textAlign: "center", fontSize: "11px" }}>접수</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f8ff", color: "#0054a6", textAlign: "center", fontSize: "11px" }}>경쟁률</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#fff5f5", color: "#d92828", textAlign: "center", fontSize: "11px" }}>대상</th>
                    <th scope="col" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#fff5f5", color: "#d92828", textAlign: "center", fontSize: "11px" }}>접수</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#fff5f5", color: "#d92828", textAlign: "center", fontSize: "11px" }}>경쟁률</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f9f9f9", color: "#555555", textAlign: "center", fontSize: "11px" }}>대상</th>
                    <th scope="col" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f9f9f9", color: "#555555", textAlign: "center", fontSize: "11px" }}>접수</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f9f9f9", color: "#555555", textAlign: "center", fontSize: "11px" }}>경쟁률</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f0f0", color: "#333333", textAlign: "center", fontSize: "11px" }}>대상</th>
                    <th scope="col" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f0f0", color: "#333333", textAlign: "center", fontSize: "11px" }}>접수</th>
                    <th scope="col" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", backgroundColor: "#f0f0f0", color: "#333333", textAlign: "center", fontSize: "11px" }}>경쟁률</th>
                  </tr>
                </thead>
                <tbody>
                  {applicationRows.map((row) => (
                    <tr key={row.modelNo} style={{ borderBottom: "1px solid #eee" }}>
                      <td data-label="타입" style={{ padding: "8px", border: "1px solid #dee2e6", fontWeight: 600, textAlign: "center" }}>{row.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>{row.areaSqm ? `${row.areaSqm.toFixed(2)}` : "-"}</td>
                      <td data-label="공급평형(평)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>{row.areaPyeong ? `${row.areaPyeong.toFixed(1)}` : "-"}</td>
                      <td data-label="공급 일반" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(row.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(row.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(row.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatPriceTenThousand(row.priceThousand)}</td>
                      
                      {/* 특별공급 */}
                      <td data-label="특별공급 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff" }}>{formatNumber(row.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f0f8ff" }}>
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.special.request)}</div>
                        {row.specialRequests && formatSpecialRequestEntries(row.specialRequests).length > 0 && (
                          <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px", textAlign: "right" }}>
                            {formatSpecialRequestEntries(row.specialRequests).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td data-label="특별공급 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff", fontWeight: "600", color: "#0054a6" }}>{formatRate(row.stages.special.request, row.stages.special.target)}</td>
                      
                      {/* 1순위 */}
                      <td data-label="1순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5" }}>{formatNumber(row.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#fff5f5" }}>
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank1.request)}</div>
                        {(row.stages.rank1.localRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px", textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank1.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank1.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="1순위 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5", fontWeight: "600", color: "#e03131" }}>
                        <div>{formatRate(row.stages.rank1.request, row.stages.rank1.target)}</div>
                        {formatDifference(row.stages.rank1.remaining) && (
                          <div className="special-details" style={{ fontSize: "11px", color: "#e03131" }}>{formatDifference(row.stages.rank1.remaining)}</div>
                        )}
                      </td>
                      
                      {/* 2순위 */}
                      <td data-label="2순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f9f9f9" }}>{formatNumber(row.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f9f9f9" }}>
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank2.request)}</div>
                        {(row.stages.rank2.localRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px", textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank2.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank2.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="2순위 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f9f9f9" }}>
                        <div>{formatRate(row.stages.rank2.request, row.stages.rank2.target)}</div>
                        {formatDifference(row.stages.rank2.remaining) && (
                          <div className="special-details" style={{ fontSize: "11px" }}>{formatDifference(row.stages.rank2.remaining)}</div>
                        )}
                      </td>
                      
                      {/* 합계 */}
                      <td data-label="합계 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f0f0" }}>{formatNumber(row.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f0f0f0" }}>{formatNumber(row.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f0f0", fontWeight: "600" }}>
                        <div>{formatRate(row.stages.total.request, row.stages.total.target)}</div>
                        {formatDifference(row.stages.total.remaining) && (
                          <div className="special-details" style={{ fontSize: "11px" }}>{formatDifference(row.stages.total.remaining)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {applicationTotals && (
                  <tfoot>
                    <tr style={{ background: "#f9fafb", fontWeight: 600 }}>
                      <td data-label="타입" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>{applicationTotals.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>-</td>
                      <td data-label="공급평형(평)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>-</td>
                      <td data-label="공급 일반" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(applicationTotals.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(applicationTotals.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right" }}>{formatNumber(applicationTotals.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center" }}>-</td>
                      
                      {/* 특공 합계 */}
                      <td data-label="특별공급 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff" }}>{formatNumber(applicationTotals.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f0f8ff" }}>{formatNumber(applicationTotals.stages.special.request)}</td>
                      <td data-label="특별공급 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff" }}>{formatRate(applicationTotals.stages.special.request, applicationTotals.stages.special.target)}</td>
                      
                      {/* 1순위 합계 */}
                      <td data-label="1순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5" }}>{formatNumber(applicationTotals.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#fff5f5" }}>{formatNumber(applicationTotals.stages.rank1.request)}</td>
                      <td data-label="1순위 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5" }}>{formatRate(applicationTotals.stages.rank1.request, applicationTotals.stages.rank1.target)}</td>
                      
                      {/* 2순위 합계 */}
                      <td data-label="2순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f9f9f9" }}>{formatNumber(applicationTotals.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f9f9f9" }}>{formatNumber(applicationTotals.stages.rank2.request)}</td>
                      <td data-label="2순위 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f9f9f9" }}>{formatRate(applicationTotals.stages.rank2.request, applicationTotals.stages.rank2.target)}</td>
                      
                      {/* 전체 합계 */}
                      <td data-label="합계 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f0f0" }}>{formatNumber(applicationTotals.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f0f0f0" }}>{formatNumber(applicationTotals.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f0f0" }}>{formatRate(applicationTotals.stages.total.request, applicationTotals.stages.total.target)}</td>
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
      </div>
    </div>
  );
}
