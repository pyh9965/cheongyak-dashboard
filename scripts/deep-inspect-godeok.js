
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const targets = [
    "2025000207", // 고덕 자연앤 하우스디(A4BL)(국민)
    "2025000200"  // 평택 고덕국제신도시 A48블록 금성백조 예미지
];

console.log("--- Deep Inspection of Godeok Stats ---");

targets.forEach(t => {
    const key = `${t}_${t}`;
    const stats = cache.calculatedStats[key];
    if (stats) {
        console.log(`\nKey: ${key}`);
        console.log(`Total Rate: ${stats.totals.stages.total.rate}`);
        console.log(`Special Rate: ${stats.totals.stages.special.rate}`);
        console.log(`Rank1 Rate: ${stats.totals.stages.rank1.rate}`);
    }
});
