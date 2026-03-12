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

function getViewTier(zoom: number): 'choropleth' | 'circle' | 'individual' {
    if (zoom < 9) return 'choropleth';
    if (zoom < 11) return 'circle';
    return 'individual';
}

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

/**
 * 동일 좌표에 여러 마커가 있을 때 나선형으로 분산 배치
 * @param baseCoords - 기본 좌표 [lat, lng]
 * @param index - 해당 좌표 그룹 내에서의 인덱스 (0-based)
 * @param total - 해당 좌표 그룹의 총 마커 수
 * @param zoom - 현재 줌 레벨
 * @returns 오프셋이 적용된 좌표 [lat, lng]
 */
function spreadMarkerCoords(
    baseCoords: [number, number],
    index: number,
    total: number,
    zoom: number
): [number, number] {
    if (total <= 1 || index === 0) return baseCoords;

    // 줌 레벨에 따라 오프셋 반경 조정 (줌이 높을수록 반경 작게)
    // At zoom 11: ~0.005 degrees (~500m), at zoom 17: ~0.0002 (~20m)
    const baseRadius = 0.008 / Math.pow(2, zoom - 11);

    // 나선형 배치: 각 아이템을 원 위에 균등 배치
    const angle = (2 * Math.PI * index) / Math.max(total - 1, 1);
    // 여러 링을 만들어 겹침 방지 (8개 초과 시 바깥 링 추가)
    const ring = Math.floor((index - 1) / 8);
    const ringRadius = baseRadius * (1 + ring * 0.6);

    const latOffset = ringRadius * Math.cos(angle);
    const lngOffset = ringRadius * Math.sin(angle) / Math.cos(baseCoords[0] * Math.PI / 180);

    return [baseCoords[0] + latOffset, baseCoords[1] + lngOffset];
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

// 시/도 코드 접두사 → 시/도명 매핑
const SIDO_CODE_PREFIX: Record<string, string> = {
    '11': '서울', '21': '부산', '22': '대구', '23': '인천', '24': '광주',
    '25': '대전', '26': '울산', '29': '세종', '31': '경기', '32': '강원',
    '33': '충북', '34': '충남', '35': '전북', '36': '전남', '37': '경북',
    '38': '경남', '39': '제주'
};

// 구 코드 → 새 이름 매핑 (행정구역 명칭 변경)
const SIGUNGU_NAME_OVERRIDE: Record<string, string> = {
    '23060': '미추홀구',  // 인천 남구 -> 미추홀구 (2018년 변경)
};

function getSigunguRegionKey(feature: any): string {
    const code = feature?.properties?.code || '';
    const rawName = feature?.properties?.name || '';
    const sido = SIDO_CODE_PREFIX[code.substring(0, 2)] || '';

    // 이름 재정의 확인
    const overrideName = SIGUNGU_NAME_OVERRIDE[code];
    const name = overrideName || rawName;

    // 복합 도시명 정규화: "수원시장안구" -> "수원시 장안구"
    let normalized = name;
    const compoundMatch = name.match(/^(.+시)([가-힣]+구)$/);
    if (compoundMatch && !name.includes(' ')) {
        normalized = compoundMatch[1] + ' ' + compoundMatch[2];
    }

    return `${sido} ${normalized}`;
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
    const [viewTier, setViewTier] = useState<'choropleth' | 'circle' | 'individual'>('choropleth');
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

    // 시/군/구 GeoJSON 데이터 로드 (한 번만)
    const sigunguGeoJsonRef = useRef<any>(null);

    useEffect(() => {
        if (sigunguGeoJsonRef.current) return;
        fetch("/data/geo/skorea-sigungu-geo.json")
            .then(res => res.json())
            .then(data => { sigunguGeoJsonRef.current = data; })
            .catch(err => console.error("시/군/구 GeoJSON 로드 실패:", err));
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
                    const newTier = getViewTier(zoom);
                    setViewTier(prev => prev !== newTier ? newTier : prev);
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

    // Circle 마커 렌더링 함수 (시/군/구 레벨 + fallback)
    const renderCircleMarkers = useCallback((L: any, regions: RegionData[], zoomForClick: number) => {
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
                    const nextZoom = zoomForClick < 9 ? 10 : 13;
                    leafletMapRef.current.setView(latLng, nextZoom);
                    setSelectedRegion(region.key);
                });

                marker.addTo(leafletMapRef.current);
                markersRef.current.push(marker);
            } catch (e) {
                console.error("Failed to add region marker:", region.key, e);
            }
        });
    }, []);

    // Choropleth 레이어 생성 함수
    const buildChoroplethLayer = useCallback((L: any) => {
        const geoData = geoJsonDataRef.current;
        if (!geoData) return false;

        const geoLayer = L.geoJSON(geoData, {
            style: (feature: any) => {
                const name = feature?.properties?.name || "";
                const key = GEOJSON_NAME_TO_KEY[name] || name;
                const region = regionDataMap.get(key);
                const rate = region?.avgRate ?? null;
                const fillColor = getRateFillColor(rate);

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

                const tooltipContent = region
                    ? `<strong>${key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`
                    : `<strong>${key}</strong><br/>데이터 없음`;

                layer.bindTooltip(tooltipContent, {
                    direction: "center",
                    className: "choropleth-tooltip",
                    sticky: true,
                });

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

                layer.on("click", () => {
                    const bounds = layer.getBounds();
                    leafletMapRef.current.fitBounds(bounds, { padding: [20, 20] });
                    setSelectedRegion(key);
                });
            }
        });

        geoLayer.addTo(leafletMapRef.current);
        geoJsonLayerRef.current = geoLayer;
        return true;
    }, [regionDataMap]);

    // Choropleth 라벨 마커 추가 함수
    const buildChoroplethLabels = useCallback((L: any) => {
        const geoData = geoJsonDataRef.current;
        if (!geoData) return;

        geoData.features.forEach((feature: any) => {
            const name = feature?.properties?.name || "";
            const key = GEOJSON_NAME_TO_KEY[name] || name;
            const region = regionDataMap.get(key);

            let centroid = getPolygonCentroid(feature);
            if (!centroid) return;

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
    }, [regionDataMap]);

    // 시/군/구 Choropleth 레이어 생성 함수 (줌 9-10)
    const buildDistrictChoroplethLayer = useCallback((L: any) => {
        const geoData = sigunguGeoJsonRef.current;
        if (!geoData) return false;

        const geoLayer = L.geoJSON(geoData, {
            style: (feature: any) => {
                const key = getSigunguRegionKey(feature);
                const region = regionDataMap.get(key);
                const rate = region?.avgRate ?? null;
                const fillColor = getRateFillColor(rate);

                return {
                    fillColor: fillColor,
                    weight: 1,
                    opacity: 1,
                    color: '#ffffff',
                    fillOpacity: region ? 0.6 : 0.25,
                };
            },
            onEachFeature: (feature: any, layer: any) => {
                const key = getSigunguRegionKey(feature);
                const region = regionDataMap.get(key);

                const tooltipContent = region
                    ? `<strong>${key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`
                    : `<strong>${key}</strong><br/>데이터 없음`;

                layer.bindTooltip(tooltipContent, {
                    direction: "center",
                    className: "choropleth-tooltip",
                    sticky: true,
                });

                layer.on("mouseover", (e: any) => {
                    const target = e.target;
                    target.setStyle({
                        weight: 2,
                        color: '#374151',
                        fillOpacity: 0.85,
                    });
                    target.bringToFront();
                });

                layer.on("mouseout", (e: any) => {
                    geoLayer.resetStyle(e.target);
                });

                layer.on("click", () => {
                    const bounds = layer.getBounds();
                    leafletMapRef.current.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 });
                    setSelectedRegion(key);
                });
            }
        });

        geoLayer.addTo(leafletMapRef.current);
        geoJsonLayerRef.current = geoLayer;
        return true;
    }, [regionDataMap]);

    // 시/군/구 Choropleth 라벨 마커 추가 함수
    const buildDistrictLabels = useCallback((L: any) => {
        const geoData = sigunguGeoJsonRef.current;
        if (!geoData) return;

        geoData.features.forEach((feature: any) => {
            const key = getSigunguRegionKey(feature);
            const region = regionDataMap.get(key);

            // 데이터 있는 지구만 라벨 표시
            if (!region || region.itemCount === 0) return;

            const centroid = getPolygonCentroid(feature);
            if (!centroid) return;

            const rate = region.avgRate ?? null;
            const rateText = rate !== null ? rate.toFixed(2) + ":1" : "";
            const color = getRateColor(rate);
            const itemCount = region.itemCount;
            const shortName = feature?.properties?.name || '';

            const labelHtml = `<div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1px;
                pointer-events: none;
            ">
                ${rateText ? `<span style="
                    font-size: 12px;
                    font-weight: 800;
                    color: ${color};
                    text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 1px -1px 2px rgba(255,255,255,0.9), -1px 1px 2px rgba(255,255,255,0.9);
                    letter-spacing: -0.5px;
                ">${rateText}</span>` : ''}
                <span style="
                    font-size: 9px;
                    font-weight: 700;
                    color: #374151;
                    background: rgba(255,255,255,0.85);
                    padding: 1px 4px;
                    border-radius: 3px;
                    white-space: nowrap;
                ">${shortName}</span>
                ${itemCount > 0 ? `<span style="
                    font-size: 8px;
                    color: #6b7280;
                    background: rgba(255,255,255,0.75);
                    padding: 0 3px;
                    border-radius: 2px;
                ">${itemCount}건</span>` : ''}
            </div>`;

            const icon = L.divIcon({
                html: labelHtml,
                className: "",
                iconSize: [70, 40],
                iconAnchor: [35, 20],
            });

            const labelMarker = L.marker(centroid, {
                icon,
                interactive: false,
                zIndexOffset: 1000,
            });

            labelMarker.addTo(leafletMapRef.current);
            labelMarkersRef.current.push(labelMarker);
        });
    }, [regionDataMap]);

    // 마커 업데이트 — viewTier가 바뀔 때 전체 재구성
    useEffect(() => {
        if (!isMapReady || !leafletMapRef.current) return;

        const L = (window as any).L;
        if (!L) return;

        try {
            leafletMapRef.current.invalidateSize();
        } catch (e) {
            console.warn("Map invalidateSize failed:", e);
        }

        // 기존 마커 제거
        markersRef.current.forEach((marker) => {
            try { marker.remove(); } catch (e) { }
        });
        markersRef.current = [];

        // 기존 Choropleth 제거
        removeChoropleth();

        if (viewTier === 'choropleth') {
            // ============================================
            // 1. Choropleth 지도 (줌 < 9, 시/도 레벨)
            // ============================================
            if (markerClusterGroupRef.current) {
                try { leafletMapRef.current.removeLayer(markerClusterGroupRef.current); } catch (e) { }
            }

            const geoData = geoJsonDataRef.current;
            if (!geoData) {
                // GeoJSON 아직 로드 안됨 — fallback으로 circle 마커 사용
                renderCircleMarkers(L, regionData, currentZoom);
                return;
            }

            buildChoroplethLayer(L);
            buildChoroplethLabels(L);

        } else if (viewTier === 'circle') {
            // ============================================
            // 2. 시/군/구 Choropleth (줌 9-10)
            // ============================================
            if (markerClusterGroupRef.current) {
                try { leafletMapRef.current.removeLayer(markerClusterGroupRef.current); } catch (e) { }
            }

            const sigunguGeoData = sigunguGeoJsonRef.current;
            if (!sigunguGeoData) {
                // 시/군/구 GeoJSON 아직 로드 안됨 — fallback으로 circle 마커 사용
                renderCircleMarkers(L, regionData, currentZoom);
                return;
            }
            buildDistrictChoroplethLayer(L);
            buildDistrictLabels(L);

        } else {
            // ============================================
            // 3. 개별 아파트 마커 (줌 >= 11)
            // ============================================

            // 클러스터 그룹 초기화 (매번 새로 생성하여 옵션 변경 반영)
            if (markerClusterGroupRef.current) {
                try { leafletMapRef.current.removeLayer(markerClusterGroupRef.current); } catch (e) { }
                markerClusterGroupRef.current = null;
            }
            if ((window as any).L?.markerClusterGroup) {
                markerClusterGroupRef.current = L.markerClusterGroup({
                    disableClusteringAtZoom: 12,
                    maxClusterRadius: 30,
                    spiderfyOnMaxZoom: true,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true,
                    iconCreateFunction: function(cluster: any) {
                        const count = cluster.getChildCount();
                        let dimension = 36;
                        if (count >= 100) { dimension = 50; }
                        else if (count >= 10) { dimension = 42; }
                        return L.divIcon({
                            html: '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:rgba(59,130,246,0.85);color:#fff;font-weight:700;font-size:13px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">' + count + '</div>',
                            className: '',
                            iconSize: [dimension, dimension],
                        });
                    }
                });
                markerClusterGroupRef.current.addTo(leafletMapRef.current);
            }

            const clusterGroup = markerClusterGroupRef.current;
            const markersToAdd: any[] = [];

            // 좌표 기반 그룹핑 (같은 좌표에 있는 단지들을 분산 배치)
            const coordGroups = new Map<string, { items: AptInfo[], coords: [number, number] }>();

            data.forEach(item => {
                let coords: Coordinates | null = item.coordinates || null;
                if (!coords && item.HSSPLY_ADRES) {
                    const parsed = parseAddress(item.HSSPLY_ADRES);
                    if (parsed) {
                        coords = getGeoCoordinates(parsed.fullKey);
                    }
                }
                if (!coords) return;

                // 소수점 4자리 기준으로 그룹핑 (약 11m 정밀도)
                const coordKey = `${coords[0].toFixed(4)}_${coords[1].toFixed(4)}`;
                const existing = coordGroups.get(coordKey);
                if (existing) {
                    existing.items.push(item);
                } else {
                    coordGroups.set(coordKey, { items: [item], coords: [coords[0], coords[1]] });
                }
            });

            coordGroups.forEach(({ items: groupItems, coords: baseCoords }) => {
                const groupTotal = groupItems.length;

                groupItems.forEach((item, groupIndex) => {
                    const itemKey = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                    const spreadCoords = spreadMarkerCoords(baseCoords, groupIndex, groupTotal, currentZoom);

                    const stages = getCompetitionStagesSync(itemKey, extraData, archiveCache);
                    let rate: number | null = null;

                    if (stages) {
                        // @ts-ignore
                        rate = stages[rateType]?.rate;
                    }

                    if ((rate === null || rate === undefined) && rateType !== 'total') return;

                    const color = getRateColor(rate);

                    try {
                        const shortName = (item.HOUSE_NM || '').length > 10
                            ? (item.HOUSE_NM || '').substring(0, 10) + '…'
                            : (item.HOUSE_NM || '');
                        const iconHtml = `<div style="
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            gap: 1px;
                            pointer-events: auto;
                        ">
                            <div style="
                                padding: 3px 8px;
                                background-color: ${color};
                                border: 2px solid #fff;
                                border-radius: 12px;
                                text-align: center;
                                font-weight: bold;
                                color: white;
                                font-size: 11px;
                                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                                white-space: nowrap;
                                min-width: 40px;
                            ">${formatRate(rate)}</div>
                            <div style="
                                font-size: 9px;
                                font-weight: 600;
                                color: #374151;
                                background: rgba(255,255,255,0.9);
                                padding: 1px 4px;
                                border-radius: 3px;
                                white-space: nowrap;
                                max-width: 100px;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                            ">${shortName}</div>
                        </div>`;

                        const icon = L.divIcon({
                            html: iconHtml,
                            className: "",
                            iconSize: [110, 36],
                            iconAnchor: [55, 18]
                        });

                        const marker = L.marker([spreadCoords[0], spreadCoords[1]], { icon });

                        marker.bindTooltip(
                            `<div style="font-size:12px; font-weight:bold; color:#333; white-space:nowrap;">${item.HOUSE_NM}</div>`,
                            {
                                direction: "top",
                                offset: [0, -16],
                                permanent: false,
                                opacity: 0.95,
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
                            markersToAdd.push(marker);
                        } else {
                            marker.addTo(leafletMapRef.current);
                            markersRef.current.push(marker);
                        }
                    } catch (e) {
                        console.warn("Marker error", e);
                    }
                });
            });

            // 모든 마커를 한 번에 배치 추가 (성능 최적화)
            if (clusterGroup && markersToAdd.length > 0) {
                clusterGroup.addLayers(markersToAdd);
            }
        }

    }, [isMapReady, viewTier, regionData, data, rateType, archiveCache, removeChoropleth, renderCircleMarkers, buildChoroplethLayer, buildChoroplethLabels, buildDistrictChoroplethLayer, buildDistrictLabels, currentZoom, onItemClick, extraData]);

    // Choropleth 스타일 업데이트 — 같은 tier 내에서 regionData만 바뀔 때 (tier 변경 없이)
    useEffect(() => {
        if (!isMapReady || viewTier !== 'choropleth') return;
        if (!geoJsonLayerRef.current) return;

        const L = (window as any).L;
        if (!L) return;

        // 기존 레이어 스타일만 업데이트 (레이어 재생성 없이)
        geoJsonLayerRef.current.eachLayer((layer: any) => {
            const feature = layer.feature;
            if (!feature) return;
            const name = feature?.properties?.name || "";
            const key = GEOJSON_NAME_TO_KEY[name] || name;
            const region = regionDataMap.get(key);
            const rate = region?.avgRate ?? null;

            layer.setStyle({
                fillColor: getRateFillColor(rate),
                weight: 2,
                opacity: 1,
                color: '#ffffff',
                fillOpacity: region ? 0.65 : 0.3,
            });

            // 툴팁 갱신
            const tooltipContent = region
                ? `<strong>${key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`
                : `<strong>${key}</strong><br/>데이터 없음`;
            layer.setTooltipContent(tooltipContent);
        });

        // 라벨 마커 갱신 (제거 후 재추가)
        labelMarkersRef.current.forEach(m => {
            try { m.remove(); } catch (e) { }
        });
        labelMarkersRef.current = [];
        buildChoroplethLabels(L);

    }, [isMapReady, viewTier, regionDataMap, buildChoroplethLabels]);

    // 시/군/구 Choropleth 스타일 업데이트 — 같은 tier 내에서 regionData만 바뀔 때
    useEffect(() => {
        if (!isMapReady || viewTier !== 'circle') return;
        if (!geoJsonLayerRef.current) return;

        const L = (window as any).L;
        if (!L) return;

        geoJsonLayerRef.current.eachLayer((layer: any) => {
            const feature = layer.feature;
            if (!feature) return;
            const key = getSigunguRegionKey(feature);
            const region = regionDataMap.get(key);
            const rate = region?.avgRate ?? null;

            layer.setStyle({
                fillColor: getRateFillColor(rate),
                weight: 1,
                opacity: 1,
                color: '#ffffff',
                fillOpacity: region ? 0.6 : 0.25,
            });

            const tooltipContent = region
                ? `<strong>${key}</strong><br/>청약 ${region.itemCount}건<br/>공급 ${region.totalSupply.toLocaleString()}세대<br/>평균 경쟁률: ${formatRate(region.avgRate)}`
                : `<strong>${key}</strong><br/>데이터 없음`;
            layer.setTooltipContent(tooltipContent);
        });

        // 라벨 마커 갱신 (제거 후 재추가)
        labelMarkersRef.current.forEach(m => { try { m.remove(); } catch (e) { } });
        labelMarkersRef.current = [];
        buildDistrictLabels(L);

    }, [isMapReady, viewTier, regionDataMap, buildDistrictLabels]);

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
                        <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.8', margin: 0 }}>
                            선택하신 조건에 해당하는 데이터가 없습니다.<br />
                            조회 기간, 지역, 주택 구분을 변경해 보세요.<br />
                            <strong style={{ color: '#ef4444', fontWeight: '500' }}>* 공공분양/임대/국민주택</strong>은 경쟁률 데이터가<br />
                            제공되지 않아 표시되지 않습니다.
                        </p>
                    </div>
                )}

                <div ref={mapRef} className={styles.map} style={{ height: "100%", width: "100%" }} />

                {isMapReady && (
                    <div className={styles.zoomIndicator}>
                        <span className={styles.zoomLevel}>Zoom {currentZoom}</span>
                        <span className={styles.zoomMode}>
                            {currentZoom < 9 ? '시/도 경계' : currentZoom < 11 ? '시/군/구' : '단지별'}
                        </span>
                    </div>
                )}
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
