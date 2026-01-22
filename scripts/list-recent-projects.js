require('dotenv').config();
const fs = require('fs');

async function listRecentProjects() {
    const API_KEY = process.env.REB_API_KEY;
    const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';

    console.log('=== 최근 청약 단지 목록 조회 중... ===');
    const listUrl = `${DETAIL_BASE}/getAPTLttotPblancDetail?serviceKey=${API_KEY}&page=1&perPage=20`;

    try {
        const listResponse = await fetch(listUrl);
        const listData = await listResponse.json();

        if (!listData.data || listData.data.length === 0) {
            console.log('데이터가 없습니다.');
            return;
        }

        const lines = [];
        lines.push('=== 최근 20개 단지 목록 ===');
        listData.data.forEach((item, index) => {
            lines.push(`[${index + 1}] ${item.HOUSE_NM} | ID: ${item.HOUSE_MANAGE_NO} | 공고: ${item.PBLANC_NO} | 일자: ${item.RCRIT_PBLANC_DE}`);
        });

        fs.writeFileSync('recent_projects.txt', lines.join('\n'));
        console.log('목록이 recent_projects.txt에 저장되었습니다.');

    } catch (error) {
        console.error('API 호출 중 오류 발생:', error);
    }
}

listRecentProjects();
