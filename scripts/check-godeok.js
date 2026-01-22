
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

console.log(`Total items in cache: ${data.lists.length}`);

const godeok = data.lists.filter(item =>
    (item.HOUSE_NM && item.HOUSE_NM.includes('고덕')) ||
    (item.HSSPLY_ADRES && item.HSSPLY_ADRES.includes('고덕'))
);

console.log(`\nFound ${godeok.length} Godeok items:`);
godeok.slice(0, 10).forEach(item => {
    console.log(`- ${item.HOUSE_NM} (${item.RCRIT_PBLANC_DE})`);
    console.log(`  AreaCode: ${item.SUBSCRPT_AREA_CODE}, AreaName: ${item.SUBSCRPT_AREA_CODE_NM}`);
    console.log(`---`);
});
