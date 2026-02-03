"use client";

import React from "react";
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
import { useDashboardStats } from "@/hooks/useDashboardStats";
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
    startMonth?: string;
    endMonth?: string;
}

export default function StatsDashboard({
    data,
    extraData,
    archiveCache,
    startMonth,
    endMonth,
}: StatsDashboardProps) {
    // Custom Hook을 사용하여 통계 데이터 계산
    const stats = useDashboardStats(data, extraData, archiveCache, startMonth, endMonth);

    // 데이터 범위 검증 (디버깅용)
    React.useEffect(() => {
        if (data.length > 0 && (startMonth || endMonth)) {
            const dates = data
                .map(item => item.RCRIT_PBLANC_DE)
                .filter(Boolean)
                .sort();

            const actualStartDate = dates[0] || '';
            const actualEndDate = dates[dates.length - 1] || '';

            const actualStartMonth = actualStartDate.substring(0, 7); // YYYY-MM
            const actualEndMonth = actualEndDate.substring(0, 7);

            const requestedStart = startMonth || '';
            const requestedEnd = endMonth || '';

            console.log(`📊 [StatsDashboard] 데이터 범위 검증:`, {
                요청된범위: `${requestedStart} ~ ${requestedEnd}`,
                실제데이터범위: `${actualStartMonth} ~ ${actualEndMonth}`,
                데이터건수: data.length,
                일치여부: (requestedStart <= actualStartMonth && requestedEnd >= actualEndMonth) ? '✅' : '⚠️'
            });

            // 불일치 경고
            if (requestedStart && actualStartMonth && requestedStart < actualStartMonth) {
                console.warn(`⚠️ [StatsDashboard] 경고: 요청된 시작 월(${requestedStart})이 실제 데이터 시작 월(${actualStartMonth})보다 이릅니다.`);
                console.warn(`   → "조회" 버튼을 다시 클릭하여 데이터를 새로고침하세요.`);
            }
            if (requestedEnd && actualEndMonth && requestedEnd > actualEndMonth) {
                console.warn(`⚠️ [StatsDashboard] 경고: 요청된 종료 월(${requestedEnd})이 실제 데이터 종료 월(${actualEndMonth})보다 늦습니다.`);
                console.warn(`   → "조회" 버튼을 다시 클릭하여 데이터를 새로고침하세요.`);
            }
        }
    }, [data, startMonth, endMonth]);

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
