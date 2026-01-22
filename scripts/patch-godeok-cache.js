
const fs = require('fs');
const path = require('path');

const cachePath = path.join(process.cwd(), 'public', 'data', 'cheongyak-archive.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

// Godeok Jayeon & Housing-D (국민)
// Correct Math: Special(298/246) + Rank1/2(692/120) = 990 / 366 = 2.7049
const keyGukmin = "2025000305_2025000305";
if (cache.calculatedStats[keyGukmin]) {
    cache.calculatedStats[keyGukmin].totals.stages.total.rate = 2.7049;
    cache.calculatedStats[keyGukmin].totals.stages.special.rate = 1.2114;
    cache.calculatedStats[keyGukmin].totals.stages.rank1.rate = 5.7667;
}

// Godeok Jayeon & Housing-D (민영)
// Correct Math: Special(25/23) + Rank1/2(857/166) = 882 / 189 = 4.666
const keyMinyoung = "2025000306_2025000306";
if (cache.calculatedStats[keyMinyoung]) {
    cache.calculatedStats[keyMinyoung].totals.stages.total.rate = 4.6667;
    cache.calculatedStats[keyMinyoung].totals.stages.special.rate = 1.0870;
    cache.calculatedStats[keyMinyoung].totals.stages.rank1.rate = 5.1627;
}

fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
console.log("Successfully patched Godeok stats in cache.");
