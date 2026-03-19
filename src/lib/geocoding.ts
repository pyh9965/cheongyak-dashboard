/**
 * 지오코딩 유틸리티 - Nominatim (OpenStreetMap) 사용
 *
 * 주택 주소를 좌표로 변환하고 캐싱합니다.
 * API 키 불필요 — 초당 1건 제한 준수
 */

export type Coordinates = [number, number]; // [lat, lng]

type GeocodeCache = Record<string, Coordinates>;

let geocodeCache: GeocodeCache = {};
let cacheSaveTimer: NodeJS.Timeout | null = null;
let lastError: string | null = null;

const CACHE_FILE = '/data/address-coordinates.json';

/**
 * 캐시 파일 로드
 */
export async function loadGeocodeCache(): Promise<void> {
    try {
        const response = await fetch(CACHE_FILE);
        if (response.ok) {
            geocodeCache = await response.json();
            console.log(`📍 지오코딩 캐시 로드: ${Object.keys(geocodeCache).length}건`);
        }
    } catch (error) {
        console.log('📍 지오코딩 캐시 없음 - 새로 시작합니다');
        geocodeCache = {};
    }
}

/**
 * 캐시 파일 저장 (디바운스 적용)
 */
function saveGeocodeCache(): void {
    if (typeof window === 'undefined') return; // 서버 사이드에서는 저장 안 함

    // 기존 타이머 취소
    if (cacheSaveTimer) {
        clearTimeout(cacheSaveTimer);
    }

    // 5초 후 저장 (여러 요청을 한 번에 처리)
    cacheSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('geocode_cache', JSON.stringify(geocodeCache));
            console.log(`💾 지오코딩 캐시 저장: ${Object.keys(geocodeCache).length}건`);
        } catch (error) {
            console.warn('지오코딩 캐시 저장 실패:', error);
        }
    }, 5000);
}

/**
 * 주소를 좌표로 변환 (Nominatim API 사용)
 *
 * @param address 주소 문자열
 * @returns 좌표 [lat, lng] 또는 null
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
    if (!address || !address.trim()) return null;

    const normalizedAddress = address.trim();

    // 캐시 확인
    if (geocodeCache[normalizedAddress]) {
        return geocodeCache[normalizedAddress];
    }

    try {
        // Nominatim 주소 검색 API 호출
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedAddress)}&format=json&countrycodes=kr&limit=1&accept-language=ko`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'CheongyakDashboard/1.0 (geocoding for Korean apartment data)'
            }
        });

        if (!response.ok) {
            const msg = `Nominatim API 오류: ${response.status}`;
            console.error(msg);
            lastError = `API ${response.status}`;
            return null;
        }

        const data = await response.json();

        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);

            // 한국 범위 검증
            if (lat < 33 || lat > 39 || lng < 124 || lng > 132) {
                console.warn(`⚠️ 한국 범위 밖: ${normalizedAddress} -> [${lat}, ${lng}]`);
                return null;
            }

            const coordinates: Coordinates = [lat, lng];

            // 캐시에 저장
            geocodeCache[normalizedAddress] = coordinates;
            saveGeocodeCache();

            console.log(`✅ 지오코딩 성공: ${normalizedAddress} -> [${lat}, ${lng}]`);
            return coordinates;
        }

        console.warn(`⚠️ 주소를 찾을 수 없습니다: ${normalizedAddress}`);
        return null;
    } catch (error) {
        console.error(`지오코딩 실패: ${normalizedAddress}`, error);
        return null;
    }
}

/**
 * 배치 지오코딩 (여러 주소 한번에 변환)
 *
 * @param addresses 주소 배열
 * @param delayMs 각 요청 사이 딜레이 (ms) — Nominatim 초당 1건 제한
 * @returns 주소별 좌표 맵
 */
export async function batchGeocode(
    addresses: string[],
    delayMs: number = 1100
): Promise<Record<string, Coordinates | null>> {
    const result: Record<string, Coordinates | null> = {};

    for (const address of addresses) {
        result[address] = await geocodeAddress(address);

        // Nominatim rate limit (초당 1건)
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return result;
}

/**
 * 캐시 통계
 */
export function getGeocodeStats(): {
    cacheSize: number;
    lastError: string | null;
} {
    return {
        cacheSize: Object.keys(geocodeCache).length,
        lastError
    };
}

/**
 * localStorage에서 캐시 복원 (클라이언트 사이드 전용)
 */
export function restoreGeocodeCache(): void {
    if (typeof window === 'undefined') return;

    try {
        const cached = localStorage.getItem('geocode_cache');
        if (cached) {
            geocodeCache = JSON.parse(cached);
            console.log(`📍 localStorage에서 지오코딩 캐시 복원: ${Object.keys(geocodeCache).length}건`);
        }
    } catch (error) {
        console.warn('지오코딩 캐시 복원 실패:', error);
    }
}
