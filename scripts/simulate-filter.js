
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const paramsToUse = {
    houseNm: "고덕",
    sidoCode: "all",
    houseDtlSecd: "all",
    startMonth: "2021-01",
    endMonth: "2026-01",
    saleType: "sale"
};

console.log("--- Simulation Start ---");

// 1. mergeCacheAndApiData simulation (only cache part)
const searchStart = new Date(2021, 0, 1);
const searchEnd = new Date(2026, 0, 31);
const cacheEndDate = new Date(2025, 11, 31);

let mergedData = cache.lists.filter(item => {
    const itemDateStr = item.RCRIT_PBLANC_DE || '';
    const clean = itemDateStr.replace(/-/g, '');
    if (clean.length !== 8) return false;
    const itemDate = new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );

    if (itemDate < searchStart) return false;
    if (itemDate > searchEnd) return false;
    if (itemDate <= cacheEndDate) return true;
    return false;
});

console.log(`After initial merge/date filter: ${mergedData.length} items`);

// 2. Aggressive Filter simulation (The suspected culprit)
mergedData = mergedData.filter((item) => {
    const houseType = (item.HOUSE_DTL_SECD_NM || "").trim();
    const houseName = (item.HOUSE_NM || "").trim();

    // Suspected bug: Is "국민" or something else hitting these?
    if (houseType.includes("공공") || houseName.includes("공공")) return false;
    if (houseType.includes("신혼희망") || houseName.includes("신혼희망")) return false;
    if (houseName.includes("국민임대") || houseName.includes("영구임대") || houseName.includes("행복주택")) return false;

    return true;
});

console.log(`After Aggressive Filter: ${mergedData.length} items`);

// 3. Region Filter
// (skipped if "all")

// 4. Keyword Filter
const searchKeyword = paramsToUse.houseNm.toLowerCase();
mergedData = mergedData.filter((item) => {
    const houseNm = (item.HOUSE_NM || "").toLowerCase();
    const bsnsMbyNm = (item.BSNS_MBY_NM || "").toLowerCase();
    return houseNm.includes(searchKeyword) || bsnsMbyNm.includes(searchKeyword);
});

console.log(`After Keyword Filter ('${searchKeyword}'): ${mergedData.length} items`);

// 5. Sale Type Filter
const type = paramsToUse.saleType;
mergedData = mergedData.filter((item) => {
    const rentSecd = item.RENT_SECD !== undefined ? String(item.RENT_SECD) : "0";
    if (type === "sale") return rentSecd === "0";
    return true;
});

console.log(`After Sale Type Filter ('${type}'): ${mergedData.length} items`);

if (mergedData.length === 0) {
    console.log("\nZero results! Let's see some '고덕' items that were filtered out:");
    cache.lists.filter(i => i.HOUSE_NM.includes("고덕")).slice(0, 5).forEach(i => {
        console.log(`- ${i.HOUSE_NM}`);
        console.log(`  Type: ${i.HOUSE_DTL_SECD_NM}`);
        console.log(`  Date: ${i.RCRIT_PBLANC_DE}`);
        console.log(`  RentSecd: ${i.RENT_SECD}`);
    });
}
