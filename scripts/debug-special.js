
// Node.js 18+ has native fetch
// const fetch = require('node-fetch');

const API_BASE_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'YOUR_DECODED_KEY_HERE'; // .env.local 값을 사용하거나 직접 입력 필요하지만, 여기서는 로컬 프록시 대신 실제 API를 호출하거나 로컬 서버를 통해야 함. 
// 하지만 로컬 서버(Next.js)가 켜져 있으므로 로컬 API를 찌르는 게 인증 문제 없이 편함.
const LOCAL_API_URL = 'http://localhost:3000/api/cheongyak';

async function run() {
    console.log('🔍 데이터 디버깅 시작...');

    // 1. 목록에서 아파트 찾기
    const targetName = "청계리버뷰자이";

    // 최근 2년치 정도 뒤져야 함.
    // 하지만 API가 페이징이므로, page 1부터 검색

    let targetItem = null;

    for (let page = 1; page <= 20; page++) {
        console.log(`페이지 ${page} 검색 중...`);
        const res = await fetch(`${LOCAL_API_URL}?dataset=noticeList&page=${page}&perPage=100&endDate=20241231`);
        const json = await res.json();
        const list = json.datasets?.noticeList || [];

        targetItem = list.find(item => item.HOUSE_NM.includes(targetName));
        if (targetItem) break;
    }

    if (!targetItem) {
        console.log(`❌ '${targetName}'을 찾을 수 없습니다.`);
        return;
    }

    console.log(`✅ 찾음: ${targetItem.HOUSE_NM} (${targetItem.HOUSE_MANAGE_NO} / ${targetItem.PBLANC_NO})`);

    // 2. 상세 데이터 조회 (Special)
    console.log(`\n데이터 상세 조회 중...`);
    const detailUrl = `${LOCAL_API_URL}?dataset=noticeSpecial,noticeModel&houseManageNo=${targetItem.HOUSE_MANAGE_NO}&pblancNo=${targetItem.PBLANC_NO}`;
    const detailRes = await fetch(detailUrl);
    const detailJson = await detailRes.json();

    // 키 확인
    if (detailJson.datasets) {
        console.log("Datasets keys:", Object.keys(detailJson.datasets));
    } else {
        console.log("detailJson.datasets is undefined or null");
    }

    // 전체 응답 구조 확인 (datasets 부분만)
    console.log("---------------------------------------------------");
    console.log("Datasets JSON:", JSON.stringify(detailJson.datasets, null, 2));
    console.log("---------------------------------------------------");

    const specials = detailJson.datasets?.noticeSpecial || [];
    const models = detailJson.datasets?.noticeModel || [];

    console.log(`\n📋 [noticeSpecial] 데이터 (${specials.length}건) - Raw Array:`);
    console.log(specials);

    console.log(`\n📋 [noticeModel] 데이터 (${models.length}건):`);
    // 모델 데이터 확인 (전체 공급수 확인용)
    const supplyTotal = models.reduce((sum, m) => sum + Number(m.SUPLY_HSHLDCO || 0), 0);
    console.log(`총 공급 세대수: ${supplyTotal}`);

    // 로직 검증 (수정된 로직)
    let specialSupply = 0;
    let specialApply = 0;

    specials.forEach(item => {
        // 특별공급 배정 세대수 필드명: SPSPLY_HSHLDCO
        specialSupply += Number(item.SPSPLY_HSHLDCO || 0);

        // 접수 건수: 모든 _CNT 필드 합산
        let applyCount = 0;
        Object.keys(item).forEach(k => {
            if (k.endsWith('_CNT')) {
                applyCount += Number(item[k] || 0);
            }
        });
        specialApply += applyCount;
    });

    console.log(`\n🧮 [수정후] 특별공급 총 세대수: ${specialSupply}`);
    console.log(`🧮 [수정후] 특별공급 총 접수건: ${specialApply}`);
    console.log(`📊 [수정후] 경쟁률: ${(specialApply / specialSupply).toFixed(2)}:1`);
}

run();
