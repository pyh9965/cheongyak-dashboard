
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const targets = [
    "고덕 자연앤 하우스디",
    "금성백조 예미지",
    "대상베르힐"
];

console.log("--- Extracting Specific Godeok Keys ---");

cache.lists.forEach(item => {
    if (targets.some(t => item.HOUSE_NM.includes(t))) {
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        console.log(`\nName: ${item.HOUSE_NM}`);
        console.log(`Key: ${key}`);
        if (cache.calculatedStats[key]) {
            console.log(`Stats:`, JSON.stringify(cache.calculatedStats[key].totals.stages, null, 2));
        }
    }
});
