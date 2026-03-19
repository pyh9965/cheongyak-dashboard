/**
 * 프로그램 시작 시 자동 캐시 업데이트 스크립트
 * 
 * - 기존 캐시의 마지막 모집공고일 확인
 * - API에서 새 공고 조회
 * - 경쟁률 및 특별공급 데이터 수집
 * - 캐시에 병합하여 저장
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // .env fallback
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REB_API_KEY;
const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

const DATA_DIR = path.join(__dirname, '../public/data');
const CACHE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');
const WEB_CACHE_FILE = path.join(DATA_DIR, 'geocode-web-cache.json');

// 웹검색 결과 캐시 (DuckDuckGo/Nominatim 재요청 방지)
let webGeocodeCache = {};
function loadWebGeocodeCache() {
    try {
        if (fs.existsSync(WEB_CACHE_FILE)) {
            webGeocodeCache = JSON.parse(fs.readFileSync(WEB_CACHE_FILE, 'utf-8'));
            console.log(`📍 웹 지오코딩 캐시 로드: ${Object.keys(webGeocodeCache).length}건`);
        }
    } catch (e) {
        webGeocodeCache = {};
    }
}
function saveWebGeocodeCache() {
    try {
        fs.writeFileSync(WEB_CACHE_FILE, JSON.stringify(webGeocodeCache, null, 2), 'utf-8');
    } catch (e) {}
}

// User-Agent 로테이션 (DuckDuckGo 차단 대비)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];
let uaIndex = 0;
function getNextUserAgent() {
    const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
    uaIndex++;
    return ua;
}

// 날짜 파싱 유틸리티
function parseDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, '');
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

// 당첨자 발표일이 지났는지 확인
function isResultAnnounced(przwnerPresnatnDe) {
    if (!przwnerPresnatnDe) return false;
    const announceDate = parseDate(przwnerPresnatnDe);
    if (!announceDate) return false;
    return announceDate < new Date();
}

// 접수 종료일이 지났는지 확인 (경쟁률 데이터 수집용)
function isApplicationClosed(item) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 오늘 00:00:00

    // 2순위 접수 종료일 확인
    const rank2End = item.GNRL_RNK2_ETC_AREA_ENDDE || item.GNRL_RNK2_CRSPAREA_ENDDE || item.RCEPT_ENDDE;
    if (rank2End) {
        const endDate = parseDate(rank2End);
        if (endDate && endDate <= today) {
            return true; // 2순위 접수 종료 (당일도 포함)
        }
    }

    // 1순위 접수 종료일 확인
    const rank1End = item.GNRL_RNK1_ETC_AREA_ENDDE || item.GNRL_RNK1_CRSPAREA_ENDDE || item.RCEPT_ENDDE;
    if (rank1End) {
        const endDate = parseDate(rank1End);
        if (endDate && endDate <= today) {
            return true; // 1순위 접수 종료 (2순위 데이터는 없을 수 있음)
        }
    }

    return false;
}

// Nominatim (OpenStreetMap) 주소 검색 — Kakao 주소검색 대체
// API 키 불필요, 초당 1건 제한
async function nominatimGeocode(query) {
    if (!query || query.trim().length < 3) return null;

    // 캐시 확인
    const cacheKey = 'nom:' + query.trim();
    if (webGeocodeCache[cacheKey]) return webGeocodeCache[cacheKey];

    try {
        const url = 'https://nominatim.openstreetmap.org/search?q='
            + encodeURIComponent(query)
            + '&format=json&countrycodes=kr&limit=3&accept-language=ko';
        const res = await fetch(url, {
            headers: { 'User-Agent': 'CheongyakDashboard/1.0 (geocoding for Korean apartment data)' }
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (body && body.length > 0) {
            const lat = parseFloat(body[0].lat);
            const lng = parseFloat(body[0].lon);
            if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
                const coords = [lat, lng];
                webGeocodeCache[cacheKey] = coords;
                return coords;
            }
        }
    } catch (e) {}
    return null;
}

// DuckDuckGo 웹검색 — 좌표 직접 추출 (지도 URL에서 @lat,lng 패턴 파싱)
// API 키 불필요
async function webSearchCoordinates(query) {
    if (!query) return null;

    // 캐시 확인
    const cacheKey = 'wsc:' + query.trim();
    if (webGeocodeCache[cacheKey]) return webGeocodeCache[cacheKey];

    const maxRetries = 3;
    let delay = 2000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query + ' 위치 지도');
            const res = await fetch(url, {
                headers: { 'User-Agent': getNextUserAgent() }
            });
            if (res.status === 429 || res.status === 503) {
                // 차단 — 지수 백오프
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
                continue;
            }
            if (!res.ok) return null;
            const html = await res.text();
            const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');

            // 지도 URL 좌표 패턴들
            const patterns = [
                /@(-?\d{2}\.\d{3,8}),\s*(-?\d{2,3}\.\d{3,8})/,        // @37.xxxx,127.xxxx
                /lat[=:](-?\d{2}\.\d{3,8})[&,;\s]+l(?:ng|on)[=:](-?\d{2,3}\.\d{3,8})/i, // lat=37&lng=127
                /center[=:](-?\d{2}\.\d{3,8}),(-?\d{2,3}\.\d{3,8})/i, // center=37,127
                /q=(-?\d{2}\.\d{3,8}),(-?\d{2,3}\.\d{3,8})/,          // q=37,127
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    const lat = parseFloat(match[1]);
                    const lng = parseFloat(match[2]);
                    if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) {
                        const coords = [lat, lng];
                        webGeocodeCache[cacheKey] = coords;
                        return coords;
                    }
                }
            }
            return null; // 패턴 매치 없음 (재시도 불필요)
        } catch (e) {
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
            }
        }
    }
    return null;
}

// DuckDuckGo 웹검색 → 주소 추출 → Nominatim 지오코딩
// 기존 naverLocalSearch + kakaoAddressSearch 조합을 대체
async function webSearchAndGeocode(query) {
    if (!query) return null;

    // 캐시 확인
    const cacheKey = 'wsg:' + query.trim();
    if (webGeocodeCache[cacheKey]) return webGeocodeCache[cacheKey];

    // 1단계: DuckDuckGo에서 주소 텍스트 추출
    const webAddr = await webSearchAddress(query);
    if (!webAddr) return null;

    // 2단계: 추출된 주소를 Nominatim으로 지오코딩
    await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
    const coords = await nominatimGeocode(webAddr);
    if (coords) {
        webGeocodeCache[cacheKey] = coords;
    }
    return coords;
}

// DuckDuckGo 웹검색 — 지번주소 추출용 (API 키 불필요, 로컬 검색 실패 시 폴백)
async function webSearchAddress(query) {
    try {
        const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query + ' 주소');
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) return null;
        const html = await res.text();

        // HTML 태그 및 HTML 엔티티 제거
        const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');

        // 지번주소 패턴: "시도 시군구 동/읍/면/리 번지(-번지)"
        const jibunPattern = /((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?\s+[가-힣]+[동읍면리]\s+\d{1,5}(?:-\d{1,5})?)/;

        const match = text.match(jibunPattern);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

// 시도별 중심 좌표 및 허용 반경(km) — 교차 검증용
// 반경은 시도 내 가장 먼 시군구(여수, 백령도, 삼척 등)를 포함하도록 여유롭게 설정
const SIDO_BOUNDS = {
    "서울": { lat: 37.5665, lng: 126.9780, radius: 40 },
    "부산": { lat: 35.1796, lng: 129.0756, radius: 50 },
    "대구": { lat: 35.8714, lng: 128.6014, radius: 60 },
    "인천": { lat: 37.4563, lng: 126.7052, radius: 210 },  // 백령도 포함
    "광주": { lat: 35.1595, lng: 126.8526, radius: 40 },
    "대전": { lat: 36.3504, lng: 127.3845, radius: 40 },
    "울산": { lat: 35.5384, lng: 129.3114, radius: 50 },
    "세종": { lat: 36.4800, lng: 127.2890, radius: 40 },
    "경기": { lat: 37.2750, lng: 127.0094, radius: 120 },
    "강원": { lat: 37.8854, lng: 127.7300, radius: 170 },  // 삼척/동해/정선 포함
    "충북": { lat: 36.6359, lng: 127.4913, radius: 120 },  // 제천/단양 포함
    "충남": { lat: 36.6588, lng: 126.6728, radius: 120 },  // 금산 포함
    "전북": { lat: 35.8204, lng: 127.1087, radius: 100 },
    "전남": { lat: 34.8161, lng: 126.4629, radius: 150 },  // 여수/광양/구례 포함
    "경북": { lat: 36.5760, lng: 128.5056, radius: 160 },  // 경주/울진 포함
    "경남": { lat: 35.2376, lng: 128.6924, radius: 120 },
    "제주": { lat: 33.4890, lng: 126.4983, radius: 60 },
};

const SIDO_NORMALIZE_MAP = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주",
};

const SIDO_REGEX = /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/;

function normalizeSido(str) {
    if (!str) return null;
    return SIDO_NORMALIZE_MAP[str.trim()] || null;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 좌표가 해당 항목의 시도/시군구 범위 내인지 교차 검증
function validateCoordinates(coords, item) {
    if (!coords) return false;
    const [lat, lng] = coords;

    // 한국 범위 체크
    if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return false;

    // 시도 추출 (주소 또는 SUBSCRPT_AREA_CODE_NM에서)
    const addrSidoMatch = (item.HSSPLY_ADRES || '').match(SIDO_REGEX);
    const addrSido = addrSidoMatch ? normalizeSido(addrSidoMatch[1]) : null;
    const codeSido = normalizeSido(item.SUBSCRPT_AREA_CODE_NM);
    const sido = addrSido || codeSido;

    if (!sido || !SIDO_BOUNDS[sido]) return true; // 검증 불가시 통과

    const bound = SIDO_BOUNDS[sido];
    const dist = haversineDistance(lat, lng, bound.lat, bound.lng);
    return dist <= bound.radius;
}

// 시도코드명 → 정식 시도명 매핑 (SUBSCRPT_AREA_CODE_NM 보완용)
const AREA_CODE_TO_FULL_SIDO = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
    "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
    "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도",
    "경남": "경상남도", "제주": "제주특별자치도",
};

// 5단계 지오코딩 (Nominatim + DuckDuckGo, API 키 불필요)
// 괄호주소 → Nominatim 주소검색 → Nominatim 시군구+동 → DuckDuckGo 좌표 직접 → DuckDuckGo→Nominatim → Nominatim 시군구만
async function geocodeAddress(address, houseName, item) {
    if (!address) return null;

    // === 사전 정리: 시도명 오타 보정 ===
    address = address
        .replace(/충천남도/g, '충청남도')
        .replace(/충천북도/g, '충청북도')
        .replace(/강원자치도/g, '강원특별자치도')
        .replace(/전북자치도/g, '전북특별자치도');

    // === 0단계: 괄호 안에 완전한 주소가 있으면 우선 사용 ===
    const fullAddrInParen = address.match(
        /\(([^)]*(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|전라|전북|경상|제주)[^)]*(?:시|도|구|군)[^)]*[동읍면리][^)]*)\)/
    );
    let baseAddress = address;
    if (fullAddrInParen) {
        baseAddress = fullAddrInParen[1].trim();
    }

    // === 주소 정제 ===
    let cleaned = baseAddress;
    const dongInParen = cleaned.match(/\(([가-힣]+[동읍면리])\)/);
    const dongFromParen = dongInParen ? dongInParen[1] : null;
    cleaned = cleaned.replace(/\([^)]*\)/g, '').trim();

    cleaned = cleaned
        .replace(/\s*[A-Za-z]*-?\d*[A-Za-z]*블[럭록]/gi, '')
        .replace(/\s*[A-Za-z]{0,3}-?\d{0,3}BL\b/gi, '')
        .replace(/[가-힣]+신도시/g, '')
        .replace(/[가-힣]+도시개발사업/g, '')
        .replace(/[가-힣]*택지개발[가-힣]*/g, '')
        .replace(/[가-힣]*공공주택지구/g, '')
        .replace(/행정중심복합도시/g, '')
        .replace(/\d+-?\d*생활권/g, '')
        .replace(/[가-힣]+\d*지구/g, '')
        .replace(/[가-힣]*뉴타운/g, '')
        .replace(/공동주택용지/g, '')
        .replace(/공급촉진지구/g, '')
        .replace(/도시개발구역/g, '')
        .replace(/\s+내\s+/g, ' ')
        .replace(/\s+\d+(-\d+)?번지.*$/g, '')
        .replace(/\s+일원.*$/g, '')
        .replace(/\s+외\s+\d+필지.*$/g, '')
        .replace(/\s+일대.*$/g, '')
        .replace(/\s+/g, ' ').trim();

    if (dongFromParen && !/[가-힣]+[동읍면리]/.test(cleaned)) {
        cleaned = `${cleaned} ${dongFromParen}`;
    }

    const isBlockAddress = isIrregularAddress(address);

    // 블록형 주소: DuckDuckGo 좌표 직접 추출 우선
    if (isBlockAddress && houseName) {
        // 1차: DuckDuckGo 좌표 직접 추출
        let result = await webSearchCoordinates(houseName + ' 아파트 위치');
        if (result && validateCoordinates(result, item)) return result;
        await new Promise(r => setTimeout(r, 2000));

        // 2차: DuckDuckGo 주소 추출 → Nominatim
        result = await webSearchAndGeocode(houseName + ' 아파트 주소');
        if (result && validateCoordinates(result, item)) return result;
        await new Promise(r => setTimeout(r, 1100));

        // 3차: 시도+단지명 Nominatim
        if (item && item.SUBSCRPT_AREA_CODE_NM) {
            const areaCode = normalizeSido(item.SUBSCRPT_AREA_CODE_NM);
            const fullSido = areaCode ? (AREA_CODE_TO_FULL_SIDO[areaCode] || '') : '';
            if (fullSido) {
                result = await nominatimGeocode(fullSido + ' ' + houseName);
                if (result && validateCoordinates(result, item)) return result;
                await new Promise(r => setTimeout(r, 1100));
            }
        }
        // 모든 시도 실패 → Stage 5(시군구 중심점)로 fall through
    }

    // === 1단계: Nominatim 주소 검색 (정제된 주소) ===
    if (!isBlockAddress && cleaned.length >= 5) {
        let result = await nominatimGeocode(cleaned);
        if (result) return result;
        await new Promise(r => setTimeout(r, 1100));
    }

    // === 2단계: 시도+시군구+동 추출 → Nominatim ===
    const distMatch = address.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?\s+\S+[동읍면리])/);
    if (distMatch) {
        let result = await nominatimGeocode(distMatch[1]);
        if (result) return result;
        await new Promise(r => setTimeout(r, 1100));
    }

    // === 3단계: DuckDuckGo 좌표 직접 추출 ("단지명 아파트 위치") ===
    if (houseName) {
        let result = await webSearchCoordinates(houseName + ' 아파트 위치');
        if (result && validateCoordinates(result, item)) return result;
        await new Promise(r => setTimeout(r, 2000));
    }

    // === 4단계: DuckDuckGo 주소 추출 → Nominatim ===
    if (houseName) {
        let result = await webSearchAndGeocode(houseName + ' 아파트');
        if (result && validateCoordinates(result, item)) return result;
        await new Promise(r => setTimeout(r, 1100));
    }

    // === 5단계: 시도+시군구만으로 Nominatim 검색 (최후 수단 — 시군구 중심점 폴백) ===
    const sigunguMatch = address.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?)/);
    if (sigunguMatch) {
        let result = await nominatimGeocode(sigunguMatch[1]);
        if (result) return result;
    }

    return null;
}

