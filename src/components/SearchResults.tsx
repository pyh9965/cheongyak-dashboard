"use client";

import React, { useState, useMemo } from "react";
import { AptInfo } from "@/lib/cache-loader";
import { formatRate } from "@/lib/detail-utils";
import { getCheongyakStatus, parseCheongyakDate } from "@/hooks/utils";
import ExpandedDetailContent from "./ExpandedDetailContent";
import styles from "../app/apt/page.module.css";

interface SearchResultsProps {
  data: AptInfo[];
  loading: boolean;
  extraData: Record<string, any>;
  totalCount: number;
  onHouseNameClick: (item: AptInfo) => void;
  onFetchExtra: (houseManageNo: string, pblancNo: string) => Promise<void>;
}

export default function SearchResults({
  data,
  loading,
  extraData,
  totalCount,
  onHouseNameClick,
  onFetchExtra,
}: SearchResultsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 모집공고일 기준 내림차순 정렬
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const dateA = a.RCRIT_PBLANC_DE || '';
      const dateB = b.RCRIT_PBLANC_DE || '';
      return dateB.localeCompare(dateA); // 내림차순
    });
  }, [data]);

  const handleRowClick = (item: AptInfo) => {
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    if (expandedId === key) {
      setExpandedId(null);
    } else {
      setExpandedId(key);
      if (!extraData[key] && item.HOUSE_MANAGE_NO && item.PBLANC_NO) {
        onFetchExtra(String(item.HOUSE_MANAGE_NO), String(item.PBLANC_NO));
      }
    }
    // 부모 핸들러 호출 제거 (모달 중복 방지)
    // onHouseNameClick(item);
  };

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
          • <strong>주택명</strong>을 클릭하면 상세 타입별 경쟁률이 아래로 펼쳐집니다.
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          • 주택명, 청약기간, 당첨자발표 컬럼 헤더를 클릭하면 정렬 가능합니다. (추후 구현 예정)
        </p>
        <p style={{ margin: 0 }}>
          • 본 정보는 참고용이며, 청약 신청 시 반드시 해당 입주자모집공고 내용을 확인하시기 바랍니다.
        </p>
      </div>

      <div style={{ textAlign: "right", marginBottom: "12px" }}>
        <strong style={{ fontSize: "14px", color: "#333" }}>총 {totalCount.toLocaleString()}건</strong>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className={styles.resultsContainer}>
          <table className={styles.table}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th className={styles.th} style={{ width: "5%" }}>지역</th>
                <th className={styles.th} style={{ width: "6%" }}>주택구분</th>
                <th className={styles.th} style={{ width: "6%" }}>분양/임대</th>
                <th className={styles.th} style={{ width: "22%" }}>주택명</th>
                <th className={styles.th} style={{ width: "12%" }}>시공사</th>
                <th className={styles.th} style={{ width: "6%" }}>문의처</th>
                <th className={styles.th} style={{ width: "8%" }}>모집공고일</th>
                <th className={styles.th} style={{ width: "9%" }}>청약기간</th>
                <th className={styles.th} style={{ width: "8%" }}>당첨자발표</th>
                <th className={styles.th} style={{ width: "10%" }}>특별공급 신청현황</th>
                <th className={styles.th} style={{ width: "8%" }}>1·2순위 경쟁률</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: "40px", textAlign: "center" }}>조회 중...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "60px 40px", textAlign: "center", color: "#999", fontSize: "14px" }}>
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedData.map((item) => {
                  const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                  const isExpanded = expandedId === key;
                  return (
                    <React.Fragment key={key}>
                      <tr style={{ backgroundColor: isExpanded ? "#f0f7ff" : "transparent" }}>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.SUBSCRPT_AREA_CODE_NM || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.HOUSE_DTL_SECD_NM || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>분양주택</td>
                        <td
                          className={styles.td}
                          style={{ verticalAlign: "top" }}
                          onClick={() => handleRowClick(item)}
                        >
                          <div className={styles.houseName} style={{ fontWeight: isExpanded ? "bold" : "normal" }}>
                            {item.HOUSE_NM || "-"}
                          </div>
                        </td>
                        <td className={styles.td} style={{ verticalAlign: "top" }}>
                          <div>{item.BSNS_MBY_NM || "-"}</div>
                        </td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.BSNS_MBY_TELNO || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.RCRIT_PBLANC_DE || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.4" }}>
                          {item.RCEPT_BGNDE && item.RCEPT_ENDDE ? `${item.RCEPT_BGNDE} ~ ${item.RCEPT_ENDDE}` : "-"}
                        </td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.PRZWNER_PRESNATN_DE || "-"}</td>
                        <td className={styles.td} style={{ textAlign: "center", color: "#777", fontSize: "13px" }}>
                          {(() => {
                            const extra = extraData[key]?.totals || extraData[key];
                            if (extra?.stages?.special) {
                              const total = extra.stages.special.request;
                              if (total !== null && total > 0) {
                                return (
                                  <div style={{ color: "#2d3436" }}>
                                    <div style={{ fontWeight: "600" }}>{total.toLocaleString()}건</div>
                                    <div style={{ fontSize: "11px", color: "#636e72" }}>
                                      ({formatRate(extra.stages.special.request, extra.stages.special.target)})
                                    </div>
                                  </div>
                                );
                              }
                            }
                            return <span style={{ fontStyle: "italic" }}>주택명 클릭 확인</span>;
                          })()}
                        </td>
                        <td className={styles.td} style={{ textAlign: "center" }}>
                          {(() => {
                            const extra = extraData[key]?.totals || extraData[key];
                            if (extra?.stages?.total) {
                              const total = extra.stages.total.request;
                              if (total !== null && total > 0) {
                                return (
                                  <div style={{ color: "#0066cc" }}>
                                    <div style={{ fontWeight: "700" }}>{total.toLocaleString()}건</div>
                                    <div style={{ fontSize: "11px" }}>
                                      ({formatRate(extra.stages.total.request, extra.stages.total.target)})
                                    </div>
                                  </div>
                                );
                              }
                            }
                            const status = getCheongyakStatus(item.RCEPT_ENDDE || "", item.PRZWNER_PRESNATN_DE || "");
                            return <span style={{ color: status.color, fontWeight: status.isActionable ? "600" : "normal" }}>{status.text}</span>;
                          })()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={11} style={{ padding: "0", border: "1px solid #ddd", backgroundColor: "#fff" }}>
                            <div style={{ padding: "20px", borderTop: "2px solid #0066cc" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                                <h4 style={{ margin: 0, fontSize: "16px", color: "#1a1a1a" }}>청약 타입별 상세 결과</h4>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <button onClick={() => setExpandedId(null)} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#fff" }}>닫기 ✕</button>
                                </div>
                              </div>
                              {!extraData[key] ? (
                                <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>데이터를 불러오는 중입니다...</div>
                              ) : (
                                <ExpandedDetailContent data={extraData[key]} item={item} />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Mobile Card View */}
          <div className={styles.mobileCardList}>
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center" }}>조회 중...</div>
            ) : data.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#999", border: "1px solid #ddd", borderRadius: "8px" }}>
                조회 결과가 없습니다.
              </div>
            ) : (
              data.map((item) => {
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                const isExpanded = expandedId === key;
                const status = getCheongyakStatus(item.RCEPT_ENDDE || "", item.PRZWNER_PRESNATN_DE || "");

                return (
                  <div key={key} className={styles.mobileCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.cardTitle} onClick={() => handleRowClick(item)}>
                          {item.HOUSE_NM || "-"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>{item.BSNS_MBY_NM}</div>
                      </div>
                      <span
                        className={styles.cardBadge}
                        style={{
                          backgroundColor: status.color + "20",
                          color: status.color,
                          border: `1px solid ${status.color}`
                        }}
                      >
                        {status.text}
                      </span>
                    </div>

                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>지역/유형</span>
                      <span className={styles.cardValue}>{item.SUBSCRPT_AREA_CODE_NM} · {item.HOUSE_DTL_SECD_NM}</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>청약기간</span>
                      <span className={styles.cardValue}>
                        {item.RCEPT_BGNDE && item.RCEPT_ENDDE ? `${parseCheongyakDate(item.RCEPT_BGNDE)?.getMonth()! + 1}/${parseCheongyakDate(item.RCEPT_BGNDE)?.getDate()} ~ ${parseCheongyakDate(item.RCEPT_ENDDE)?.getMonth()! + 1}/${parseCheongyakDate(item.RCEPT_ENDDE)?.getDate()}` : "-"}
                      </span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>당첨발표</span>
                      <span className={styles.cardValue}>{item.PRZWNER_PRESNATN_DE}</span>
                    </div>

                    {/* Competition Summary */}
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>경쟁률</span>
                      <span className={styles.cardValue}>
                        {(() => {
                          const extra = extraData[key]?.totals || extraData[key];
                          if (extra?.stages?.total?.request) {
                            return <span style={{ color: "#0066cc" }}>{formatRate(extra.stages.total.request, extra.stages.total.target)} ({extra.stages.total.request.toLocaleString()}건)</span>;
                          }
                          return "-";
                        })()}
                      </span>
                    </div>

                    <button
                      className={styles.expandButton}
                      onClick={() => handleRowClick(item)}
                    >
                      {isExpanded ? "접기 ▲" : "상세보기 ▼"}
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                        {!extraData[key] ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>로딩 중...</div>
                        ) : (
                          <ExpandedDetailContent data={extraData[key]} item={item} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
