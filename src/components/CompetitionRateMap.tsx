"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { parseAddress, cleanAddressForGeocoding } from "@/lib/address-parser";
import { getCoordinates as getGeoCoordinates, type Coordinates } from "@/lib/geo-coordinates";
import { restoreGeocodeCache } from "@/lib/geocoding";
import { AptInfo, CacheData, CachedStats } from "@/lib/cache-loader";
import { useCompetitionMapStats, RegionData } from "@/hooks/useCompetitionMapStats";
import styles from "./CompetitionRateMap.module.css";
import { getCompetitionStagesSync } from "@/hooks/utils";

// 타입 정의
export type ExtraData = {
    totals?: {
        supplyTotal: number;
        stages: {
            special: { rate: number | null; target?: number; request?: number };
            rank1: { rate: number | null; target?: number; request?: number };
            rank2: { rate: number | null; target?: number; request?: number };
            total: { rate: number | null; target?: number; request?: number };
        };
    };
};

export type RateType = "special" | "rank1" | "rank2" | "total";

interface CompetitionRateMapProps {
    data: AptInfo[];
    extraData: Record<string, ExtraData>;
    archiveCache: CacheData | null;
    rateType: RateType;
    startDate: string;
    endDate: string;
    onRateTypeChange: (type: RateType) => void;
    onDateChange: (start: string, end: string) => void;
    onItemClick: (item: AptInfo) => void;
}

function getRateColor(rate: number | null): string {
    if (rate === null) return "#9CA3AF";
    if (rate < 1) return "#3B82F6";
    if (rate < 5) return "#22C55E";
    if (rate < 20) return "#EAB308";
    if (rate < 50) return "#F97316";
    return "#EF4444";
}

function getCircleRadius(supply: number): number {
    if (supply <= 100) return 8;
    if (supply <= 500) return 12;
    if (supply <= 1000) return 16;
    if (supply <= 5000) return 22;
    return 28;
}

function formatRate(rate: number | null): string {
    if (rate === null) return "-";
    return `${rate.toFixed(2)}:1`;
}

function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, "");
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

