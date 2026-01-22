
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

console.log("--- Scanning Godeok Items ---");

const godeokItems = cache.lists.filter(i => i.HOUSE_NM.includes("고덕"));

godeokItems.forEach(item => {
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    const stats = cache.calculatedStats[key];
    if (stats) {
        console.log(`\nItem: ${item.HOUSE_NM}`);
        console.log(`Key: ${key}`);
        console.log(`Current Total Rate: ${stats.totals.stages.total.rate}`);

        // If the rate is suspicious (e.g., looks like it was divided by 3 because of 3 types), we should fix it.
        // For "금성백조 예미지" from the screenshot: List says 4.73, Map says 1.33.
        // 1.33 * 3 = 3.99. 4.73 is likely correct.
    }
});
