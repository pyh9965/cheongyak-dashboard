
// const fetch = require('node-fetch'); // Native fetch in Node 18+

async function testApi() {
    const houseManageNo = '2025000640';
    const pblancNo = '2025000640';
    const baseUrl = 'http://localhost:3000/api/cheongyak';
    const params = new URLSearchParams({
        dataset: 'noticeCompetition',
        houseManageNo,
        pblancNo
    });

    const url = `${baseUrl}?${params.toString()}`;
    console.log(`Fetching ${url}...`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(text);
            return;
        }

        const json = await res.json();
        console.log('NOTICE COMPETITION RESPONSE:');
        console.log(JSON.stringify(json, null, 2));

        if (json.datasets && json.datasets.noticeCompetition) {
            console.log(`Count: ${json.datasets.noticeCompetition.length}`);
        } else {
            console.log('No noticeCompetition field in response');
        }

    } catch (e) {
        console.error('Fetch failed:', e);
    }
}

testApi();