// 좌표 없는 항목들에 대해 일괄 지오코딩 (교차 검증 포함)
async function geocodeMissingItems(lists) {
    const missing = lists.filter(item => !item.coordinates && item.HSSPLY_ADRES);
    if (missing.length === 0) {
        console.log('📍 좌표 변환 필요 없음 (모두 보유)');
        return 0;
    }

    console.log(`📍 좌표 미보유 ${missing.length}건 Nominatim/웹검색 지오코딩 시작...`);
    let success = 0;
    let rejected = 0;

    for (let i = 0; i < missing.length; i++) {
        const item = missing[i];
        const coords = await geocodeAddress(item.HSSPLY_ADRES, item.HOUSE_NM, item);
        if (coords && validateCoordinates(coords, item)) {
            item.coordinates = coords;
            success++;
        } else if (coords) {
            console.log(`  ⚠️ 좌표 검증 실패 (시도 불일치): ${item.HOUSE_NM} | ${item.HSSPLY_ADRES}`);
            rejected++;
        }

        if ((i + 1) % 20 === 0) {
            console.log(`  진행: ${i + 1}/${missing.length} (성공: ${success}, 검증실패: ${rejected})`);
            saveWebGeocodeCache(); // 중간 저장
        }

        // Nominatim rate limit (초당 1건)
        await new Promise(resolve => setTimeout(resolve, 1100));
    }

    saveWebGeocodeCache();
    console.log(`✅ 좌표 변환 완료: ${success}/${missing.length}건 성공${rejected > 0 ? `, ${rejected}건 검증실패` : ''}`);
    return success;
}

