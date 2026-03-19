/**
 * @deprecated 이 스크립트는 Kakao API 의존성을 사용합니다.
 * 대신 `node scripts/auto-update-cache.js --audit-coords` 를 사용하세요.
 * (Nominatim + DuckDuckGo 기반, API 키 불필요)
 *
 * 원래 기능: Kakao REST API를 사용한 전체 좌표 재보정 스크립트
 * - 기존 좌표 유무와 관계없이 모든 항목의 주소를 정밀 지오코딩
 * - Kakao 주소 검색 → 키워드 검색 2단계 fallback
 * - 분당 약 60건 처리 (안전 마진 포함)
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');

const CACHE_PATH = './public/data/cheongyak-archive.json';
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

if (!KAKAO_KEY) {
    console.error('KAKAO_REST_API_KEY가 .env.local에 설정되지 않았습니다.');
    process.exit(1);
}

/**
 * 주소에서 지오코딩 가능한 형태로 정제
 * 괄호, 블록명, "일원", "외 N필지" 등 제거
 */
function cleanAddress(addr) {
    if (!addr) return null;

    let cleaned = addr;

    // 괄호 안에 더 상세한 주소가 있으면 그걸 사용
    const parenMatch = addr.match(/\(([^)]*[시도군구]\s+[^)]*[동읍면리]\s+[\d-]+[^)]*)\)/);
    if (parenMatch) {
        cleaned = parenMatch[1];
    }

    // 불필요한 접미사 제거
    cleaned = cleaned
        .replace(/\s+(일원|외\s+\d+필지|내\s+\S+블록|내\s+\S+BL).*$/g, '')
        .replace(/\s+\S+BL\s*$/, '')
        .replace(/\s+\S+블록\s*$/, '')
        .replace(/\s+공공주택지구.*$/, '')
        .replace(/\s+택지개발지구.*$/, '')
        .replace(/\s+일반산업단지.*$/, '')
        .replace(/\s+도시개발구역.*$/, '')
        .replace(/\s+공급촉진지구.*$/, '')
        .replace(/번지.*$/, '번지')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return cleaned;
}

/**
 * 주소에서 시도+시군구+동 추출 (fallback용)
 */
function extractDistrict(addr) {
    if (!addr) return null;

    const match = addr.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?\s+\S+[동읍면리])/);
    if (match) return match[1];

    const sigungu = addr.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?)/);
    if (sigungu) return sigungu[1];

    return null;
}

/**
 * Kakao 주소 검색 API
 */
async function kakaoAddressSearch(query) {
    try {
        const url = 'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(query);
        const res = await fetch(url, {
            headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY }
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (body.documents && body.documents.length > 0) {
            const d = body.documents[0];
            return [parseFloat(d.y), parseFloat(d.x)];
        }
    } catch (e) { }
    return null;
}

/**
 * Kakao 키워드 검색 API (주소 검색 실패 시 fallback)
 */
async function kakaoKeywordSearch(query) {
    try {
        const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent(query);
        const res = await fetch(url, {
            headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY }
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (body.documents && body.documents.length > 0) {
            const d = body.documents[0];
            return [parseFloat(d.y), parseFloat(d.x)];
        }
    } catch (e) { }
    return null;
}

/**
 * 3단계 지오코딩: 정제주소 → 시군구+동+번지 → 단지명 키워드
 */
async function geocodeItem(item) {
    const addr = item.HSSPLY_ADRES;
    const name = item.HOUSE_NM;

    // 1단계: 정제된 전체 주소로 검색
    const cleaned = cleanAddress(addr);
    if (cleaned) {
        const coords = await kakaoAddressSearch(cleaned);
        if (coords) return { coords, method: 'address' };
    }

    // 2단계: 시도+시군구+동 추출 후 검색
    const district = extractDistrict(addr);
    if (district) {
        const coords = await kakaoAddressSearch(district);
        if (coords) return { coords, method: 'district' };
    }

    // 3단계: 단지명으로 키워드 검색
    if (name) {
        const coords = await kakaoKeywordSearch(name);
        if (coords) return { coords, method: 'keyword' };
    }

    return null;
}

async function main() {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const items = data.lists.filter(i => i.HSSPLY_ADRES);
    console.log(`Kakao 지오코딩 대상: ${items.length}건\n`);

    let success = 0, fail = 0, improved = 0, unchanged = 0;
    const methods = { address: 0, district: 0, keyword: 0 };
    const startTime = Date.now();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const result = await geocodeItem(item);

        if (result) {
            const oldCoords = item.coordinates;
            item.coordinates = result.coords;
            methods[result.method]++;
            success++;

            if (oldCoords) {
                // 기존 좌표와 비교 - 100m 이상 차이나면 개선된 것
                const dist = Math.sqrt(
                    Math.pow((result.coords[0] - oldCoords[0]) * 111000, 2) +
                    Math.pow((result.coords[1] - oldCoords[1]) * 111000 * Math.cos(result.coords[0] * Math.PI / 180), 2)
                );
                if (dist > 100) improved++;
                else unchanged++;
            } else {
                improved++;
            }

            if (i < 10) {
                console.log(`  ✓ [${i + 1}] ${item.HOUSE_NM} → [${result.coords[0].toFixed(6)}, ${result.coords[1].toFixed(6)}] (${result.method})`);
            }
        } else {
            fail++;
            if (fail <= 10) {
                console.log(`  ✗ [${i + 1}] ${item.HOUSE_NM} - 실패`);
            }
        }

        // 진행 상황 출력 + 중간 저장
        if ((i + 1) % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = ((i + 1) / elapsed * 60).toFixed(0);
            console.log(`\n  진행: ${i + 1}/${items.length} (성공: ${success}, 실패: ${fail}, 개선: ${improved}) [${elapsed}초, ${rate}건/분]\n`);
            fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
        }

        // Kakao API rate limit: 초당 10건 안전 마진
        await new Promise(r => setTimeout(r, 120));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`완료 - 성공: ${success}/${items.length}, 실패: ${fail}`);
    console.log(`개선: ${improved}건, 변화없음: ${unchanged}건`);
    console.log(`방법별: 주소검색 ${methods.address}, 지역추출 ${methods.district}, 키워드 ${methods.keyword}`);
    console.log(`소요시간: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}분`);

    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log('캐시 저장 완료');
}

main();