export default function CompetitionRateMap({
    data,
    extraData,
    archiveCache,
    rateType,
    startDate,
    endDate,
    onRateTypeChange,
    onDateChange,
    onItemClick,
}: CompetitionRateMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const [isMapReady, setIsMapReady] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
    const [currentZoom, setCurrentZoom] = useState(7);
    const [individualMarkers, setIndividualMarkers] = useState<Record<string, Coordinates>>({});
    const markerClusterGroupRef = useRef<any>(null);
    const attemptedGeocodesRef = useRef<Set<string>>(new Set());

    // 지오코딩 캐시 초기화
    useEffect(() => {
        restoreGeocodeCache();
    }, []);

    // 날짜 필터링
    const filteredData = useMemo(() => {
        if (!startDate && !endDate) return data;
        const start = startDate ? parseDate(startDate.replace(/-/g, "")) : null;
        const end = endDate ? parseDate(endDate.replace(/-/g, "")) : null;
        return data.filter((item) => {
            const itemDate = parseDate(item.RCRIT_PBLANC_DE || "");
            if (!itemDate) return true;
            if (start && itemDate < start) return false;
            if (end && itemDate > end) return false;
            return true;
        });
    }, [data, startDate, endDate]);

    // Custom Hook을 사용하여 통계 계산 및 지역 그룹핑
    const { regionData, processingStatus } = useCompetitionMapStats(
        filteredData,
        extraData,
        archiveCache,
        rateType,
        currentZoom
    );

    const selectedRegionItems = useMemo(() => {
        if (!selectedRegion) return [];
        const region = regionData.find((r) => r.key === selectedRegion);
        return region?.items || [];
    }, [selectedRegion, regionData]);

    // Leaflet 초기화 (vanilla)
    useEffect(() => {
        if (typeof window === "undefined" || !mapRef.current) return;

        // CSS 로드
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        // MarkerCluster CSS 로드
        const clusterCSS = document.createElement("link");
        clusterCSS.rel = "stylesheet";
        clusterCSS.href = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css";
        document.head.appendChild(clusterCSS);

        // Leaflet 스크립트 로드
        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;

        script.onload = () => {
            // Kakao SDK 로드 (지오코딩용)
            const kakaoScript = document.createElement("script");
            kakaoScript.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&autoload=false&libraries=services`;
            kakaoScript.async = true;

            kakaoScript.onload = () => {
                const kakao = (window as any).kakao;
                if (kakao) {
                    kakao.maps.load(() => {
                        console.log("Kakao Maps SDK loaded");
                    });
                }

                // MarkerCluster 스크립트 로드
                const clusterScript = document.createElement("script");
                clusterScript.src = "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js";
                clusterScript.onload = () => {
                    if (!mapRef.current) return;

                    const L = (window as any).L;
                    if (!L || !L.markerClusterGroup) return;

                    // 지도 초기화
                    const map = L.map(mapRef.current, {
                        preferCanvas: false
                    }).setView([36.5, 127.5], 7);

                    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                    }).addTo(map);

                    // 줌 레벨 이벤트 핸들러
                    map.on('zoomend', () => {
                        const zoom = map.getZoom();
                        setCurrentZoom(zoom);
                    });

                    // 지도 사이즈 조정
                    setTimeout(() => {
                        if (leafletMapRef.current) {
                            try {
                                leafletMapRef.current.invalidateSize();
                                console.log("Map invalidateSize called successfully");
                            } catch (e) {
                                console.warn("Map invalidateSize in init failed:", e);
                            }
                        }
                    }, 200);

                    leafletMapRef.current = map;
                    setIsMapReady(true);
                    console.log("지도 & 클러스터 초기화 완료");
                };
                document.body.appendChild(clusterScript);
            };
            document.body.appendChild(kakaoScript);
        };
        document.body.appendChild(script);

        return () => {
            if (leafletMapRef.current) {
                leafletMapRef.current.remove();
                leafletMapRef.current = null;
            }
            document.head.removeChild(link);
            if (script.parentNode) {
                document.body.removeChild(script);
            }
        };
    }, []);

    // 마커 업데이트
    useEffect(() => {
        if (!isMapReady || !leafletMapRef.current) return;

        const L = (window as any).L;
        if (!L) return;

        // 지도 사이즈 재계산
        try {
            leafletMapRef.current.invalidateSize();
        } catch (e) {
            console.warn("Map invalidateSize failed:", e);
        }

        // 충분한 지연 후 마커 추가
        // 지오코딩 (줌 레벨 11 이상일 때) - SDK Geocoder 사용
        const checkAndGeocode = async () => {
            if (currentZoom < 11 || data.length === 0) return;

            // 좌표가 없는 항목 식별
            const targets = data.filter(item => {
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                return !individualMarkers[key] && item.HSSPLY_ADRES;
            });

            if (targets.length === 0) return;

            // 상위 30개만 우선 처리 (속도 향상)
            const batchTargets = targets.filter(item => {
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                return !attemptedGeocodesRef.current.has(key);
            }).slice(0, 30);

            if (batchTargets.length === 0) return;

            const kakao = (window as any).kakao;

            if (!kakao || !kakao.maps || !kakao.maps.services) {
                console.warn("Kakao Services 라이브러리가 로드되지 않았습니다.");
                return;
            }

            const geocoder = new kakao.maps.services.Geocoder();

            console.log(`📍 SDK 지오코딩 시작: ${batchTargets.length}건`);

            // 순차적 처리 (Rate Limit 방지)
            for (const item of batchTargets) {
                const rawAddr = item.HSSPLY_ADRES;
                if (!rawAddr) continue;

                // 시도한 것으로 표시 (성공하든 실패하든 다시 시도 안 함)
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                attemptedGeocodesRef.current.add(key);

                // 1차: 원본 주소에서 괄호만 제거하고 시도 (정확한 번지 유지)
                const addrWithoutParen = rawAddr.replace(/\([^)]*\)/g, "").trim();

                geocoder.addressSearch(addrWithoutParen, (result: any[], status: any) => {
                    if (status === kakao.maps.services.Status.OK && result[0]) {
                        const coords: Coordinates = [parseFloat(result[0].y), parseFloat(result[0].x)];
                        setIndividualMarkers(prev => ({ ...prev, [key]: coords }));
                        console.log(`✅ 지오코딩 성공 (1차): ${addrWithoutParen}`);
                    } else {
                        // 2차: 정제된 주소로 재시도 (동 단위)
                        const cleanedAddr = cleanAddressForGeocoding(rawAddr);
                        if (!cleanedAddr) {
                            console.warn(`지오코딩 실패: 정제 불가 - ${rawAddr}`);
                            return;
                        }

                        geocoder.addressSearch(cleanedAddr, (result2: any[], status2: any) => {
                            if (status2 === kakao.maps.services.Status.OK && result2[0]) {
                                const coords: Coordinates = [parseFloat(result2[0].y), parseFloat(result2[0].x)];
                                setIndividualMarkers(prev => ({ ...prev, [key]: coords }));
                                console.log(`✅ 지오코딩 성공 (2차 폴백): ${cleanedAddr}`);
                            } else {
                                console.warn(`지오코딩 실패 (${status2}): ${cleanedAddr} (원본: ${rawAddr})`);
                            }
                        });
                    }
                });

                // 딜레이 없음 (SDK 내부적으로 처리하기를 기대하거나, 필요시 Promise로 감싸서 delay 추가)
            }
        };

        // 충분한 지연 후 마커 추가 및 지오코딩
        const timer = setTimeout(() => {
            if (!leafletMapRef.current) return;

            // 지오코딩 실행
            checkAndGeocode();

            // 기존 마커 제거
            markersRef.current.forEach((marker) => {
                try { marker.remove(); } catch (e) { }
            });
            markersRef.current = [];

            // 클러스터 그룹 초기화 (필요시)
            if (currentZoom >= 11 && !markerClusterGroupRef.current && (window as any).L?.markerClusterGroup) {
                const L = (window as any).L;
                markerClusterGroupRef.current = L.markerClusterGroup({
                    disableClusteringAtZoom: 16,
                    maxClusterRadius: 30,
                    spiderfyOnMaxZoom: true,
                });
                markerClusterGroupRef.current.addTo(leafletMapRef.current);
            } else if (markerClusterGroupRef.current) {
                markerClusterGroupRef.current.clearLayers();
            }

            if (currentZoom < 11) {
                // 1. 지역별 마커 (줌 < 11)
                if (markerClusterGroupRef.current) {
                    leafletMapRef.current.removeLayer(markerClusterGroupRef.current); // 클러스터 제거
                }

                regionData.forEach((region) => {
                    if (!region.coordinates) return;

                    const color = getRateColor(region.avgRate);
                    const radius = getCircleRadius(region.totalSupply);

                    try {
                        const L = (window as any).L;
                        const latLng = L.latLng(region.coordinates[0], region.coordinates[1]);

                        const iconHtml = `<div style="
                            width: ${radius * 2}px;
                            height: ${radius * 2}px;
                            background-color: ${color};
                            opacity: 0.7;
                            border: 2px solid #fff;
                            border-radius: 50%;
                            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                        "></div>`;

                        const icon = L.divIcon({
                            html: iconHtml,
                            className: "",
                            iconSize: [radius * 2, radius * 2],
                            iconAnchor: [radius, radius]
                        });

                        const marker = L.marker(latLng, { icon });

                        marker.bindTooltip(
                            `<strong>${region.key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`,
                            { direction: "top", offset: [0, -radius] }
                        );

                        // 지역 마커 클릭 시 해당 지역으로 줌
                        marker.on("click", () => {
                            const nextZoom = currentZoom < 9 ? 10 : 13;
                            leafletMapRef.current.setView(latLng, nextZoom);
                            setSelectedRegion(region.key);
                        });

                        marker.addTo(leafletMapRef.current);
                        markersRef.current.push(marker);
                    } catch (e) {
                        console.error("Failed to add region marker:", region.key, e);
                    }
                });
            } else {
                // 2. 개별 아파트 마커 (줌 >= 11)
                const L = (window as any).L;
                const clusterGroup = markerClusterGroupRef.current;

                if (clusterGroup) clusterGroup.addTo(leafletMapRef.current);

                data.forEach(item => {
                    const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

                    // 개별 좌표 우선, 없으면 주소 파싱하여 지역 좌표 사용
                    let coords: Coordinates | null = individualMarkers[itemKey];
                    if (!coords) {
                        const parsed = parseAddress(item.HSSPLY_ADRES);
                        if (parsed) {
                            coords = getGeoCoordinates(parsed.fullKey);
                        }
                    }

                    if (!coords) return; // 좌표가 전혀 없음

                    // 공통 유틸리티를 사용하여 경쟁률 조회 (우선순위: extraData > archiveCache)
                    const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
                    let rate: number | null = null;
                    
                    if (stages) {
                         // @ts-ignore
                         rate = stages[rateType]?.rate;
                    }

                    // 선택된 경쟁률 타입에 데이터가 없으면 마커 표시 안 함 (총 경쟁률은 제외 - 위치 정보 제공 목적)
                    if ((rate === null || rate === undefined) && rateType !== 'total') return;

                    const color = getRateColor(rate);

                    try {
                        const iconHtml = `<div style="
                            padding: 4px 8px;
                            background-color: ${color};
                            border: 2px solid #fff;
                            border-radius: 12px;
                            text-align: center;
                            font-weight: bold;
                            color: white;
                            font-size: 11px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                            white-space: nowrap;
                            min-width: 40px;
                        ">${formatRate(rate)}</div>`;

                        const icon = L.divIcon({
                            html: iconHtml,
                            className: "",
                            iconSize: [null, 24], // Auto width
                            iconAnchor: [20, 12]
                        });

                        const marker = L.marker([coords[0], coords[1]], { icon });

                        // 주택명 라벨 표시
                        marker.bindTooltip(
                            `<div style="font-size:11px; font-weight:bold; color:#333; white-space:nowrap;">${item.HOUSE_NM}</div>`,
                            {
                                direction: "top",
                                offset: [0, -12],
                                permanent: true,
                                opacity: 0.9,
                                className: 'custom-housing-label'
                            }
                        );

                        marker.bindPopup(`
                            <div style="min-width: 200px">
                                <h4 style="margin:0 0 5px">${item.HOUSE_NM}</h4>
                                <p style="margin:0; font-size:12px; color:#666">${item.HSSPLY_ADRES}</p>
                                <div style="margin-top:8px; font-weight:bold">
                                    경쟁률: ${formatRate(rate)}
                                </div>
                            </div>
                        `);

                        marker.on("click", () => onItemClick(item));

                        if (clusterGroup) {
                            clusterGroup.addLayer(marker);
                        } else {
                            marker.addTo(leafletMapRef.current);
                            markersRef.current.push(marker);
                        }
                    } catch (e) {
                        console.warn("Marker error", e);
                    }
                });
            }

        }, 500);

        return () => clearTimeout(timer);
    }, [isMapReady, regionData, currentZoom, data, individualMarkers, rateType, archiveCache]);

    return (
        <div className={styles.container}>
            {/* 필터 */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>경쟁률 종류</label>
                    <select value={rateType} onChange={(e) => onRateTypeChange(e.target.value as RateType)} className={styles.select}>
                        <option value="total">총 경쟁률</option>
                        <option value="special">특별공급</option>
                        <option value="rank1">1순위</option>
                        <option value="rank2">2순위</option>
                    </select>
                </div>
            </div>


            {/* 지도 */}
            <div className={styles.mapWrapper}>
                {(!isMapReady || processingStatus.isProcessing) && (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '140px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#4b5563' }}>
                                {processingStatus.isProcessing ? processingStatus.message : "지도 준비 중..."}
                            </span>
                            {processingStatus.isProcessing && (
                                <div style={{ width: '100%', height: '3px', background: '#f3f4f6', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${processingStatus.percent}%`,
                                        height: '100%',
                                        background: '#3B82F6',
                                        transition: 'width 0.3s ease-out'
                                    }}></div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isMapReady && !processingStatus.isProcessing && regionData.length === 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(255, 255, 255, 0.95)',
                        padding: '24px 40px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        zIndex: 500,
                        textAlign: 'center',
                        border: '1px solid #eee',
                        minWidth: '320px'
                    }}>
                        <p style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                            표시할 데이터가 없습니다
                        </p>
                        <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.6', margin: 0 }}>
                            선택하신 조건에 해당하는 분양 정보가 없습니다.<br />
                            <strong style={{ color: '#ef4444', fontWeight: '500' }}>* 공공분양/임대/국민주택</strong>은 경쟁률 데이터가<br />
                            제공되지 않아 지도에 표시되지 않습니다.
                        </p>
                    </div>
                )}

                <div ref={mapRef} className={styles.map} style={{ height: "100%", width: "100%" }} />
            </div>

            {/* 범례 */}
            <div className={styles.legend}>
                <div className={styles.legendTitle}>경쟁률 범례</div>
                <div className={styles.legendItems}>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#3B82F6" }}></span><span>미달 (1:1 미만)</span></div>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#22C55E" }}></span><span>1:1 ~ 5:1</span></div>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#EAB308" }}></span><span>5:1 ~ 20:1</span></div>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#F97316" }}></span><span>20:1 ~ 50:1</span></div>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#EF4444" }}></span><span>50:1 이상</span></div>
                    <div className={styles.legendItem}><span className={styles.legendColor} style={{ backgroundColor: "#9CA3AF" }}></span><span>데이터 없음</span></div>
                </div>
            </div>

            {/* 선택된 지역 패널 (캐시 기반 데이터도 사용할 수 있도록 수정 필요하지만, 현재는 extraData만 사용하는 것으로 유지하거나 개선 필요) */}
            {
                selectedRegion && selectedRegionItems.length > 0 && (
                    <div className={styles.regionPanel}>
                        <div className={styles.panelHeader}>
                            <h3>{selectedRegion} 청약 목록</h3>
                            <button className={styles.closeButton} onClick={() => setSelectedRegion(null)}>✕</button>
                        </div>
                        <div className={styles.panelContent}>
                            {selectedRegionItems.map((item, idx) => {
                                const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                                const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
                                // @ts-ignore
                                const rate: number | null | undefined = stages?.[rateType]?.rate;

                                return (
                                    <div key={idx} className={styles.panelItem} onClick={() => onItemClick(item)}>
                                        <div className={styles.panelItemName}>{item.HOUSE_NM}</div>
                                        <div className={styles.panelItemInfo}>
                                            <span>{item.SUBSCRPT_AREA_CODE_NM}</span>
                                            <span>•</span>
                                            <span>{item.TOT_SUPLY_HSHLDCO?.toLocaleString() || "-"}세대</span>
                                            <span>•</span>
                                            <span style={{ color: getRateColor(rate ?? null), fontWeight: 600 }}>{formatRate(rate ?? null)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            }
        </div >
    );
}