// 아파트 기본명 추출 (재공급/취소분/사전청약 등 접미어 제거)
function getBaseHouseName(name) {
    return (name || '')
        .replace(/\(.*?\)/g, '')
        .replace(/\d+단지$/g, '')
        .replace(/(조합원\s*)?취소분.*$/g, '')
        .replace(/본청약.*$/g, '')
        .replace(/사전청약.*$/g, '')
        .replace(/추가\s*(모집|입주자)?.*$/g, '')
        .replace(/잔여세대.*$/g, '')
        .replace(/\d+회차.*$/g, '')
        .replace(/\s+/g, ' ').trim();
}

// 클러스터 수정 검증: 클러스터 중심에서 500m 이상 떨어져야 유효
function isValidClusterFix(coords, clusterCenter, item) {
    if (!validateCoordinates(coords, item)) return false;
    const dist = haversineDistance(coords[0], coords[1], clusterCenter[0], clusterCenter[1]);
    return dist >= 0.5; // 500m 이상 (시군구 중심점 재반환 방지)
}

// 결정론적 좌표 분산 (Jitter) — 클러스터 중심에서 원형 배치
function jitterCoordinate(center, index, total) {
    const radius = 0.003; // ~300m
    const angle = (2 * Math.PI * index) / total;
    return [
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle)
    ];
}

// 클러스터 항목 재지오코딩: Nominatim + DuckDuckGo 웹검색
async function resolveClusterItem(item, clusterCenter) {
    const houseName = item.HOUSE_NM;
    if (!houseName) return null;

    // 단계 1: DuckDuckGo 좌표 직접 추출
    let coords = await webSearchCoordinates(houseName + ' 아파트 위치');
    if (coords && isValidClusterFix(coords, clusterCenter, item)) return coords;
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 단계 2: DuckDuckGo 주소 추출 → Nominatim 지오코딩
    coords = await webSearchAndGeocode(houseName + ' 아파트 주소');
    if (coords && isValidClusterFix(coords, clusterCenter, item)) {
        console.log(`    🔍 웹검색→Nominatim 성공: ${houseName}`);
        return coords;
    }
    await new Promise(resolve => setTimeout(resolve, 1100));

    // 단계 3: Nominatim 직접 검색 (시도+단지명)
    const areaCode = normalizeSido(item.SUBSCRPT_AREA_CODE_NM);
    const fullSido = areaCode ? (AREA_CODE_TO_FULL_SIDO[areaCode] || '') : '';
    if (fullSido) {
        coords = await nominatimGeocode(fullSido + ' ' + houseName + ' 아파트');
        if (coords && isValidClusterFix(coords, clusterCenter, item)) return coords;
        await new Promise(resolve => setTimeout(resolve, 1100));
    }

    // 단계 4: Nominatim 단지명만
    coords = await nominatimGeocode(houseName + ' 아파트');
    if (coords && isValidClusterFix(coords, clusterCenter, item)) return coords;

    return null;
}

// 기존 좌표의 시도 불일치 검사 및 중복 좌표 클러스터 감지 후 재지오코딩
async function fixInvalidCoordinates(lists) {
    let totalFixed = 0;

    // === 1단계: 시도 범위 불일치 의심 항목 재지오코딩 (기존 로직 유지) ===
    const sidoSuspects = lists.filter(item =>
        item.coordinates && item.HSSPLY_ADRES && !validateCoordinates(item.coordinates, item)
    );

    if (sidoSuspects.length > 0) {
        console.log(`🔧 시도 불일치 ${sidoSuspects.length}건 재지오코딩...`);
        for (let i = 0; i < sidoSuspects.length; i++) {
            const item = sidoSuspects[i];
            const oldCoords = item.coordinates;
            const newCoords = await geocodeAddress(item.HSSPLY_ADRES, item.HOUSE_NM, item);
            if (newCoords && validateCoordinates(newCoords, item)) {
                item.coordinates = newCoords;
                totalFixed++;
            } else {
                item.coordinates = oldCoords; // 검증 실패 시 기존값 유지
            }
            await new Promise(resolve => setTimeout(resolve, 120));
        }
        console.log(`  ✅ 시도 불일치 수정: ${totalFixed}건`);
    }

    // === 2단계: 중복 좌표 클러스터 감지 (3+ 항목 동일 좌표) ===
    const coordMap = new Map(); // "lat,lng" → [items]
    lists.forEach(item => {
        if (!item.coordinates) return;
        const key = `${item.coordinates[0]},${item.coordinates[1]}`;
        if (!coordMap.has(key)) coordMap.set(key, []);
        coordMap.get(key).push(item);
    });

    let clusterFixed = 0;
    let clusterJittered = 0;
    let clusterSkipped = 0;

    for (const [key, items] of coordMap) {
        if (items.length < 3) continue;

        // 고유 기본명 추출 — 같은 아파트 재공급/취소분은 같은 좌표가 정상
        const baseNames = new Set(items.map(i => getBaseHouseName(i.HOUSE_NM)));
        if (baseNames.size < 2) {
            clusterSkipped++;
            continue; // 같은 아파트 재공급 → 스킵
        }

        const clusterCenter = items[0].coordinates;
        console.log(`  🔍 클러스터 [${key}]: ${items.length}건, 고유 아파트 ${baseNames.size}개 (${[...baseNames].slice(0, 3).join(', ')}${baseNames.size > 3 ? ' ...' : ''})`);

        // 각 항목에 대해 Kakao "단지명 아파트" 검색 시도
        let resolvedCount = 0;
        const unresolvedItems = [];

        for (const item of items) {
            const newCoords = await resolveClusterItem(item, clusterCenter);
            if (newCoords) {
                console.log(`    ✅ ${item.HOUSE_NM}: [${item.coordinates[0].toFixed(4)}, ${item.coordinates[1].toFixed(4)}] → [${newCoords[0].toFixed(4)}, ${newCoords[1].toFixed(4)}]`);
                item.coordinates = newCoords;
                resolvedCount++;
                clusterFixed++;
            } else {
                unresolvedItems.push(item);
            }
            await new Promise(resolve => setTimeout(resolve, 120));
        }

        // 미해결 항목: Jitter 적용 (2개 이상 미해결 시)
        if (unresolvedItems.length >= 2) {
            for (let j = 0; j < unresolvedItems.length; j++) {
                const item = unresolvedItems[j];
                const jittered = jitterCoordinate(clusterCenter, j, unresolvedItems.length);
                console.log(`    🔄 Jitter: ${item.HOUSE_NM}: [${clusterCenter[0].toFixed(4)}, ${clusterCenter[1].toFixed(4)}] → [${jittered[0].toFixed(4)}, ${jittered[1].toFixed(4)}]`);
                item.coordinates = jittered;
                clusterJittered++;
            }
        }

        console.log(`    📊 결과: Kakao 해결 ${resolvedCount}건, Jitter ${unresolvedItems.length >= 2 ? unresolvedItems.length : 0}건, 미변경 ${unresolvedItems.length < 2 ? unresolvedItems.length : 0}건`);
    }

    totalFixed += clusterFixed + clusterJittered;

    if (clusterFixed + clusterJittered + clusterSkipped > 0) {
        console.log(`✅ 클러스터 해소 완료: Kakao 검색 ${clusterFixed}건, Jitter ${clusterJittered}건, 스킵(같은 아파트) ${clusterSkipped}건`);
    }

    if (totalFixed === 0 && sidoSuspects.length === 0) {
        console.log('📍 좌표 검증 통과 (시도 불일치 없음, 문제 클러스터 없음)');
    }

    console.log(`✅ 좌표 수정 총계: ${totalFixed}건`);
    return totalFixed;
}

