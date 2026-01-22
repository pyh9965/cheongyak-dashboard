const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/cheongyak-archive.json');

try {
    console.log(`Reading ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`File size: ${content.length} bytes`);

    console.log('Parsing JSON...');
    const data = JSON.parse(content);

    console.log('JSON Parse Success!');
    console.log(`Total lists: ${data.lists ? data.lists.length : 'undefined'}`);
    console.log(`Metadata Total: ${data.metadata ? data.metadata.totalCount : 'undefined'}`);

    if (data.lists && data.lists.length > 0) {
        console.log('First Item Date:', data.lists[0].RCRIT_PBLANC_DE);
        console.log('Last Item Date:', data.lists[data.lists.length - 1].RCRIT_PBLANC_DE);
    }

} catch (error) {
    console.error('ERROR:', error);
}
