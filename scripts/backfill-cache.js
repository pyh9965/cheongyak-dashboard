require('dotenv').config();
// Also try .env.local
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REB_API_KEY;
const CACHE_FILE = path.join(__dirname, '../public/data/cheongyak-archive.json');

async function fetchAllItems() {
    console.log('📡 전체 목록 데이터 수집 시작...');
    const allItems = [];
    let page = 1;
    let totalCount = 0;

    while (true) {
        const url = new URL('https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail');
        url.searchParams.set('serviceKey', API_KEY);
        url.searchParams.set('page', String(page));
        url.searchParams.set('perPage', '500');

        const res = await fetch(url.toString());
        const json = await res.json();

        if (!json.data || json.data.length === 0) break;

        totalCount = json.totalCount || totalCount;
        allItems.push(...json.data);

        console.log(`  페이지 ${page}: ${json.data.length}건 (누적: ${allItems.length}/${totalCount})`);

        if (allItems.length >= totalCount) break;
        page++;

        await new Promise(r => setTimeout(r, 300)); // rate limit
    }

    console.log(`✅ 총 ${allItems.length}건 수집 완료`);
    return allItems;
}

async function main() {
    if (!API_KEY) {
        console.error('❌ REB_API_KEY가 설정되지 않았습니다.');
        process.exit(1);
    }

    // 1. Load existing cache
    let existingCache = null;
    if (fs.existsSync(CACHE_FILE)) {
        existingCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        console.log(`📦 기존 캐시: ${existingCache.lists.length}건`);
    }

    // 2. Fetch all items from API
    const allApiItems = await fetchAllItems();

    // 3. Build merged list (API items take priority, keep existing items not in API)
    const apiItemMap = new Map();
    allApiItems.forEach(item => {
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        apiItemMap.set(key, item);
    });

    // Keep coordinate data from existing cache
    if (existingCache && existingCache.lists) {
        existingCache.lists.forEach(item => {
            const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
            if (apiItemMap.has(key) && item.coordinates) {
                apiItemMap.get(key).coordinates = item.coordinates;
            }
        });
    }

    const mergedLists = Array.from(apiItemMap.values());
    // Sort by date descending (newest first)
    mergedLists.sort((a, b) => (b.RCRIT_PBLANC_DE || '').localeCompare(a.RCRIT_PBLANC_DE || ''));

    // 4. Calculate date range
    const dates = mergedLists.map(d => d.RCRIT_PBLANC_DE).filter(Boolean).sort();
    const startDate = dates[0] || '';
    const endDate = dates[dates.length - 1] || '';

    // 5. Build updated cache
    const updatedCache = {
        lists: mergedLists,
        calculatedStats: existingCache?.calculatedStats || {},
        metadata: {
            generatedAt: new Date().toISOString(),
            totalCount: mergedLists.length,
            statsCount: Object.keys(existingCache?.calculatedStats || {}).length,
            dateRange: { start: startDate, end: endDate },
            geocodedCount: existingCache?.metadata?.geocodedCount || 0,
            lastGeocodedAt: existingCache?.metadata?.lastGeocodedAt || null,
        }
    };

    // 6. Save
    fs.writeFileSync(CACHE_FILE, JSON.stringify(updatedCache, null, 2), 'utf-8');
    const sizeMB = (fs.statSync(CACHE_FILE).size / 1024 / 1024).toFixed(2);

    console.log('\n=== 결과 ===');
    console.log(`총 항목: ${mergedLists.length}건`);
    console.log(`날짜 범위: ${startDate} ~ ${endDate}`);
    console.log(`파일 크기: ${sizeMB}MB`);
    console.log(`기존 통계 유지: ${Object.keys(existingCache?.calculatedStats || {}).length}건`);
}

main().catch(e => { console.error('❌ 오류:', e); process.exit(1); });