// 비정형 주소 패턴 감지
function isIrregularAddress(addr) {
    if (!addr) return false;
    if (/\d+BL|블록/i.test(addr)) return true;           // BL/블록
    if (/일원|일대/.test(addr)) return true;              // 범위 표현
    if (/신도시|택지|지구/.test(addr) && !/\d{1,5}(?:-\d{1,5})?번?지?$/.test(addr.replace(/\(.*\)/, ''))) return true;
    if (/\([가-힣]+동\)$/.test(addr) && !/[가-힣]+동\s+\d/.test(addr)) return true;
    return false;
}

// auditIrregularAddresses는 fullCoordinateAudit/verifyNewCoordinates로 대체됨

// 좌표 전수 감사: 모든 좌표 보유 항목에 대해 DuckDuckGo/Nominatim으로 교차 검증
async function fullCoordinateAudit(lists) {
    const targets = lists.filter(i => i.coordinates && i.HOUSE_NM);
    if (targets.length === 0) return 0;

    // 웹검색 기반이므로 워커 2개, 딜레이 길게
    const WORKER_COUNT = 2;
    const WORKER_BATCH = 3;
    const WORKER_DELAY = 2500;

    console.log(`🔎 좌표 전수 감사: ${targets.length}건 교차 검증 시작 (${WORKER_COUNT}워커, Nominatim+DuckDuckGo)...`);
    let fixed = 0;
    let checked = 0;

    const chunks = Array.from({ length: WORKER_COUNT }, (_, i) =>
        targets.filter((_, idx) => idx % WORKER_COUNT === i)
    );

    async function auditItem(item) {
        const houseName = item.HOUSE_NM.replace(/\(.*\)/, '').trim();

        // 1차: DuckDuckGo 좌표 직접 추출
        let correctCoords = await webSearchCoordinates(houseName + ' 아파트 위치');

        // 2차: DuckDuckGo 주소 추출 → Nominatim
        if (!correctCoords) {
            await new Promise(r => setTimeout(r, 2000));
            correctCoords = await webSearchAndGeocode(houseName + ' 아파트');
        }

        // 3차: Nominatim 직접 (시도+단지명)
        if (!correctCoords && item.SUBSCRPT_AREA_CODE_NM) {
            await new Promise(r => setTimeout(r, 1100));
            const areaCode = normalizeSido(item.SUBSCRPT_AREA_CODE_NM);
            const fullSido = areaCode ? (AREA_CODE_TO_FULL_SIDO[areaCode] || '') : '';
            if (fullSido) {
                correctCoords = await nominatimGeocode(fullSido + ' ' + houseName + ' 아파트');
            }
        }

        if (!correctCoords) return null;

        const dist = haversineDistance(
            item.coordinates[0], item.coordinates[1],
            correctCoords[0], correctCoords[1]
        );

        if (dist > 0.5) {
            return { item, correctCoords, dist, houseName };
        }
        return null;
    }

    async function worker(workerTargets) {
        let workerFixed = 0;
        let workerChecked = 0;
        for (let i = 0; i < workerTargets.length; i += WORKER_BATCH) {
            const batch = workerTargets.slice(i, i + WORKER_BATCH);
            const results = await Promise.allSettled(batch.map(auditItem));

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                    const { item, correctCoords, dist, houseName } = r.value;
                    console.log(`  ✅ ${houseName}: ${dist.toFixed(1)}km 보정`);
                    item.coordinates = correctCoords;
                    workerFixed++;
                }
            }
            workerChecked += batch.length;
            saveWebGeocodeCache(); // 중간 저장
            await new Promise(r => setTimeout(r, WORKER_DELAY));
        }
        return { fixed: workerFixed, checked: workerChecked };
    }

    const workerResults = await Promise.all(
        chunks.map((chunk) => worker(chunk))
    );
    fixed = workerResults.reduce((sum, r) => sum + r.fixed, 0);
    checked = workerResults.reduce((sum, r) => sum + r.checked, 0);

    saveWebGeocodeCache();
    console.log(`✅ 전수 감사 완료: ${checked}건 검증, ${fixed}건 수정`);
    return fixed;
}

// 새로 지오코딩된 항목의 좌표를 DuckDuckGo/Nominatim으로 교차 검증
async function verifyNewCoordinates(lists, newlyGeocodedKeys) {
    // newlyGeocodedKeys가 없으면 비정형 주소만 검증
    const targets = newlyGeocodedKeys
        ? lists.filter(i => newlyGeocodedKeys.has(`${i.HOUSE_MANAGE_NO}_${i.PBLANC_NO}`))
        : lists.filter(i => i.HSSPLY_ADRES && i.coordinates && isIrregularAddress(i.HSSPLY_ADRES));

    if (targets.length === 0) return 0;

    const WORKER_COUNT = 2;
    const WORKER_BATCH = 3;
    const WORKER_DELAY = 2500;

    console.log(`🔎 신규/비정형 좌표 ${targets.length}건 교차 검증 (${WORKER_COUNT}워커, Nominatim+DuckDuckGo)...`);
    let fixed = 0;

    const chunks = Array.from({ length: WORKER_COUNT }, (_, i) =>
        targets.filter((_, idx) => idx % WORKER_COUNT === i)
    );

    async function verifyItem(item) {
        const houseName = item.HOUSE_NM.replace(/\(.*\)/, '').trim();

        // 1차: DuckDuckGo 좌표 직접 추출
        let correctCoords = await webSearchCoordinates(houseName + ' 아파트 위치');

        // 2차: DuckDuckGo 주소 추출 → Nominatim
        if (!correctCoords) {
            await new Promise(r => setTimeout(r, 2000));
            correctCoords = await webSearchAndGeocode(houseName + ' 아파트');
        }

        if (!correctCoords) return null;

        const dist = haversineDistance(
            item.coordinates[0], item.coordinates[1],
            correctCoords[0], correctCoords[1]
        );

        const threshold = isIrregularAddress(item.HSSPLY_ADRES) ? 0.3 : 0.5;
        if (dist > threshold) {
            return { item, correctCoords, dist, houseName };
        }
        return null;
    }

    async function worker(workerTargets, workerId) {
        let workerFixed = 0;
        for (let i = 0; i < workerTargets.length; i += WORKER_BATCH) {
            const batch = workerTargets.slice(i, i + WORKER_BATCH);
            const results = await Promise.allSettled(batch.map(verifyItem));

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                    const { item, correctCoords, dist, houseName } = r.value;
                    console.log(`  ✅ ${houseName}: ${dist.toFixed(1)}km 보정`);
                    item.coordinates = correctCoords;
                    workerFixed++;
                }
            }
            saveWebGeocodeCache();
            await new Promise(r => setTimeout(r, WORKER_DELAY));
        }
        return workerFixed;
    }

    const workerResults = await Promise.all(
        chunks.map((chunk, i) => worker(chunk, i))
    );
    fixed = workerResults.reduce((sum, n) => sum + n, 0);

    saveWebGeocodeCache();
    if (fixed > 0) {
        console.log(`✅ 교차 검증 수정: ${fixed}건`);
    } else {
        console.log(`✅ 교차 검증 통과`);
    }
    return fixed;
}

