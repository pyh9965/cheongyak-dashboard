
const fs = require('fs');
const path = require('path');

const archivePath = path.join(__dirname, '../public/data/cheongyak-archive.json');

try {
    const data = fs.readFileSync(archivePath, 'utf8');
    const json = JSON.parse(data);
    const list = json.lists || [];

    console.log(`Total items in archive: ${list.length}`);

    const yeoksam = list.find(item => item.HOUSE_MANAGE_NO === '2025000566' || item.PBLANC_NO === '2025000566');
    const banpo = list.find(item => item.HOUSE_MANAGE_NO === '2025000527' || item.PBLANC_NO === '2025000527');

    if (yeoksam) {
        console.log('Found Yeoksam:', yeoksam.HOUSE_NM, yeoksam.HOUSE_MANAGE_NO);
        console.log('Yeoksam Details:', JSON.stringify(yeoksam, null, 2));
    } else {
        console.log('Yeoksam (2025000566) NOT FOUND in archive.');
    }

    if (banpo) {
        console.log('Found Banpo:', banpo.HOUSE_NM, banpo.HOUSE_MANAGE_NO);
        console.log('Banpo Details:', JSON.stringify(banpo, null, 2));
    } else {
        console.log('Banpo (2025000527) NOT FOUND in archive.');
    }

} catch (err) {
    console.error('Error reading archive:', err);
}
