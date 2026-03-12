/**
 * 좌표 미보유 367건 보정 스크립트
 * 비정형 주소에서 동/읍/면 레벨 주소를 추출하여 Nominatim 지오코딩
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs = require('fs');

const CACHE_PATH = './public/data/cheongyak-archive.json';

// 시도 정규화
const SIDO_MAP = {
    "서울특별시": "서울특별시", "부산광역시": "부산광역시", "대구광역시": "대구광역시",
    "인천광역시": "인천광역시", "광주광역시": "광주광역시", "대전광역시": "대전광역시",
    "울산광역시": "울산광역시", "세종특별자치시": "세종특별자치시",
    "경기도": "경기도", "강원특별자치도": "강원도", "강원도": "강원도",
    "충청북도": "충청북도", "충청남도": "충청남도",
    "전라북도": "전라북도", "전북특별자치도": "전라북도",
    "전라남도": "전라남도", "경상북도": "경상북도", "경상남도": "경상남도",
    "제주특별자치도": "제주특별자치도"
};

/**
 * 비정형 주소에서 지오코딩 가능한 주소를 추출
 * 전략: 시도 + 시군구 + 동/읍/면/리 추출
 */
function extractGeocodableAddress(addr, houseName) {
    if (!addr) return null;

    const strategies = [];

    // 괄호 안 주소 추출 (예: "지구명 (경기도 파주시 서패동 432번지)")
    const parenMatch = addr.match(/\(([^)]*[시도군구]\s+[^)]*[동읍면리][^)]*)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].replace(/\d+-?\d*번지.*/, '').replace(/일원.*/, '').replace(/\s+외\s+.*/, '').trim();
        strategies.push(inner);
    }

    // 전체 주소에서 시도+시군구+동 패턴 추출
    const fullMatch = addr.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?\s+\S+[동읍면리])/);
    if (fullMatch) {
        strategies.push(fullMatch[1]);
    }

    // 시도+시군구만 추출 (동이 없는 경우)
    const sigunguMatch = addr.match(/((?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s+\S+[시군구](?:\s+\S+[구])?)/);
    if (sigunguMatch) {
        // 추가로 동/읍/면 추출 시도
        const restAfterSigungu = addr.substring(addr.indexOf(sigunguMatch[1]) + sigunguMatch[1].length);
        const dongMatch = restAfterSigungu.match(/\s+(\S+[동읍면리])/);
        if (dongMatch) {
            strategies.push(sigunguMatch[1] + ' ' + dongMatch[1]);
        }
        strategies.push(sigunguMatch[1]);
    }

    // 세종시 특수 처리
    if (addr.includes('세종') || addr.includes('행정중심복합도시')) {
        const sejongDong = addr.match(/세종특별자치시\s+(\S+[동읍면리])/);
        if (sejongDong) {
            strategies.push('세종특별자치시 ' + sejongDong[1]);
        }
        strategies.push('세종특별자치시');
    }

    // 단지명에서 지역 힌트 추출 (예: "평택 고덕" -> 경기도 평택시 고덕동)

    return strategies.length > 0 ? strategies : null;
}

async function geocode(query) {
    try {
        const url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&countrycodes=kr&limit=1';
        const res = await fetch(url, { headers: { 'User-Agent': 'cheongyak-dashboard/1.0' } });
        if (!res.ok) return null;
        const body = await res.json();
        if (body.length > 0) return [parseFloat(body[0].lat), parseFloat(body[0].lon)];
    } catch (e) {}
    return null;
}

async function main() {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const missing = data.lists.filter(i => !i.coordinates && i.HSSPLY_ADRES);
    console.log('보정 대상:', missing.length, '건\n');

    let success = 0, fail = 0;

    for (let i = 0; i < missing.length; i++) {
        const item = missing[i];
        const strategies = extractGeocodableAddress(item.HSSPLY_ADRES, item.HOUSE_NM);

        if (!strategies) {
            fail++;
            console.log(`  ✗ [${i+1}] 주소 추출 실패: ${item.HSSPLY_ADRES}`);
            continue;
        }

        let found = false;
        for (const addr of strategies) {
            const coords = await geocode(addr);
            if (coords) {
                item.coordinates = coords;
                success++;
                found = true;
                if (success <= 20) console.log(`  ✓ [${i+1}] ${item.HOUSE_NM} → ${addr} → [${coords[0]}, ${coords[1]}]`);
                break;
            }
            await new Promise(r => setTimeout(r, 1100));
        }

        if (!found) {
            fail++;
            if (fail <= 20) console.log(`  ✗ [${i+1}] ${item.HOUSE_NM} - 모든 전략 실패: ${strategies.join(' | ')}`);
        }

        if ((i+1) % 50 === 0) {
            console.log(`\n  진행: ${i+1}/${missing.length} (성공: ${success}, 실패: ${fail})\n`);
            fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
        }

        await new Promise(r => setTimeout(r, 1100));
    }

    console.log(`\n완료 - 성공: ${success}/${missing.length}, 실패: ${fail}`);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log('캐시 저장 완료');
}

main();