// 블록형 주소(BL/신도시) 좌표 일괄 보정
async function fixBlockAddressCoordinates(lists) {
    const targets = lists.filter(i =>
        i.coordinates && i.HOUSE_NM && i.HSSPLY_ADRES &&
        isIrregularAddress(i.HSSPLY_ADRES)
    );
    if (targets.length === 0) return 0;

    const WORKER_COUNT = 2;
    const WORKER_BATCH = 3;
    const WORKER_DELAY = 2500;

    console.log(`🏗️ 블록형 주소 좌표 보정: ${targets.length}건 (${WORKER_COUNT}워커, DuckDuckGo 우선)...`);
    let fixed = 0;

    const chunks = Array.from({ length: WORKER_COUNT }, (_, i) =>
        targets.filter((_, idx) => idx % WORKER_COUNT === i)
    );

    async function blockVerifyItem(item) {
        const houseName = item.HOUSE_NM.replace(/\(.*\)/, '').trim();

        // 1차: DuckDuckGo 좌표 직접 추출
        let correctCoords = await webSearchCoordinates(houseName + ' 아파트 위치');

        // 2차: DuckDuckGo 주소 추출 → Nominatim
        if (!correctCoords) {
            await new Promise(r => setTimeout(r, 2000));
            correctCoords = await webSearchAndGeocode(houseName + ' 아파트 주소');
        }

        // 3차: Nominatim 시도+단지명
        if (!correctCoords && item.SUBSCRPT_AREA_CODE_NM) {
            await new Promise(r => setTimeout(r, 1100));
            const areaCode = normalizeSido(item.SUBSCRPT_AREA_CODE_NM);
            const fullSido = areaCode ? (AREA_CODE_TO_FULL_SIDO[areaCode] || '') : '';
            if (fullSido) {
                correctCoords = await nominatimGeocode(fullSido + ' ' + houseName + ' 아파트');
            }
        }

        if (!correctCoords) return null;
        if (!validateCoordinates(correctCoords, item)) return null;

        const dist = haversineDistance(
            item.coordinates[0], item.coordinates[1],
            correctCoords[0], correctCoords[1]
        );

        if (dist > 0.3) {
            return { item, correctCoords, dist, houseName };
        }
        return null;
    }

    async function worker(workerTargets) {
        let workerFixed = 0;
        for (let i = 0; i < workerTargets.length; i += WORKER_BATCH) {
            const batch = workerTargets.slice(i, i + WORKER_BATCH);
            const results = await Promise.allSettled(batch.map(blockVerifyItem));

            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) {
                    const { item, correctCoords, dist, houseName } = r.value;
                    console.log(`  ✅ ${houseName}: ${dist.toFixed(1)}km 보정`);
                    item.coordinates = correctCoords;
                    workerFixed++;
                }
            }
            saveWebGeocodeCache();
            await new Promise(r => setTimeout(r, WORKER_DELAY));
        }
        return workerFixed;
    }

    const workerResults = await Promise.all(
        chunks.map((chunk) => worker(chunk))
    );
    fixed = workerResults.reduce((sum, n) => sum + n, 0);

    saveWebGeocodeCache();
    console.log(`✅ 블록형 주소 보정 완료: ${fixed}건 수정`);
    return fixed;
}

// API 호출 헬퍼
async function fetchApi(baseUrl, endpoint, params = {}) {
    const url = new URL(`${baseUrl}/${endpoint}`);
    url.searchParams.set('serviceKey', API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
    }
    return response.json();
}

// 기존 캐시 로드
function loadExistingCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        console.log('⚠️ 기존 캐시 파일 없음 - 새로 생성합니다.');
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (error) {
        console.error('❌ 캐시 파일 읽기 실패:', error.message);
        return null;
    }
}

// 캐시에서 마지막 모집공고일 확인
function getLastAnnouncementDate(cache) {
    if (!cache || !cache.lists || cache.lists.length === 0) {
        return '2020-01-01'; // 기본값
    }

    let latestDate = '2020-01-01';
    cache.lists.forEach(item => {
        const date = item.RCRIT_PBLANC_DE || '';
        if (date > latestDate) {
            latestDate = date;
        }
    });

    return latestDate;
}

