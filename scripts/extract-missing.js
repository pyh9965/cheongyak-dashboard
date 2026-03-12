const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./public/data/cheongyak-archive.json', 'utf8'));
const missing = d.lists.filter(i => !i.coordinates && i.HSSPLY_ADRES);
console.log('좌표 미보유:', missing.length, '건');
const list = missing.map(i => ({ name: i.HOUSE_NM, addr: i.HSSPLY_ADRES, key: i.HOUSE_MANAGE_NO + '_' + i.PBLANC_NO }));
fs.writeFileSync('./scripts/missing-coords.json', JSON.stringify(list, null, 2));
console.log('missing-coords.json 저장 완료');
list.forEach((i, idx) => console.log(idx + 1, '|', i.name, '|', i.addr));
