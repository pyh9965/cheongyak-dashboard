"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { parseAddress } from "@/lib/address-parser";
import { getCoordinates as getGeoCoordinates, type Coordinates } from "@/lib/geo-coordinates";
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

// GeoJSON 시/도명 → 정규화 키 매핑
const GEOJSON_NAME_TO_KEY: Record<string, string> = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
};

function getRateColor(rate: number | null): string {
    if (rate === null) return "#9CA3AF";
    if (rate < 1) return "#3B82F6";
    if (rate < 5) return "#22C55E";
    if (rate < 20) return "#EAB308";
    if (rate < 50) return "#F97316";
    return "#EF4444";
}

function getRateFillColor(rate: number | null): string {
    if (rate === null) return "#E5E7EB";
    if (rate < 1) return "#93C5FD";
    if (rate < 5) return "#86EFAC";
    if (rate < 20) return "#FDE047";
    if (rate < 50) return "#FDBA74";
    return "#FCA5A5";
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

// GeoJSON 폴리곤의 중심점(centroid) 계산
function getPolygonCentroid(feature: any): [number, number] | null {
    try {
        const geometry = feature.geometry;
        if (!geometry) return null;

        let allCoords: number[][] = [];

        if (geometry.type === "Polygon") {
            allCoords = geometry.coordinates[0];
        } else if (geometry.type === "MultiPolygon") {
            // 가장 큰 폴리곤의 중심을 사용
            let maxArea = 0;
            let largestRing: number[][] = [];
            geometry.coordinates.forEach((polygon: number[][][]) => {
                const ring = polygon[0];
                // 면적 근사 계산
                let area = 0;
                for (let i = 0; i < ring.length - 1; i++) {
                    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
                }
                area = Math.abs(area / 2);
                if (area > maxArea) {
                    maxArea = area;
                    largestRing = ring;
                }
            });
            allCoords = largestRing;
        }

        if (allCoords.length === 0) return null;

        // Centroid 계산
        let sumLat = 0, sumLng = 0;
        allCoords.forEach(coord => {
            sumLng += coord[0];
            sumLat += coord[1];
        });
        return [sumLat / allCoords.length, sumLng / allCoords.length];
    } catch {
        return null;
    }
}

// 시/도별 라벨 위치 보정 (폴리곤 centroid가 부정확한 경우)
const LABEL_OFFSET: Record<string, [number, number]> = {
    "서울": [0.02, 0],
    "인천": [0, -0.05],
    "세종": [0, 0],
    "제주": [0, 0],
};

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
    const markerClusterGroupRef = useRef<any>(null);

    // GeoJSON 관련 refs
    const geoJsonLayerRef = useRef<any>(null);
    const geoJsonDataRef = useRef<any>(null);
    const labelMarkersRef = useRef<any[]>([]);

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

    // regionData를 key로 빠르게 조회할 수 있는 Map
    const regionDataMap = useMemo(() => {
        const map = new Map<string, RegionData>();
        regionData.forEach(r => map.set(r.key, r));
        return map;
    }, [regionData]);

    const selectedRegionItems = useMemo(() => {
        if (!selectedRegion) return [];
        const region = regionData.find((r) => r.key === selectedRegion);
        return region?.items || [];
    }, [selectedRegion, regionData]);

    // GeoJSON 데이터 로드 (한 번만)
    useEffect(() => {
        if (geoJsonDataRef.current) return;
        fetch("/data/geo/skorea-provinces-geo.json")
            .then(res => res.json())
            .then(data => {
                geoJsonDataRef.current = data;
            })
            .catch(err => console.error("GeoJSON 로드 실패:", err));
    }, []);

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
                        } catch (e) {
                            console.warn("Map invalidateSize in init failed:", e);
                        }
                    }
                }, 200);

                leafletMapRef.current = map;
                setIsMapReady(true);
            };
            document.body.appendChild(clusterScript);
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

    // Choropleth 레이어 제거 함수
    const removeChoropleth = useCallback(() => {
        if (geoJsonLayerRef.current && leafletMapRef.current) {
            try { leafletMapRef.current.removeLayer(geoJsonLayerRef.current); } catch (e) { }
            geoJsonLayerRef.current = null;
        }
        labelMarkersRef.current.forEach(m => {
            try { m.remove(); } catch (e) { }
        });
        labelMarkersRef.current = [];
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
        const timer = setTimeout(() => {
            if (!leafletMapRef.current) return;

            // 기존 마커 제거
            markersRef.current.forEach((marker) => {
                try { marker.remove(); } catch (e) { }
            });
            markersRef.current = [];

            // 기존 Choropleth 제거
            removeChoropleth();

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

            if (currentZoom < 9) {
                // ============================================
                // 1. Choropleth 지도 (줌 < 9, 시/도 레벨)
                // ============================================
                if (markerClusterGroupRef.current) {
                    try { leafletMapRef.current.removeLayer(markerClusterGroupRef.current); } catch (e) { }
                }

                const geoData = geoJsonDataRef.current;
                if (!geoData) {
                    // GeoJSON 아직 로드 안됨 — fallback으로 circle 마커 사용
                    renderCircleMarkers(L, regionData);
                    return;
                }

                // GeoJSON Choropleth 레이어 생성
                const geoLayer = L.geoJSON(geoData, {
                    style: (feature: any) => {
                        const name = feature?.properties?.name || "";
                        const key = GEOJSON_NAME_TO_KEY[name] || name;
                        const region = regionDataMap.get(key);
                        const rate = region?.avgRate ?? null;
                        const fillColor = getRateFillColor(rate);
                        const borderColor = getRateColor(rate);

                        return {
                            fillColor: fillColor,
                            weight: 2,
                            opacity: 1,
                            color: '#ffffff',
                            fillOpacity: region ? 0.65 : 0.3,
                        };
                    },
                    onEachFeature: (feature: any, layer: any) => {
                        const name = feature?.properties?.name || "";
                        const key = GEOJSON_NAME_TO_KEY[name] || name;
                        const region = regionDataMap.get(key);

                        // 툴팁
                        const tooltipContent = region
                            ? `<strong>${key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`
                            : `<strong>${key}</strong><br/>데이터 없음`;

                        layer.bindTooltip(tooltipContent, {
                            direction: "center",
                            className: "choropleth-tooltip",
                            sticky: true,
                        });

                        // 호버 효과
                        layer.on("mouseover", (e: any) => {
                            const target = e.target;
                            target.setStyle({
                                weight: 3,
                                color: '#374151',
                                fillOpacity: 0.85,
                            });
                            target.bringToFront();
                        });

                        layer.on("mouseout", (e: any) => {
                            geoLayer.resetStyle(e.target);
                        });

                        // 클릭 시 줌인
                        layer.on("click", () => {
                            const bounds = layer.getBounds();
                            leafletMapRef.current.fitBounds(bounds, { padding: [20, 20] });
                            setSelectedRegion(key);
                        });
                    }
                });

                geoLayer.addTo(leafletMapRef.current);
                geoJsonLayerRef.current = geoLayer;

                // 라벨 마커 추가 (각 시/도 중심에 이름 + 경쟁률)
                geoData.features.forEach((feature: any) => {
                    const name = feature?.properties?.name || "";
                    const key = GEOJSON_NAME_TO_KEY[name] || name;
                    const region = regionDataMap.get(key);

                    // centroid 계산
                    let centroid = getPolygonCentroid(feature);
                    if (!centroid) return;

                    // 라벨 위치 보정
                    const offset = LABEL_OFFSET[key] || [0, 0];
                    centroid = [centroid[0] + offset[0], centroid[1] + offset[1]];

                    const rate = region?.avgRate ?? null;
                    const rateText = rate !== null ? rate.toFixed(2) + ":1" : "";
                    const color = getRateColor(rate);
                    const itemCount = region?.itemCount || 0;

                    const labelHtml = `<div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 1px;
                        pointer-events: none;
                    ">
                        ${rateText ? `<span style="
                            font-size: 15px;
                            font-weight: 800;
                            color: ${color};
                            text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 1px -1px 2px rgba(255,255,255,0.9), -1px 1px 2px rgba(255,255,255,0.9);
                            letter-spacing: -0.5px;
                        ">${rateText}</span>` : ''}
                        <span style="
                            font-size: 11px;
                            font-weight: 700;
                            color: #374151;
                            background: rgba(255,255,255,0.85);
                            padding: 1px 6px;
                            border-radius: 3px;
                            white-space: nowrap;
                        ">${key}</span>
                        ${itemCount > 0 ? `<span style="
                            font-size: 9px;
                            color: #6b7280;
                            background: rgba(255,255,255,0.75);
                            padding: 0 4px;
                            border-radius: 2px;
                        ">${itemCount}건</span>` : ''}
                    </div>`;

                    const icon = L.divIcon({
                        html: labelHtml,
                        className: "",
                        iconSize: [80, 50],
                        iconAnchor: [40, 25],
                    });

                    const labelMarker = L.marker(centroid, {
                        icon,
                        interactive: false,
                        zIndexOffset: 1000,
                    });

                    labelMarker.addTo(leafletMapRef.current);
                    labelMarkersRef.current.push(labelMarker);
                });

            } else if (currentZoom < 11) {
                // ============================================
                // 2. 시/군/구 Circle 마커 (줌 9-10)
                // ============================================
                if (markerClusterGroupRef.current) {
                    try { leafletMapRef.current.removeLayer(markerClusterGroupRef.current); } catch (e) { }
                }

                renderCircleMarkers(L, regionData);

            } else {
                // ============================================
                // 3. 개별 아파트 마커 (줌 >= 11)
                // ============================================
                const clusterGroup = markerClusterGroupRef.current;
                if (clusterGroup) clusterGroup.addTo(leafletMapRef.current);

                data.forEach(item => {
                    const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

                    let coords: Coordinates | null = item.coordinates || null;
                    if (!coords && item.HSSPLY_ADRES) {
                        const parsed = parseAddress(item.HSSPLY_ADRES);
                        if (parsed) {
                            coords = getGeoCoordinates(parsed.fullKey);
                        }
                    }

                    if (!coords) return;

                    const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
                    let rate: number | null = null;

                    if (stages) {
                        // @ts-ignore
                        rate = stages[rateType]?.rate;
                    }

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
                            iconSize: [null, 24],
                            iconAnchor: [20, 12]
                        });

                        const marker = L.marker([coords[0], coords[1]], { icon });

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

        // Circle 마커 렌더링 함수 (시/군/구 레벨 + fallback)
        function renderCircleMarkers(L: any, regions: RegionData[]) {
            regions.forEach((region) => {
                if (!region.coordinates) return;

                const color = getRateColor(region.avgRate);
                const radius = getCircleRadius(region.totalSupply);

                try {
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
        }

    }, [isMapReady, regionData, regionDataMap, currentZoom, data, rateType, archiveCache, removeChoropleth]);

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

            {/* 선택된 지역 패널 */}
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