// 새 공고 조회
async function fetchNewAnnouncements(afterDate) {
    console.log(`📡 ${afterDate} 이후 새 공고 조회 중...`);

    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
        const data = await fetchApi(DETAIL_BASE, 'getAPTLttotPblancDetail', {
            page,
            perPage: 100,
            [`cond[RCRIT_PBLANC_DE::GT]`]: afterDate
        });

        if (!data.data || data.data.length === 0) {
            hasMore = false;
        } else {
            // 공공분양/임대 제외
            const filtered = data.data.filter(item => {
                const houseType = item.HOUSE_DTL_SECD_NM || '';
                const houseName = item.HOUSE_NM || '';
                return !houseType.includes('공공') &&
                    !houseType.includes('임대') &&
                    !houseName.includes('공공') &&
                    !houseName.includes('신혼희망');
            });

            allItems.push(...filtered);
            page++;

            if (data.data.length < 100) hasMore = false;

            // API 부하 방지
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return allItems;
}

// Helper functions (ported from detail-utils.ts and detail-data.ts)
function toInt(value) {
    if (!value) return 0;
    const num = Number(String(value).replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
}

function toFloat(value) {
    if (!value) return 0;
    const num = parseFloat(String(value).replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
}

function normalizeModelNo(modelNo) {
    if (modelNo === null || modelNo === undefined) return "";
    let str = String(modelNo).trim().toUpperCase();
    if (/^0+[1-9]/.test(str)) {
        str = str.replace(/^0+/, "");
    }
    return str;
}

function parseHouseTypeKey(houseType) {
    const cleanType = String(houseType).trim();
    if (!cleanType) return { raw: "", numeric: 0, suffix: "", base: 0 };

    const match = cleanType.match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/);
    if (match) {
        const numericPart = parseFloat(match[1]);
        const suffixPart = match[2] || "";
        return {
            raw: cleanType,
            numeric: numericPart,
            suffix: suffixPart,
            base: Math.floor(numericPart)
        };
    }
    return { raw: cleanType, numeric: 0, suffix: "", base: 0 };
}

// Logic to build application rows (ported from buildApplicationRows in detail-data.ts)
function buildApplicationRows(models, competition, special) {
    // 1. Competition Data Aggregation
    const compMap = new Map();

    competition.forEach((item) => {
        const rawModelNo = String(item.MODEL_NO || item.HOUSE_TY || "").trim();
        const modelNo = normalizeModelNo(rawModelNo);
        if (!modelNo) return;

        const stageCode = toInt(item.SUBSCRPT_RANK_CODE);
        const region = String(item.RESIDE_SECD || "");
        const target = toInt(item.SUPLY_HSHLDCO);
        const request = toInt(item.REQ_CNT);

        const acc = compMap.get(modelNo) || {
            rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
            rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0,
        };

        if (stageCode === 1) {
            if (acc.rank1Target === null && target > 0) acc.rank1Target = target;
            acc.rank1Requests += request;
            if (region === "01") acc.rank1Local += request;
            else if (region === "02") acc.rank1Etc += request;
        } else if (stageCode === 2) {
            if (acc.rank2Target === null && target > 0) acc.rank2Target = target;
            acc.rank2Requests += request;
            if (region === "01") acc.rank2Local += request;
            else if (region === "02") acc.rank2Etc += request;
        }

        compMap.set(modelNo, acc);
    });

    // 2. Special Supply Data Aggregation
    const specialMap = new Map();

    special.forEach((item) => {
        const keys = [
            normalizeModelNo(item.MODEL_NO),
            normalizeModelNo(item.HOUSE_TY)
        ].filter((key) => key.length > 0);
        if (keys.length === 0) return;

        const instt = toInt(item.INSTT_RECOMEND_DCSN_CNT) + toInt(item.INSTT_RECOMEND_PREPAR_CNT);
        const newlywed = toInt(item.CRSPAREA_MNYCH_CNT) + toInt(item.ETC_AREA_MNYCH_CNT) + toInt(item.CTPRVN_MNYCH_CNT);
        const life = toInt(item.CRSPAREA_LFE_FRST_CNT) + toInt(item.ETC_AREA_LFE_FRST_CNT) + toInt(item.CTPRVN_LFE_FRST_CNT);
        const multi = toInt(item.CRSPAREA_NWWDS_NMTW_CNT) + toInt(item.ETC_AREA_NWWDS_NMTW_CNT) + toInt(item.CTPRVN_NWWDS_NMTW_CNT);
        const oldParent = toInt(item.CRSPAREA_OPS_CNT) + toInt(item.ETC_AREA_OPS_CNT) + toInt(item.CTPRVN_OPS_CNT);
        const etc = toInt(item.CRSPAREA_NWBB_NWBBSHR_CNT) + toInt(item.ETC_AREA_NWBB_NWBBSHR_CNT) + toInt(item.CTPRVN_NWBB_NWBBSHR_CNT);
        const transfer = toInt(item.TRANSR_INSTT_ENFSN_CNT);
        const young = toInt(item.CRSPAREA_YGMN_CNT) + toInt(item.ETC_AREA_YGMN_CNT) + toInt(item.CTPRVN_YGMN_CNT);
        const total = instt + newlywed + life + multi + oldParent + etc + transfer + young;

        keys.forEach((key) => {
            if (!key) return;
            const acc = specialMap.get(key) || {
                total: 0, instt: 0, newlywed: 0, life: 0,
                multi: 0, oldParent: 0, etc: 0, transfer: 0, young: 0,
            };

            acc.instt += instt;
            acc.newlywed += newlywed;
            acc.life += life;
            acc.multi += multi;
            acc.oldParent += oldParent;
            acc.etc += etc;
            acc.transfer += transfer;
            acc.young += young;
            acc.total += total;

            specialMap.set(key, acc);
        });
    });

    // 3. Application Rows Construction
    const rows = models
        .map((model) => {
            const rawModelNo = String(model.MODEL_NO || model.HOUSE_TY || "").trim();
            const modelNo = normalizeModelNo(rawModelNo);
            if (!modelNo) return null;

            const houseType = String(model.HOUSE_TY || model.MODEL_NO || "-").trim();
            const normHouseType = normalizeModelNo(houseType);

            const areaSqmRaw = toFloat(model.SUPLY_AR);
            const areaSqm = areaSqmRaw > 0 ? areaSqmRaw : null;
            const areaPyeong = areaSqm ? areaSqm / 3.3058 : null;

            const specialSupply = toInt(model.SPSPLY_HSHLDCO);
            const generalSupply = toInt(model.SUPLY_HSHLDCO);
            const supplyTotal = specialSupply + generalSupply;

            const priceThousand = toInt(model.LTTOT_TOP_AMOUNT);

            const comp = compMap.get(modelNo) || {
                rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
                rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0,
            };

            const rank1Target = comp.rank1Target
                ?? (generalSupply > 0 ? generalSupply : null)
                ?? (supplyTotal > 0 ? supplyTotal : null);

            const rank2Target = comp.rank2Target || rank1Target;
            const totalTarget = rank1Target || rank2Target || (generalSupply > 0 ? generalSupply : null);
            const totalRequest = comp.rank1Requests + comp.rank2Requests;

            const specialBreakdown = {
                기관추천: toInt(model.INSTT_RECOMEND_HSHLDCO),
                "신혼부부": toInt(model.MNYCH_HSHLDCO),
                "생애최초": toInt(model.LFE_FRST_HSHLDCO),
                "다자녀": toInt(model.NWWDS_HSHLDCO),
                "노부모부양": toInt(model.OLD_PARNTS_SUPORT_HSHLDCO),
                "기타": toInt(model.ETC_HSHLDCO),
            };

            const specialAgg = specialMap.get(modelNo) || specialMap.get(normHouseType);
            const specialRequests = {
                기관추천: specialAgg ? specialAgg.instt : null,
                신혼부부: specialAgg ? specialAgg.newlywed : null,
                생애최초: specialAgg ? specialAgg.life : null,
                다자녀가구: specialAgg ? specialAgg.multi : null,
                노부모부양: specialAgg ? specialAgg.oldParent : null,
                기타: specialAgg ? specialAgg.etc : null,
                이전기관: specialAgg ? specialAgg.transfer : null,
                영구임대: specialAgg ? specialAgg.young : null,
            };
            const specialRequestTotal = specialAgg ? specialAgg.total : null;

            return {
                modelNo,
                houseType,
                areaSqm,
                areaPyeong,
                priceThousand: priceThousand > 0 ? priceThousand : null,
                supplyGeneral: generalSupply,
                supplySpecial: specialSupply,
                supplyTotal,
                specialRequests,
                stages: {
                    special: {
                        target: specialSupply > 0 ? specialSupply : null,
                        request: specialRequestTotal,
                        rate: specialSupply && specialRequestTotal !== null
                            ? specialRequestTotal / specialSupply
                            : (specialSupply ? 0 : null),
                        remaining: specialSupply !== null && specialRequestTotal !== null
                            ? specialSupply - specialRequestTotal
                            : null,
                        breakdown: specialBreakdown,
                    },
                    rank1: {
                        target: rank1Target,
                        request: comp.rank1Requests || null,
                        rate: rank1Target && comp.rank1Requests
                            ? comp.rank1Requests / rank1Target
                            : (rank1Target ? 0 : null),
                        remaining: rank1Target !== null
                            ? rank1Target - comp.rank1Requests
                            : null,
                        localRequest: comp.rank1Local,
                        etcRequest: comp.rank1Etc,
                    },
                    rank2: {
                        target: rank2Target,
                        request: comp.rank2Requests || null,
                        rate: rank2Target && comp.rank2Requests
                            ? comp.rank2Requests / rank2Target
                            : (rank2Target ? 0 : null),
                        remaining: rank2Target !== null
                            ? rank2Target - comp.rank2Requests
                            : null,
                        localRequest: comp.rank2Local,
                        etcRequest: comp.rank2Etc,
                    },
                    total: {
                        target: totalTarget,
                        request: totalTarget !== null ? totalRequest : null,
                        rate: totalTarget && totalRequest
                            ? totalRequest / totalTarget
                            : (totalTarget ? 0 : null),
                        remaining: totalTarget !== null
                            ? totalTarget - totalRequest
                            : null,
                    },
                },
            };
        })
        .filter(value => value !== null)
        .sort((a, b) => {
            const aKey = parseHouseTypeKey(a.houseType);
            const bKey = parseHouseTypeKey(b.houseType);
            if (aKey.base !== null && bKey.base !== null && aKey.base !== bKey.base) return aKey.base - bKey.base;
            if (aKey.suffix && bKey.suffix && aKey.suffix !== bKey.suffix) return aKey.suffix.localeCompare(bKey.suffix, "en", { sensitivity: "base" });
            if (aKey.numeric !== null && bKey.numeric !== null && aKey.numeric !== bKey.numeric) return aKey.numeric - bKey.numeric;
            return aKey.raw.localeCompare(bKey.raw, "en", { numeric: true, sensitivity: "base" });
        });

    // 4. Totals Calculation
    const totals = rows.reduce((acc, row, index) => {
        if (index === 0) {
            return {
                modelNo: "TOTAL",
                houseType: "합계",
                areaSqm: null,
                areaPyeong: null,
                priceThousand: null,
                supplyGeneral: row.supplyGeneral,
                supplySpecial: row.supplySpecial,
                supplyTotal: row.supplyTotal,
                specialRequests: { ...row.specialRequests },
                stages: JSON.parse(JSON.stringify(row.stages)) // Deep copy
            };
        }

        if (!acc) return acc;

        acc.supplyGeneral += row.supplyGeneral;
        acc.supplySpecial += row.supplySpecial;
        acc.supplyTotal += row.supplyTotal;

        Object.keys(row.specialRequests).forEach(key => {
            acc.specialRequests[key] = (acc.specialRequests[key] || 0) + (row.specialRequests[key] || 0);
        });

        const mergeStage = (stageName) => {
            // target, request, localRequest, etcRequest 합산
            const accStage = acc.stages[stageName];
            const rowStage = row.stages[stageName];

            accStage.target = (accStage.target || 0) + (rowStage.target || 0);
            accStage.request = (accStage.request || 0) + (rowStage.request || 0);
            if (accStage.localRequest !== undefined) accStage.localRequest = (accStage.localRequest || 0) + (rowStage.localRequest || 0);
            if (accStage.etcRequest !== undefined) accStage.etcRequest = (accStage.etcRequest || 0) + (rowStage.etcRequest || 0);
        };

        mergeStage("special");
        mergeStage("rank1");
        mergeStage("rank2");
        mergeStage("total");

        return acc;
    }, null);

    // 4.1 Fix Shared Targets (if total is repeated across rows)
    if (totals && rows.length > 1) {
        const checkAndFixSharedTarget = (stage, stageName) => {
            if (!stage.target) return;
            const targets = rows.map(r => r.stages[stageName].target).filter(t => t !== null);
            if (targets.length === rows.length && targets.every(t => t === targets[0])) {
                stage.target = targets[0];
            }
        };

        checkAndFixSharedTarget(totals.stages.special, "special");
        checkAndFixSharedTarget(totals.stages.rank1, "rank1");
        checkAndFixSharedTarget(totals.stages.rank2, "rank2");
        checkAndFixSharedTarget(totals.stages.total, "total");
    }

    // 5. Fill Rates for Totals
    if (totals) {
        const fillRate = (stage) => {
            if (stage.target && stage.request !== null) {
                stage.rate = stage.target > 0 ? stage.request / stage.target : null;
                stage.remaining = stage.target - stage.request;
            } else {
                stage.rate = null;
                stage.remaining = null;
            }
        };
        fillRate(totals.stages.special);
        fillRate(totals.stages.rank1);
        fillRate(totals.stages.rank2);
        fillRate(totals.stages.total);
    }

    return { rows, missingSpecialRequests: special.length === 0, totals };
}

// Special Supply & Competition Fetching
async function fetchDetailsForItem(item) {
    const houseManageNo = item.HOUSE_MANAGE_NO;
    const pblancNo = item.PBLANC_NO;

    if (!houseManageNo || !pblancNo) return null;
    // 접수 종료 여부로 확인 (당첨자 발표 전에도 경쟁률 데이터 수집 가능)
    if (!isApplicationClosed(item)) return null;

    try {
        // Fetch all necessary datasets
        const [competData, specialData, modelData] = await Promise.all([
            fetchApi(COMPET_BASE, 'getAPTLttotPblancCmpet', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
            fetchApi(COMPET_BASE, 'getAPTSpsplyReqstStus', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
            fetchApi(DETAIL_BASE, 'getAPTLttotPblancMdl', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo })
        ]);

        const competRows = competData.data || [];
        const specialRows = specialData.data || [];
        const modelRows = modelData.data || [];

        // Build detailed rows
        const result = buildApplicationRows(modelRows, competRows, specialRows);

        // Save detailed JSON file
        const detailDir = path.join(DATA_DIR, 'details');
        if (!fs.existsSync(detailDir)) {
            fs.mkdirSync(detailDir, { recursive: true });
        }

        const detailFile = path.join(detailDir, `${houseManageNo}_${pblancNo}.json`);
        fs.writeFileSync(detailFile, JSON.stringify(result, null, 2));

        // Return summary for main cache + full detail for details-cache
        const totals = result.totals || { stages: { special: {}, rank1: {}, rank2: {}, total: {} } };
        return {
            summary: {
                totals: {
                    supplyTotal: totals.supplyTotal || 0,
                    stages: {
                        special: {
                            request: totals.stages.special.request,
                            rate: totals.stages.special.rate
                        },
                        rank1: {
                            request: totals.stages.rank1.request,
                            rate: totals.stages.rank1.rate
                        },
                        rank2: {
                            request: totals.stages.rank2.request,
                            rate: totals.stages.rank2.rate
                        },
                        total: {
                            request: totals.stages.total.request,
                            rate: totals.stages.total.rate
                        }
                    }
                }
            },
            detail: result
        };

    } catch (error) {
        console.error(`  ⚠️ ${item.HOUSE_NM} 상세 조회 실패:`, error.message);
        return null;
    }
}

// 캐시 저장
function saveCache(data) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');

    const stats = fs.statSync(CACHE_FILE);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`💾 메인 캐시 저장 완료: ${sizeMB}MB`);
}

// detail-cache에서 calculatedStats 누락분 동기화 (backfill)
function syncCalculatedStatsFromDetailCache(existingStats) {
    const detailsCachePath = path.join(DATA_DIR, 'cheongyak-details-cache.json');
    if (!fs.existsSync(detailsCachePath)) return {};
    let detailsCache;
    try {
        detailsCache = JSON.parse(fs.readFileSync(detailsCachePath, 'utf-8'));
    } catch (e) { return {}; }

    const details = detailsCache.details || {};
    const backfilled = {};
    Object.keys(details).forEach(key => {
        if (existingStats[key]) return;
        const totals = details[key]?.totals;
        if (!totals?.stages) return;
        backfilled[key] = {
            totals: {
                supplyTotal: totals.supplyTotal || 0,
                stages: {
                    special: { request: totals.stages.special?.request ?? null, rate: totals.stages.special?.rate ?? null },
                    rank1:   { request: totals.stages.rank1?.request ?? null,   rate: totals.stages.rank1?.rate ?? null },
                    rank2:   { request: totals.stages.rank2?.request ?? null,   rate: totals.stages.rank2?.rate ?? null },
                    total:   { request: totals.stages.total?.request ?? null,   rate: totals.stages.total?.rate ?? null }
                }
            }
        };
    });
    if (Object.keys(backfilled).length > 0) {
        console.log(`🔄 detail-cache에서 calculatedStats ${Object.keys(backfilled).length}건 동기화`);
    }
    return backfilled;
}

// 좌표 검증 스킵 로직: 마지막 검증 후 일정 시간 내면 건너뛰기
const COORD_VERIFY_FILE = path.join(DATA_DIR, '.last-coord-verify');
const COORD_VERIFY_INTERVAL_HOURS = 24;

function shouldSkipCoordVerify() {
    try {
        if (fs.existsSync(COORD_VERIFY_FILE)) {
            const lastVerify = new Date(fs.readFileSync(COORD_VERIFY_FILE, 'utf-8').trim());
            const hoursSince = (Date.now() - lastVerify.getTime()) / (1000 * 60 * 60);
            if (hoursSince < COORD_VERIFY_INTERVAL_HOURS) {
                console.log(`📍 좌표 검증 스킵 (${hoursSince.toFixed(1)}시간 전 완료, ${COORD_VERIFY_INTERVAL_HOURS}시간 간격)`);
                return true;
            }
        }
    } catch (e) {}
    return false;
}

function markCoordVerifyDone() {
    try {
        fs.writeFileSync(COORD_VERIFY_FILE, new Date().toISOString(), 'utf-8');
    } catch (e) {}
}

// 메인 함수
async function main() {
    console.log('🚀 청약경쟁률 대시보드 - 정적 캐시 생성 시스템');
    console.log('='.repeat(50));

    if (!API_KEY) {
        console.error('❌ REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
        process.exit(1);
    }

    // 웹 지오코딩 캐시 로드
    loadWebGeocodeCache();

    const isBackfill = process.argv.includes('--backfill');
    const isFixCoords = process.argv.includes('--fix-coords');
    const isAuditCoords = process.argv.includes('--audit-coords');
    const isQuick = process.argv.includes('--quick');

    // 1. 기존 캐시 로드
    const existingCache = loadExistingCache();
    const lastDate = isBackfill ? '2020-01-01' : getLastAnnouncementDate(existingCache);
    console.log(`📅 ${isBackfill ? '[백필 모드] ' : ''}${isFixCoords ? '[좌표수정 모드] ' : ''}${isAuditCoords ? '[전수감사 모드] ' : ''}${isQuick ? '[빠른 모드] ' : ''}마지막 캐시 공고일: ${lastDate}`);

    // 전수 감사 모드: 모든 좌표 보유 항목을 Kakao 키워드 검색으로 교차 검증
    if (isAuditCoords && existingCache?.lists) {
        const auditFixed = await fullCoordinateAudit(existingCache.lists);
        const blockFixed = await fixBlockAddressCoordinates(existingCache.lists);
        if (auditFixed > 0 || blockFixed > 0) {
            saveCache(existingCache);
        }
        if (!isFixCoords && !isBackfill) {
            console.log('✅ 전수 감사 완료. 일반 업데이트는 건너뜁니다.');
            return;
        }
    }

    // 좌표 수정 모드: 기존 좌표의 시도 불일치 검사 및 재지오코딩
    if (isFixCoords && existingCache?.lists) {
        const fixedCount = await fixInvalidCoordinates(existingCache.lists);
        // 전수 감사도 함께 실행 (--audit-coords에서 이미 실행했으면 건너뜀)
        let auditFixed = 0;
        if (!isAuditCoords) {
            auditFixed = await fullCoordinateAudit(existingCache.lists);
        }
        if (fixedCount > 0 || auditFixed > 0) {
            saveCache(existingCache);
        }
    }

    // 2. 새 공고 조회
    const newItems = await fetchNewAnnouncements(lastDate);

    // *중요* 기존 항목 중 상세 파일이 없는 경우도 처리하기 위해
    // 이번 업데이트에서는 "새 항목" + "최근 30일 항목"을 체크하도록 로직 개선이 필요할 수 있으나
    // 우선 "새 공고"에 집중합니다.

    if (newItems.length === 0) {
        console.log('✅ 새로운 공고가 없습니다.');
    } else {
        console.log(`📋 새 공고 ${newItems.length}건 발견`);
    }

    // --quick 모드: 새 공고 병합만 하고 상세 데이터/좌표 검증은 건너뜀
    if (isQuick) {
        if (newItems.length > 0) {
            const existingIds = new Set((existingCache?.lists || []).map(item => `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));
            const uniqueNewItems = newItems.filter(item => !existingIds.has(`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));
            if (uniqueNewItems.length > 0) {
                const mergedLists = [...(existingCache?.lists || []), ...uniqueNewItems];
                const quickCache = {
                    lists: mergedLists,
                    calculatedStats: existingCache?.calculatedStats || {},
                    metadata: {
                        ...existingCache?.metadata,
                        generatedAt: new Date().toISOString(),
                        totalCount: mergedLists.length
                    }
                };
                saveCache(quickCache);
                console.log(`⚡ 빠른 모드: ${uniqueNewItems.length}건 신규 공고 병합 완료`);
            }
        }
        console.log('⚡ 빠른 모드 완료 (상세 데이터/좌표 검증 생략)');
        return;
    }

    // 3. 상세 데이터 수집 (결과 발표된 것만)
    // 기존 캐시에 있는 항목 중 calculatedStats가 없는 항목 전체를 검사하여
    // 상세 데이터 누락을 방지 (기존 "최근 50개" 제한으로 인한 누락 해소)
    const allCandidates = [...newItems];
    // existingStats와 backfilledStats를 외부 스코프에서 선언 (Path A/B에서 사용)
    const existingStats = existingCache?.calculatedStats ? { ...existingCache.calculatedStats } : {};
    const backfilledStats = syncCalculatedStatsFromDetailCache(existingStats);
    Object.assign(existingStats, backfilledStats);

    if (existingCache && existingCache.lists) {
        // calculatedStats가 없거나 상세 파일이 없는 기존 항목을 대상으로 검사
        const missingItems = existingCache.lists.filter(item => {
            const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
            if (!existingStats[key]) return true;
            // calculatedStats는 있지만 상세 파일이 없는 경우도 포함
            const detailPath = path.join(DATA_DIR, 'details', `${key}.json`);
            if (!fs.existsSync(detailPath)) return true;
            return false;
        });
        allCandidates.push(...missingItems);
    }

    // 중복 제거
    const uniqueCandidates = Array.from(new Map(allCandidates.map(item => [`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`, item])).values());

    const targetItems = uniqueCandidates.filter(item => {
        // 접수 종료일 기준으로 변경 (경쟁률은 접수 후 바로 확인 가능)
        if (!isApplicationClosed(item)) return false;

        // 상세 파일 존재 여부 확인
        const detailPath = path.join(DATA_DIR, 'details', `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}.json`);
        if (fs.existsSync(detailPath)) return false; // 이미 있으면 패스 (속도 최적화)

        return true;
    });

    console.log(`📊 상세 데이터 생성 대상: ${targetItems.length}건`);

    const newCalculatedStats = {};
    const newDetailEntries = {};

    // 5개씩 병렬 처리
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetItems.length; i += BATCH_SIZE) {
        const batch = targetItems.slice(i, i + BATCH_SIZE);
        const promises = batch.map(item => fetchDetailsForItem(item));

        const results = await Promise.all(promises);

        results.forEach((res, idx) => {
            if (res) {
                const item = batch[idx];
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                newCalculatedStats[key] = res.summary;
                newDetailEntries[key] = res.detail;
            }
        });

        console.log(`  진행: ${Math.min(i + BATCH_SIZE, targetItems.length)}/${targetItems.length}`);
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate Limit buffer
    }

    // details-cache.json에 새 항목 병합
    if (Object.keys(newDetailEntries).length > 0) {
        const detailsCachePath = path.join(DATA_DIR, 'cheongyak-details-cache.json');
        let existingDetailsCache = { metadata: {}, details: {} };
        if (fs.existsSync(detailsCachePath)) {
            try {
                existingDetailsCache = JSON.parse(fs.readFileSync(detailsCachePath, 'utf-8'));
            } catch (e) {
                console.error('⚠️ details-cache.json 로드 실패, 새로 생성합니다.');
            }
        }
        const mergedDetails = { ...existingDetailsCache.details, ...newDetailEntries };
        const updatedDetailsCache = {
            metadata: {
                ...existingDetailsCache.metadata,
                generatedAt: new Date().toISOString(),
                totalCount: Object.keys(mergedDetails).length
            },
            details: mergedDetails
        };
        fs.writeFileSync(detailsCachePath, JSON.stringify(updatedDetailsCache), 'utf-8');
        const sizeMB = (fs.statSync(detailsCachePath).size / (1024 * 1024)).toFixed(2);
        console.log(`💾 상세 캐시 업데이트: ${Object.keys(newDetailEntries).length}건 추가 (총 ${Object.keys(mergedDetails).length}건, ${sizeMB}MB)`);
    }

    // 4. 캐시 병합 (새로운 항목만)
    if (newItems.length > 0) {
        const existingIds = new Set((existingCache?.lists || []).map(item => `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));
        const uniqueNewItems = newItems.filter(item => !existingIds.has(`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));

        const mergedLists = [...(existingCache?.lists || []), ...uniqueNewItems];

        // 좌표 없는 항목 지오코딩
        const newlyGeocodedKeys = new Set();
        const geocodedCount = await geocodeMissingItems(mergedLists);
        if (geocodedCount > 0) {
            // 신규 지오코딩된 항목의 키를 추적
            mergedLists.forEach(item => {
                if (item.coordinates && uniqueNewItems.some(ni =>
                    ni.HOUSE_MANAGE_NO === item.HOUSE_MANAGE_NO && ni.PBLANC_NO === item.PBLANC_NO
                )) {
                    newlyGeocodedKeys.add(`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`);
                }
            });
        }
        // 신규 항목만 교차 검증 (전체 비정형 주소 스캔 X)
        if (!isQuick && newlyGeocodedKeys.size > 0) {
            await verifyNewCoordinates(mergedLists, newlyGeocodedKeys);
        }
        // 블록형 주소 전체 보정은 --audit-coords에서만 실행 (일상 실행 제외)

        const actualStartDate = mergedLists.reduce((min, item) => {
            const d = item.RCRIT_PBLANC_DE || '';
            return d && d < min ? d : min;
        }, '99999999');
        const mergedStats = {
            ...existingStats,
            ...newCalculatedStats
        };
        const updatedCache = {
            lists: mergedLists,
            calculatedStats: mergedStats,
            metadata: {
                generatedAt: new Date().toISOString(),
                totalCount: mergedLists.length,
                statsCount: Object.keys(mergedStats).length,
                dateRange: {
                    start: actualStartDate !== '99999999' ? actualStartDate : (existingCache?.metadata?.dateRange?.start || ''),
                    end: uniqueNewItems.length > 0
                        ? uniqueNewItems[uniqueNewItems.length - 1].RCRIT_PBLANC_DE
                        : existingCache?.metadata?.dateRange?.end
                }
            }
        };
        saveCache(updatedCache);
    } else if (Object.keys(newCalculatedStats).length > 0 || Object.keys(backfilledStats || {}).length > 0) {
        // 새 항목은 없지만 기존 항목의 통계가 업데이트된 경우 (상세 파일 생성 또는 backfill)
        const mergedLists = existingCache.lists || [];

        // 좌표 없는 항목 지오코딩
        await geocodeMissingItems(mergedLists);
        // 일상 실행: 좌표 교차 검증/블록형 보정은 --audit-coords에서만

        const updatedCache = {
            ...existingCache,
            lists: mergedLists,
            calculatedStats: {
                ...existingStats,
                ...newCalculatedStats
            }
        };
        saveCache(updatedCache);
    } else {
        // 새 공고도 없고 상세 업데이트도 없지만, 좌표 미보유 항목 체크
        const lists = existingCache?.lists || [];
        const geocoded = await geocodeMissingItems(lists);
        // 일상 실행: 전체 비정형 주소 검증은 건너뜀 (--audit-coords에서만)
        if (geocoded > 0) {
            saveCache({ ...existingCache, lists });
        }
    }

    // 커버리지 로그
    const finalCache = loadExistingCache();
    if (finalCache) {
        const finalStats = Object.keys(finalCache.calculatedStats || {}).length;
        const totalLists = (finalCache.lists || []).length;
        console.log(`📊 calculatedStats 커버리지: ${finalStats}/${totalLists} (${totalLists > 0 ? ((finalStats/totalLists)*100).toFixed(1) : 0}%)`);
    }

    // 웹 지오코딩 캐시 최종 저장
    saveWebGeocodeCache();

    console.log('='.repeat(50));
    console.log(`✅ 정적 캐시 생성 완료!`);
}

main().catch(error => {
    saveWebGeocodeCache(); // 오류 시에도 캐시 저장
    console.error('❌ 자동 업데이트 실패:', error.message);
    // 업데이트 실패해도 서버는 계속 실행되도록 exit하지 않음
});
