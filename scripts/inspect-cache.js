
const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '../public/data/cheongyak-archive.json');
const outputPath = path.join(__dirname, 'cache_inspection.txt');

try {
    const log = (msg) => {
        fs.appendFileSync(outputPath, msg + '\n');
        console.log(msg);
    };

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    log(`Reading cache file... ${cachePath}`);

    if (!fs.existsSync(cachePath)) {
        log('File not found!');
        process.exit(1);
    }

    const rawData = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(rawData);

    log(`Total items: ${cache.lists.length}`);
    if (cache.lists && cache.lists.length > 0) {
        log('Sample List Item: ' + JSON.stringify(cache.lists[0], null, 2));
    }

    if (cache.calculatedStats) {
        const keys = Object.keys(cache.calculatedStats);
        log(`Calculated stats count: ${keys.length}`);

        if (keys.length > 0) {
            const sampleKey = keys[0];
            log(`Sample Key: ${sampleKey}`);
            log(`Sample Data: ${JSON.stringify(cache.calculatedStats[sampleKey], null, 2)}`);

            // Check null rates
            let nullRateCount = 0;
            let validRateCount = 0;
            keys.forEach(k => {
                const s = cache.calculatedStats[k];
                if (s.totals?.stages?.total?.rate === null) nullRateCount++;
                else validRateCount++;
            });
            log(`Null rates: ${nullRateCount}, Valid rates: ${validRateCount}`);
        }
    } else {
        log('No calculatedStats found.');
    }

} catch (error) {
    const fs = require('fs');
    fs.appendFileSync('scripts/cache_inspection.txt', 'Error: ' + error.message);
    console.error(error);
}
