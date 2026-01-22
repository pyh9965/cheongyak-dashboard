"use client";

import React, { useState, useMemo } from "react";
import styles from "./CompetitionTable.module.css";
import { AptInfo, CacheData, CachedStats } from "@/lib/cache-loader";
import { getCompetitionStagesSync } from "@/hooks";

type SortDirection = "asc" | "desc";
type SortColumn =
    | "region"
    | "houseName"
    | "builder"
    | "announceDate"
    | "supply"
    | "price"
    | "special"
    | "rank1"
    | "rank2"
    | "total";

interface CompetitionTableProps {
    data: AptInfo[];
    extraData: Record<string, any>;
    archiveCache: CacheData | null;
    loading: boolean;
    totalCount: number;
    onExcelDownload: () => void;
}

function formatRate(rate: number | null | undefined): string {
    if (rate === null || rate === undefined) return "-";
    return `${rate.toFixed(2)}:1`;
}

function formatPrice(price: number | null | undefined): string {
    if (!price || price === 0) return "-";
    const billion = price / 10000;
    if (billion >= 1) {
        return `${billion.toFixed(1)}억`;
    }
    return `${(price / 1000).toFixed(0)}천`;
}

function parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, "");
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

export default function CompetitionTable({
    data,
    extraData,
    archiveCache,
    loading,
    totalCount,
    onExcelDownload,
}: CompetitionTableProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>("announceDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // 경쟁률 데이터 가져오기
    // getCompetitionStagesSync 헬퍼 함수 사용 (중복 로직 제거)
    const getStats = (item: AptInfo) => {
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        return getCompetitionStagesSync(key, extraData, archiveCache);
    };

    // 정렬된 데이터
    const sortedData = useMemo(() => {
        const sorted = [...data].sort((a, b) => {
            let aVal: any, bVal: any;

            switch (sortColumn) {
                case "region":
                    aVal = a.SUBSCRPT_AREA_CODE_NM || "";
                    bVal = b.SUBSCRPT_AREA_CODE_NM || "";
                    break;
                case "houseName":
                    aVal = a.HOUSE_NM || "";
                    bVal = b.HOUSE_NM || "";
                    break;
                case "builder":
                    aVal = a.BSNS_MBY_NM || "";
                    bVal = b.BSNS_MBY_NM || "";
                    break;
                case "announceDate":
                    // 날짜가 없는 경우 가장 오래된 날짜로 처리 (내림차순 시 맨 아래로)
                    aVal = parseDate(a.RCRIT_PBLANC_DE)?.getTime() || 0;
                    bVal = parseDate(b.RCRIT_PBLANC_DE)?.getTime() || 0;
                    break;
                case "supply":
                    aVal = a.TOT_SUPLY_HSHLDCO || 0;
                    bVal = b.TOT_SUPLY_HSHLDCO || 0;
                    break;
                case "price":
                    aVal = a.LTTOT_TOP_AMOUNT || 0;
                    bVal = b.LTTOT_TOP_AMOUNT || 0;
                    break;
                case "special":
                    aVal = getStats(a)?.special?.rate || 0;
                    bVal = getStats(b)?.special?.rate || 0;
                    break;
                case "rank1":
                    aVal = getStats(a)?.rank1?.rate || 0;
                    bVal = getStats(b)?.rank1?.rate || 0;
                    break;
                case "rank2":
                    aVal = getStats(a)?.rank2?.rate || 0;
                    bVal = getStats(b)?.rank2?.rate || 0;
                    break;
                case "total":
                    aVal = getStats(a)?.total?.rate || 0;
                    bVal = getStats(b)?.total?.rate || 0;
                    break;
                default:
                    return 0;
            }

            if (typeof aVal === "string") {
                return sortDirection === "asc"
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }
            return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        });
        return sorted;
    }, [data, sortColumn, sortDirection, archiveCache, extraData]);

    // 페이지네이션
    const totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const paginatedData = sortedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // 정렬 핸들러
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("desc");
        }
        setCurrentPage(1);
    };

    const getSortIcon = (column: SortColumn) => {
        if (sortColumn !== column) return "↕";
        return sortDirection === "asc" ? "↑" : "↓";
    };

    // 페이지 번호 생성
    const getPageNumbers = () => {
        const pages: number[] = [];
        const start = Math.max(1, currentPage - 4);
        const end = Math.min(totalPages, start + 9);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div className={styles.container}>
            {/* 헤더 */}
            <div className={styles.header}>
                <div className={styles.count}>
                    총 <strong>{totalCount.toLocaleString()}</strong>건
                </div>
                <button className={styles.excelButton} onClick={onExcelDownload}>
                    📥 엑셀 다운로드
                </button>
            </div>

            {/* 테이블 */}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort("region")} className={styles.sortable}>
                                지역 {getSortIcon("region")}
                            </th>
                            <th onClick={() => handleSort("houseName")} className={styles.sortable}>
                                주택명 {getSortIcon("houseName")}
                            </th>
                            <th onClick={() => handleSort("builder")} className={styles.sortable}>
                                시공사 {getSortIcon("builder")}
                            </th>
                            <th onClick={() => handleSort("announceDate")} className={styles.sortable}>
                                모집공고일 {getSortIcon("announceDate")}
                            </th>
                            <th>청약기간</th>
                            <th onClick={() => handleSort("supply")} className={styles.sortable}>
                                공급세대수 {getSortIcon("supply")}
                            </th>
                            <th onClick={() => handleSort("price")} className={styles.sortable}>
                                분양가(최고) {getSortIcon("price")}
                            </th>
                            <th onClick={() => handleSort("special")} className={styles.sortable}>
                                특공 {getSortIcon("special")}
                            </th>
                            <th onClick={() => handleSort("rank1")} className={styles.sortable}>
                                1순위 {getSortIcon("rank1")}
                            </th>
                            <th onClick={() => handleSort("rank2")} className={styles.sortable}>
                                2순위 {getSortIcon("rank2")}
                            </th>
                            <th onClick={() => handleSort("total")} className={styles.sortable}>
                                전체 {getSortIcon("total")}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={11} className={styles.loading}>
                                    조회 중...
                                </td>
                            </tr>
                        ) : paginatedData.length === 0 ? (
                            <tr>
                                <td colSpan={11} className={styles.empty}>
                                    조회 결과가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((item, idx) => {
                                const stats = getStats(item);
                                return (
                                    <tr key={`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}_${idx}`}>
                                        <td className={!item.SUBSCRPT_AREA_CODE_NM ? styles.emptyData : ""}>
                                            {item.SUBSCRPT_AREA_CODE_NM || "-"}
                                        </td>
                                        <td className={styles.houseName}>{item.HOUSE_NM || "-"}</td>
                                        <td className={!item.BSNS_MBY_NM ? styles.emptyData : ""}>
                                            {item.BSNS_MBY_NM || "-"}
                                        </td>
                                        <td className={!item.RCRIT_PBLANC_DE ? styles.emptyData : ""}>
                                            {item.RCRIT_PBLANC_DE || "-"}
                                        </td>
                                        <td className={!item.RCEPT_BGNDE || !item.RCEPT_ENDDE ? styles.emptyData : ""}>
                                            {item.RCEPT_BGNDE && item.RCEPT_ENDDE
                                                ? `${item.RCEPT_BGNDE.slice(-5)} ~ ${item.RCEPT_ENDDE.slice(-5)}`
                                                : "-"}
                                        </td>
                                        <td className={styles.number}>
                                            {item.TOT_SUPLY_HSHLDCO?.toLocaleString() || <span className={styles.emptyData}>-</span>}
                                        </td>
                                        <td className={styles.number}>
                                            {(item.LTTOT_TOP_AMOUNT && item.LTTOT_TOP_AMOUNT > 0)
                                                ? formatPrice(item.LTTOT_TOP_AMOUNT)
                                                : (() => {
                                                    const extra = extraData[`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`];
                                                    if (!extra) return <span className={styles.emptyData}>-</span>;

                                                    let price = extra.totals?.priceThousand;
                                                    if (!price && extra.rows?.length > 0) {
                                                        price = Math.max(...extra.rows.map((r: any) => r.priceThousand || 0));
                                                    }

                                                    return (price && price > 0) ? formatPrice(price) : <span className={styles.emptyData}>-</span>;
                                                })()}
                                        </td>
                                        <td className={`${styles.rate} ${!stats?.special?.rate ? styles.emptyData : ""}`}>
                                            {formatRate(stats?.special?.rate)}
                                        </td>
                                        <td className={`${styles.rate} ${!stats?.rank1?.rate ? styles.emptyData : ""}`}>
                                            {formatRate(stats?.rank1?.rate)}
                                        </td>
                                        <td className={`${styles.rate} ${!stats?.rank2?.rate ? styles.emptyData : ""}`}>
                                            {formatRate(stats?.rank2?.rate)}
                                        </td>
                                        <td className={`${styles.rateTotal} ${!stats?.total?.rate ? styles.emptyData : ""}`}>
                                            {formatRate(stats?.total?.rate)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                    >
                        &lt;&lt;
                    </button>
                    <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                    >
                        &lt;
                    </button>
                    {getPageNumbers().map((num) => (
                        <button
                            key={num}
                            onClick={() => setCurrentPage(num)}
                            className={num === currentPage ? styles.active : ""}
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                    >
                        &gt;
                    </button>
                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                    >
                        &gt;&gt;
                    </button>
                </div>
            )}
        </div>
    );
}
