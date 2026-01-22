
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const godeokItems = cache.lists.filter(i => i.HOUSE_NM.includes("고덕 자연앤 하우스디(A4BL)"));

console.log(`Found ${godeokItems.length} items:`);

godeokItems.forEach(item => {
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    const stats = cache.calculatedStats ? cache.calculatedStats[key] : null;

    console.log(`\n- ${item.HOUSE_NM} (${item.RCRIT_PBLANC_DE})`);
    if (stats) {
        console.log(`  Supply Total: ${stats.totals.supplyTotal}`);
        console.log(`  Special Rate: ${stats.totals.stages.special.rate}`);
        console.log(`  Rank1 Rate: ${stats.totals.stages.rank1.rate}`);
        console.log(`  Total Rate: ${stats.totals.stages.total.rate}`);
    } else {
        console.log(`  No stats found for key: ${key}`);
    }
});
