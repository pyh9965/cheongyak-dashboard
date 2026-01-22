"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./CompetitionRateMap.module.css";

type RegionData = {
    key: string;
    coordinates: [number, number];
    totalSupply: number;
    avgRate: number | null;
    itemCount: number;
    items: any[];
};

type Props = {
    regionData: RegionData[];
    onRegionClick: (key: string) => void;
    onItemClick: (item: any) => void;
};

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
    return `${rate.toFixed(2)} : 1`;
}

export default function LeafletMapInner({ regionData, onRegionClick, onItemClick }: Props) {
    return (
        <MapContainer
            center={[36.5, 127.5]}
            zoom={7}
            className={styles.map}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {regionData.map((region) => {
                const labelColor = getRateColor(region.avgRate);
                return (
                    <CircleMarker
                        key={region.key}
                        center={region.coordinates}
                        radius={getCircleRadius(region.totalSupply)}
                        pathOptions={{ fillColor: labelColor, fillOpacity: 0.7, color: "#fff", weight: 2 }}
                        eventHandlers={{ click: () => onRegionClick(region.key) }}
                    >
                        <Tooltip direction="top" offset={[0, -10]}>
                            <div>
                                <strong>{region.key}</strong>
                                <div>청약 {region.itemCount}건</div>
                                <div>공급 {region.totalSupply.toLocaleString()}세대</div>
                                <div>평균 경쟁률: <strong>{formatRate(region.avgRate)}</strong></div>
                            </div>
                        </Tooltip>
                        <Popup>
                            <div className={styles.popupContent}>
                                <h3 className={styles.popupTitle}>{region.key}</h3>
                                <div className={styles.popupStats}>
                                    <span>청약 {region.itemCount}건</span>
                                    <span> • </span>
                                    <span>공급 {region.totalSupply.toLocaleString()}세대</span>
                                </div>
                                <div className={styles.popupRate}>평균 경쟁률: <strong>{formatRate(region.avgRate)}</strong></div>
                                <div className={styles.popupList}>
                                    {region.items.slice(0, 5).map((item: any, idx: number) => (
                                        <div key={idx} className={styles.popupItem} onClick={() => onItemClick(item)}>
                                            <span className={styles.itemName}>{item.HOUSE_NM}</span>
                                            <span className={styles.itemSupply}>{item.TOT_SUPLY_HSHLDCO?.toLocaleString() || "-"}세대</span>
                                        </div>
                                    ))}
                                    {region.items.length > 5 && <div className={styles.moreItems}>+{region.items.length - 5}건 더 있음</div>}
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
