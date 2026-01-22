/**
 * 지오코딩 유틸리티 - Kakao Maps API 사용
 * 
 * 주택 주소를 좌표로 변환하고 캐싱합니다.
 */

export type Coordinates = [number, number]; // [lat, lng]

type GeocodeCache = Record<string, Coordinates>;

let geocodeCache: GeocodeCache = {};
let cacheSaveTimer: NodeJS.Timeout | null = null;
let lastError: string | null = null;

const CACHE_FILE = '/data/address-coordinates.json';
const KAKAO_API_KEY = process.env.NEXT_PUBLIC_KAKAO_API_KEY || '';

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
 * 주소를 좌표로 변환 (Kakao API 사용)
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

    // Kakao API 키 확인
    if (!KAKAO_API_KEY) {
        console.warn('⚠️ Kakao API 키가 설정되지 않았습니다');
        return null;
    }

    try {
        // Kakao 주소 검색 API 호출
        const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(normalizedAddress)}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `KakaoAK ${KAKAO_API_KEY}`
            }
        });

        if (!response.ok) {
            const msg = `Kakao API 오류: ${response.status}`;
            console.error(msg);
            lastError = `API ${response.status}`;
            return null;
        }

        const data = await response.json();

        if (data.documents && data.documents.length > 0) {
            const doc = data.documents[0];
            const lat = parseFloat(doc.y);
            const lng = parseFloat(doc.x);
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
 * @param delayMs 각 요청 사이 딜레이 (ms)
 * @returns 주소별 좌표 맵
 */
export async function batchGeocode(
    addresses: string[],
    delayMs: number = 200
): Promise<Record<string, Coordinates | null>> {
    const result: Record<string, Coordinates | null> = {};

    for (const address of addresses) {
        result[address] = await geocodeAddress(address);

        // API 부하 방지
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
    hasApiKey: boolean;
    lastError: string | null;
} {
    return {
        cacheSize: Object.keys(geocodeCache).length,
        hasApiKey: !!KAKAO_API_KEY,
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
