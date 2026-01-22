"use client";

import React, { useMemo } from "react";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { AptInfo, CacheData } from "@/lib/cache-loader";
import styles from "./StatsDashboard.module.css";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface StatsDashboardProps {
    data: AptInfo[];
    extraData: Record<string, any>;
    archiveCache: CacheData | null;
}

export default function StatsDashboard({
    data,
    extraData,
    archiveCache,
}: StatsDashboardProps) {
    // 데이터 집계
    const stats = useMemo(() => {
        let supplyTotal = 0;
        let requestTotal = 0;

        let supplyRank1 = 0;
        let requestRank1 = 0;

        let supplyRank2 = 0;
        let requestRank2 = 0;

        let supplySpecial = 0;
        let requestSpecial = 0;

        let maxCompetition = { name: "", rate: 0 };

        // 월별 집계 (확장: 각 순위별 추적)
        const monthlyStats: Record<string, {
            supply: number;
            request: number;
            special: { supply: number; request: number };
            rank1: { supply: number; request: number };
            rank2: { supply: number; request: number };
        }> = {};

        // 주택구분별 집계
        const typeStats: Record<string, { supply: number; request: number }> = {};

        console.log(`[StatsDashboard] 집계 시작: ${data.length}개 항목`);
        let processedCount = 0;
        let hasDetailedStatsCount = 0;

        data.forEach((item) => {
            const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

            // ✅ 임시 수정: archiveCache에는 request 데이터가 없으므로 extraData만 사용
            // TODO: 캐시 재생성 후 archiveCache 우선 순위로 변경
            const itemStats = extraData[key]?.totals;

            // 캐시 데이터가 없거나 'Total' 행만 있는 경우(상세 경쟁률 누락)에 대한 보완 로직
            const hasDetailedStats = itemStats && itemStats.stages && itemStats.stages.total && itemStats.stages.total.rate !== undefined;

            // 🚨 긴급 디버깅: 실제 런타임 데이터 구조 확인
            if (data.indexOf(item) < 3) {
                console.log(`🔍 [EMERGENCY DEBUG] ${item.HOUSE_NM}:`, {
                    key,
                    'archiveCache exists': !!archiveCache?.calculatedStats?.[key],
                    'extraData exists': !!extraData[key],
                    'itemStats exists': !!itemStats,
                    'itemStats type': typeof itemStats,
                    'itemStats keys': itemStats ? Object.keys(itemStats) : 'NO_STATS',
                    'itemStats.stages': itemStats?.stages,
                    'itemStats.supplyTotal': itemStats?.supplyTotal,
                    'hasDetailedStats': hasDetailedStats,
                    'stages.total.request': itemStats?.stages?.total?.request,
                    'stages.total.rate': itemStats?.stages?.total?.rate,
                    'FULL itemStats': itemStats  // 전체 객체 출력
                });
            }

            if (hasDetailedStats) {
                hasDetailedStatsCount++;
                processedCount++;

                // [DEBUG] 정상 데이터 로깅 (첫 5개만)
                if (data.indexOf(item) < 5) {
                    // console.log(`[StatsDashboard] Used Cache: ${item.HOUSE_NM}`);
                }

                // 공급수 중복 합산 방지 (이미 calculatedStats 생성 시 처리됨)
                const itemSupply = itemStats.supplyTotal || 0;

                // ✅ 수정: totals는 이미 합산된 데이터이므로 total.request를 직접 사용
                const itemRequestTotal = itemStats.stages.total.request || 0;

                supplyTotal += itemSupply;
                requestTotal += itemRequestTotal;

                supplyRank1 += itemStats.stages.rank1.target || 0;
                requestRank1 += itemStats.stages.rank1.request || 0;

                supplyRank2 += itemStats.stages.rank2.target || 0;
                requestRank2 += itemStats.stages.rank2.request || 0;

                supplySpecial += itemStats.stages.special.target || 0;
                requestSpecial += itemStats.stages.special.request || 0;

                // 최고 경쟁률 갱신
                const currentTotalRate = itemStats.stages.total.rate || 0;
                if (currentTotalRate > maxCompetition.rate) {
                    maxCompetition = { name: item.HOUSE_NM || "", rate: currentTotalRate };
                }
            } else {
                // [FALLBACK] 통계 데이터가 없거나 불완전할 경우, 기본 필드 사용

                // 1. 공급 세대수 합산
                const supply = Number(item.TOT_SUPLY_HSHLDCO || 0);
                supplyTotal += supply;

                // 2. 경쟁률 정보가 API 응답(item) 자체에 포함되어 있는지 확인 (일부 필드 존재 가능성)
                // 주의: API 원본 데이터에는 '접수건수' 필드가 명시적으로 없는 경우가 많음 (경쟁률만 텍스트로 존재 등)
                // 따라서 여기서는 '공급수'는 확실히 더하고, '접수건수'는 추정하거나 0으로 둠.
                // 단, 청약 경쟁률 대시보드 특성상 경쟁률이 중요하므로, 
                // item의 경쟁률 텍스트 등을 파싱해서 역산할 수도 있으나 복잡함.

                // 여기서는 최소한 '최고 경쟁률'이라도 갱신 시도
                // (일부 API 데이터에 경쟁률 필드가 있을 수 있음 - 예: GNRL_RNK1_CR)

                // TODO: 추후 detail-data.ts의 로직을 가져와서 실시간 계산하는 것이 가장 정확함.
                // 현재는 공급수라도 맞추는 것에 집중.
            }

            // 공통: 월별/유형별 집계 (공급수 기준)
            const itemSupply = itemStats?.supplyTotal || Number(item.TOT_SUPLY_HSHLDCO || 0);

            // 월별 집계 (확장: 각 순위별 추적)
            if (item.RCRIT_PBLANC_DE) {
                const monthKey = item.RCRIT_PBLANC_DE.substring(0, 7); // YYYY-MM
                if (!monthlyStats[monthKey]) {
                    monthlyStats[monthKey] = {
                        supply: 0,
                        request: 0,
                        special: { supply: 0, request: 0 },
                        rank1: { supply: 0, request: 0 },
                        rank2: { supply: 0, request: 0 }
                    };
                }
                monthlyStats[monthKey].supply += itemSupply;
                if (hasDetailedStats) {
                    // 전체 통계
                    monthlyStats[monthKey].request += itemStats.stages.total.request || 0;

                    // 순위별 통계
                    monthlyStats[monthKey].special.supply += itemStats.stages.special.target || 0;
                    monthlyStats[monthKey].special.request += itemStats.stages.special.request || 0;

                    monthlyStats[monthKey].rank1.supply += itemStats.stages.rank1.target || 0;
                    monthlyStats[monthKey].rank1.request += itemStats.stages.rank1.request || 0;

                    monthlyStats[monthKey].rank2.supply += itemStats.stages.rank2.target || 0;
                    monthlyStats[monthKey].rank2.request += itemStats.stages.rank2.request || 0;
                }
            }

            // 주택 구분별 집계
            const houseType = item.HOUSE_DTL_SECD_NM || "기타";
            if (!typeStats[houseType]) {
                typeStats[houseType] = { supply: 0, request: 0 };
            }
            typeStats[houseType].supply += itemSupply;
            if (hasDetailedStats) {
                const req = itemStats.stages.total.request || 0;
                typeStats[houseType].request += req;
            }
        });

        console.log(`[StatsDashboard] 집계 완료:`, {
            총항목수: data.length,
            통계있는항목수: hasDetailedStatsCount,
            총공급: supplyTotal,
            총청약: requestTotal,
            전체경쟁률: supplyTotal > 0 ? requestTotal / supplyTotal : 0
        });


        return {
            supplyTotal,
            requestTotal,
            rateTotal: supplyTotal > 0 ? requestTotal / supplyTotal : 0,
            rateRank1: supplyRank1 > 0 ? requestRank1 / supplyRank1 : 0,
            rateRank2: supplyRank2 > 0 ? requestRank2 / supplyRank2 : 0,
            rateSpecial: supplySpecial > 0 ? requestSpecial / supplySpecial : 0,
            maxCompetition,
            monthlyStats,
            typeStats,
        };
    }, [data, extraData, archiveCache]);

    // 차트 데이터 준비
    const monthlyLabels = Object.keys(stats.monthlyStats).sort();
    const monthlyChartData = {
        labels: monthlyLabels,
        datasets: [
            {
                label: "특별공급 경쟁률",
                data: monthlyLabels.map(m => {
                    const s = stats.monthlyStats[m].special.supply;
                    const r = stats.monthlyStats[m].special.request;
                    return s > 0 ? r / s : 0;
                }),
                borderColor: "rgb(255, 159, 64)",
                backgroundColor: "rgba(255, 159, 64, 0.5)",
                tension: 0.3,
                borderWidth: 2,
            },
            {
                label: "1순위 경쟁률",
                data: monthlyLabels.map(m => {
                    const s = stats.monthlyStats[m].rank1.supply;
                    const r = stats.monthlyStats[m].rank1.request;
                    return s > 0 ? r / s : 0;
                }),
                borderColor: "rgb(54, 162, 235)",
                backgroundColor: "rgba(54, 162, 235, 0.5)",
                tension: 0.3,
                borderWidth: 2,
            },
            {
                label: "2순위 경쟁률",
                data: monthlyLabels.map(m => {
                    const s = stats.monthlyStats[m].rank2.supply;
                    const r = stats.monthlyStats[m].rank2.request;
                    return s > 0 ? r / s : 0;
                }),
                borderColor: "rgb(153, 102, 255)",
                backgroundColor: "rgba(153, 102, 255, 0.5)",
                tension: 0.3,
                borderWidth: 2,
            },
            {
                label: "전체 경쟁률",
                data: monthlyLabels.map(m => {
                    const s = stats.monthlyStats[m].supply;
                    const r = stats.monthlyStats[m].request;
                    return s > 0 ? r / s : 0;
                }),
                borderColor: "rgb(255, 99, 132)",
                backgroundColor: "rgba(255, 99, 132, 0.5)",
                tension: 0.3,
                borderWidth: 3,
            },
            {
                label: "공급 세대수 (x100)", // 스케일 조정 (시각화를 위해)
                data: monthlyLabels.map(m => stats.monthlyStats[m].supply / 100),
                borderColor: "rgb(53, 162, 235)",
                backgroundColor: "rgba(53, 162, 235, 0.5)",
                type: 'bar' as const,
                yAxisID: 'y1',
            }
        ],
    };

    const typeLabels = Object.keys(stats.typeStats);
    const typeChartData = {
        labels: typeLabels,
        datasets: [
            {
                label: "공급 세대수",
                data: typeLabels.map(t => stats.typeStats[t].supply),
                backgroundColor: "rgba(53, 162, 235, 0.5)",
            },
            {
                label: "접수 건수 (x0.1)", // 접수건수가 너무 많을 수 있으므로 스케일 조정 고려
                data: typeLabels.map(t => stats.typeStats[t].request * 0.1),
                backgroundColor: "rgba(255, 99, 132, 0.5)",
            },
        ],
    };

    if (data.length === 0) return null;

    return (
        <div className={styles.container}>
            {/* 주요 지표 카드 */}
            <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                    <h3>총 공급 규모</h3>
                    <p className={styles.value}>{stats.supplyTotal.toLocaleString()} <span className={styles.unit}>세대</span></p>
                </div>
                <div className={styles.metricCard}>
                    <h3>총 청약 건수</h3>
                    <p className={styles.value}>{stats.requestTotal.toLocaleString()} <span className={styles.unit}>건</span></p>
                </div>
                <div className={styles.metricCard}>
                    <h3>전체 경쟁률</h3>
                    <p className={`${styles.value} ${styles.high}`}>{stats.rateTotal.toFixed(2)}:1</p>
                </div>
                <div className={styles.metricCard}>
                    <h3>1순위 경쟁률</h3>
                    <p className={`${styles.value} ${styles.highlight}`}>{stats.rateRank1.toFixed(2)}:1</p>
                </div>
                <div className={styles.metricCard}>
                    <h3>최고 경쟁률 단지</h3>
                    <p className={styles.subValueName}>{stats.maxCompetition.name}</p>
                    <p className={`${styles.value} ${styles.super}`}>{stats.maxCompetition.rate.toFixed(2)}:1</p>
                </div>
            </div>

            {/* 차트 영역 */}
            <div className={styles.chartsGrid}>
                <div className={styles.chartCard}>
                    <h3>월별 청약 경쟁률 추이</h3>
                    <div className={styles.chartWrapper}>
                        <Line
                            data={monthlyChartData as any}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                interaction: {
                                    mode: 'index',
                                    intersect: false,
                                },
                                scales: {
                                    y: {
                                        type: 'linear',
                                        display: true,
                                        position: 'left',
                                        title: { display: true, text: '경쟁률' }
                                    },
                                    y1: {
                                        type: 'linear',
                                        display: true,
                                        position: 'right',
                                        grid: { drawOnChartArea: false },
                                        title: { display: true, text: '공급 (백 세대)' }
                                    },
                                }
                            }}
                        />
                    </div>
                </div>
                <div className={styles.chartCard}>
                    <h3>주택 유형별 공급 vs 수요 (수요 1/10 축소)</h3>
                    <div className={styles.chartWrapper}>
                        <Bar
                            data={typeChartData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
