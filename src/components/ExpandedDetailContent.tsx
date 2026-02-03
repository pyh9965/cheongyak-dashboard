"use client";

import React from "react";
import { AptInfo } from "@/lib/cache-loader";
import { formatNumber, formatPriceTenThousand, formatRate, formatDifference, formatSpecialRequestEntries } from "@/lib/detail-utils";

interface ExpandedDetailContentProps {
  data: any;
  item: AptInfo;
}

export default function ExpandedDetailContent({ data, item }: ExpandedDetailContentProps) {
  if (!data?.rows || data.rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
        상세 정보가 없습니다.
      </div>
    );
  }

  const { rows, missingSpecialRequests, totals: applicationTotals } = data;

  return (
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
          <tr style={{ backgroundColor: "#f8f9fa" }}>
            <th rowSpan={2} scope="col">타입</th>
            <th rowSpan={2} scope="col" className="numeric">공급면적(㎡)</th>
            <th rowSpan={2} scope="col" className="numeric">공급평형(평)</th>
            <th colSpan={3} scope="colgroup" style={{ backgroundColor: "#f1f5f9", textAlign: "center" }}>공급세대</th>
            <th rowSpan={2} scope="col" className="numeric">최고 분양가(만원)</th>
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
          {rows.map((row: any) => (
            <tr key={row.modelNo}>
              <td data-label="타입" style={{ fontWeight: 600 }}>{row.houseType}</td>
              <td data-label="공급면적(㎡)" className="numeric">{row.areaSqm ? `${row.areaSqm.toFixed(2)}` : "-"}</td>
              <td data-label="공급평형(평)" className="numeric">{row.areaPyeong ? `${row.areaPyeong.toFixed(1)}` : "-"}</td>
              <td data-label="공급 일반" className="numeric">{formatNumber(row.supplyGeneral)}</td>
              <td data-label="공급 특별" className="numeric">{formatNumber(row.supplySpecial)}</td>
              <td data-label="공급 합계" className="numeric">{formatNumber(row.supplyTotal)}</td>
              <td data-label="최고 분양가(만원)" className="numeric">{formatPriceTenThousand(row.priceThousand)}</td>
              
              {/* 특별공급 */}
              <td data-label="특별공급 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff" }}>{formatNumber(row.stages.special.target)}</td>
              <td data-label="특별공급 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f0f8ff" }}>
                <div>{formatNumber(row.stages.special.request)}</div>
                {row.specialRequests && formatSpecialRequestEntries(row.specialRequests).length > 0 && (
                  <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    {formatSpecialRequestEntries(row.specialRequests).join(" · ")}
                  </div>
                )}
              </td>
              <td data-label="특별공급 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f0f8ff", fontWeight: "600", color: "#0054a6" }}>{formatRate(row.stages.special.request, row.stages.special.target)}</td>
              
              {/* 1순위 */}
              <td data-label="1순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5" }}>{formatNumber(row.stages.rank1.target)}</td>
              <td data-label="1순위 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#fff5f5" }}>
                <div>{formatNumber(row.stages.rank1.request)}</div>
                {(row.stages.rank1.localRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0) > 0 && (
                  <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    해당 {formatNumber(row.stages.rank1.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank1.etcRequest ?? 0)}
                  </div>
                )}
              </td>
              <td data-label="1순위 경쟁률" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#fff5f5", fontWeight: "600", color: "#d92828" }}>
                <div>{formatRate(row.stages.rank1.request, row.stages.rank1.target)}</div>
                {formatDifference(row.stages.rank1.remaining) && (
                  <div className="special-details" style={{ fontSize: "11px", color: "#d92828" }}>{formatDifference(row.stages.rank1.remaining)}</div>
                )}
              </td>
              
              {/* 2순위 */}
              <td data-label="2순위 대상" className="numeric" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "center", backgroundColor: "#f9f9f9" }}>{formatNumber(row.stages.rank2.target)}</td>
              <td data-label="2순위 접수" className="wrap" style={{ padding: "8px", border: "1px solid #dee2e6", textAlign: "right", backgroundColor: "#f9f9f9" }}>
                <div>{formatNumber(row.stages.rank2.request)}</div>
                {(row.stages.rank2.localRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0) > 0 && (
                  <div className="special-details" style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
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
              <td data-label="타입">{applicationTotals.houseType}</td>
              <td data-label="공급면적(㎡)" className="numeric">-</td>
              <td data-label="공급평형(평)" className="numeric">-</td>
              <td data-label="공급 일반" className="numeric">{formatNumber(applicationTotals.supplyGeneral)}</td>
              <td data-label="공급 특별" className="numeric">{formatNumber(applicationTotals.supplySpecial)}</td>
              <td data-label="공급 합계" className="numeric">{formatNumber(applicationTotals.supplyTotal)}</td>
              <td data-label="최고 분양가(만원)" className="numeric">-</td>
              
              {/* 특공 합계 */}
              <td data-label="특별공급 대상" className="numeric">{formatNumber(applicationTotals.stages.special.target)}</td>
              <td data-label="특별공급 접수" className="numeric">{formatNumber(applicationTotals.stages.special.request)}</td>
              <td data-label="특별공급 경쟁률" className="numeric">{formatRate(applicationTotals.stages.special.request, applicationTotals.stages.special.target)}</td>
              
              {/* 1순위 합계 */}
              <td data-label="1순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank1.target)}</td>
              <td data-label="1순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank1.request)}</td>
              <td data-label="1순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank1.request, applicationTotals.stages.rank1.target)}</td>
              
              {/* 2순위 합계 */}
              <td data-label="2순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank2.target)}</td>
              <td data-label="2순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank2.request)}</td>
              <td data-label="2순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank2.request, applicationTotals.stages.rank2.target)}</td>
              
              {/* 전체 합계 */}
              <td data-label="합계 대상" className="numeric">{formatNumber(applicationTotals.stages.total.target)}</td>
              <td data-label="합계 접수" className="numeric">{formatNumber(applicationTotals.stages.total.request)}</td>
              <td data-label="합계 경쟁률" className="numeric">{formatRate(applicationTotals.stages.total.request, applicationTotals.stages.total.target)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      
      <div style={{ padding: "12px 20px", fontSize: 12, color: "#6b7280", borderTop: "1px solid #e5e7eb" }}>
        <div>※ 경쟁률 = 접수 ÷ 대상, 금액 단위: 만원 기준</div>
        {missingSpecialRequests && (
          <div>※ 특별공급 접수 인원은 현재 공개된 API에서 제공되지 않아 '-'로 표기될 수 있습니다.</div>
        )}
      </div>
    </div>
  );
}
