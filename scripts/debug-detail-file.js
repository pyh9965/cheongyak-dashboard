const fs = require('fs');
const path = require('path');

const archivePath = path.join(__dirname, '../public/data/cheongyak-archive.json');
const detailsDir = path.join(__dirname, '../public/data/details');

try {
    const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    console.log('Archive Keys:', Object.keys(archiveData));
    const list = archiveData.lists || archiveData.data || archiveData;

    if (!Array.isArray(list)) {
        console.log('List is not an array:', typeof list, Array.isArray(archiveData.lists));
        return;
    }

    const target = list.find(item => item.HOUSE_NM && item.HOUSE_NM.includes('동래 푸르지오 에듀포레'));

    if (target) {
        console.log('Found Item:', target.HOUSE_NM);
        console.log('HOUSE_MANAGE_NO:', target.HOUSE_MANAGE_NO);
        console.log('PBLANC_NO:', target.PBLANC_NO);
        console.log('RCRIT_PBLANC_DE:', target.RCRIT_PBLANC_DE);
        console.log('PRZWNER_PRESNATN_DE:', target.PRZWNER_PRESNATN_DE);

        const presDate = target.PRZWNER_PRESNATN_DE ? new Date(target.PRZWNER_PRESNATN_DE.replace(/-/g, '/')) : null;
        console.log('Parsed Valid Date:', presDate);
        console.log('Current Date:', new Date());
        console.log('Is Past:', presDate && presDate <= new Date());

        const filename = `${target.HOUSE_MANAGE_NO}_${target.PBLANC_NO}.json`;
        const detailPath = path.join(detailsDir, filename);

        if (fs.existsSync(detailPath)) {
            console.log(`Detail file exists at ${detailPath}`);
            const detailData = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            console.log('Detail Data Keys:', Object.keys(detailData));
            if (detailData.rows) {
                console.log('Rows count:', detailData.rows.length);
                console.log('First row:', JSON.stringify(detailData.rows[0], null, 2));
            } else {
                console.log('Rows property is missing or empty.');
            }
        } else {
            console.log(`Detail file DOES NOT exist at ${detailPath}`);
        }
    } else {
        console.log('Target item not found in archive.');
    }
} catch (error) {
    console.error('Error:', error);
}
