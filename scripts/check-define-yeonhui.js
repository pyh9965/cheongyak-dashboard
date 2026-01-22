require('dotenv').config();

async function checkDefineYeonhui() {
    const API_KEY = process.env.REB_API_KEY;

    const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
    const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

    // 드파인 연희 찾기
    console.log('=== 드파인 연희 검색 중... ===');
    const listUrl = `${DETAIL_BASE}/getAPTLttotPblancDetail?serviceKey=${API_KEY}&page=1&perPage=100`;

    const listResponse = await fetch(listUrl);
    const listData = await listResponse.json();

    const defineYeonhui = listData.data.find(item =>
        item.HOUSE_NM && item.HOUSE_NM.includes('드파인 연희')
    );

    if (!defineYeonhui) {
        console.log('드파인 연희를 찾을 수 없습니다.');
        return;
    }

    console.log('HOUSE_NM:', defineYeonhui.HOUSE_NM);
    console.log('HOUSE_MANAGE_NO:', defineYeonhui.HOUSE_MANAGE_NO);
    console.log('PBLANC_NO:', defineYeonhui.PBLANC_NO);

    // 특별공급 데이터 조회
    const specialUrl = `${COMPET_BASE}/getAPTSpsplyReqstStus?serviceKey=${API_KEY}&page=1&perPage=100`;
    const response = await fetch(specialUrl);
    const data = await response.json();

    const filtered = data.data.filter(row =>
        String(row.HOUSE_MANAGE_NO) === String(defineYeonhui.HOUSE_MANAGE_NO) &&
        String(row.PBLANC_NO) === String(defineYeonhui.PBLANC_NO)
    );

    console.log('\n=== 드파인 연희 특별공급 현황 ===');
    console.log('타입 수:', filtered.length);

    // 올바른 필드명으로 합계 계산
    let multiChildTotal = 0;      // 다자녀
    let newlywedTotal = 0;        // 신혼부부
    let firstLifeTotal = 0;       // 생애최초
    let oldParentTotal = 0;       // 노부모
    let institutionDcsnTotal = 0; // 기관추천 본당첨
    let institutionPrepTotal = 0; // 기관추천 예비
    let newBabyTotal = 0;         // 신생아
    let youthTotal = 0;           // 청년

    filtered.forEach((row, idx) => {
        const houseTy = row.HOUSE_TY || '-';

        // 해당지역 + 기타지역 합산
        const multiChild = (Number(row.CRSPAREA_MNYCH_CNT) || 0) + (Number(row.ETC_AREA_MNYCH_CNT) || 0);
        const newlywed = (Number(row.CRSPAREA_NWWDS_NMTW_CNT) || 0) + (Number(row.ETC_AREA_NWWDS_NMTW_CNT) || 0);
        const firstLife = (Number(row.CRSPAREA_LFE_FRST_CNT) || 0) + (Number(row.ETC_AREA_LFE_FRST_CNT) || 0);
        const oldParent = (Number(row.CRSPAREA_OPS_CNT) || 0) + (Number(row.ETC_AREA_OPS_CNT) || 0);
        const newBaby = (Number(row.CRSPAREA_NWBB_NWBBSHR_CNT) || 0) + (Number(row.ETC_AREA_NWBB_NWBBSHR_CNT) || 0);
        const youth = (Number(row.CRSPAREA_YGMN_CNT) || 0) + (Number(row.ETC_AREA_YGMN_CNT) || 0);
        const institutionDcsn = Number(row.INSTT_RECOMEND_DCSN_CNT) || 0;
        const institutionPrep = Number(row.INSTT_RECOMEND_PREPAR_CNT) || 0;

        multiChildTotal += multiChild;
        newlywedTotal += newlywed;
        firstLifeTotal += firstLife;
        oldParentTotal += oldParent;
        newBabyTotal += newBaby;
        youthTotal += youth;
        institutionDcsnTotal += institutionDcsn;
        institutionPrepTotal += institutionPrep;

        const rowTotal = multiChild + newlywed + firstLife + oldParent + newBaby + youth + institutionDcsn + institutionPrep;
        console.log(`[${idx + 1}] ${houseTy}: 다자녀=${multiChild}, 신혼=${newlywed}, 생애최초=${firstLife}, 노부모=${oldParent}, 신생아=${newBaby}, 청년=${youth}, 기관추천본=${institutionDcsn}, 기관추천예비=${institutionPrep} | 소계=${rowTotal}`);
    });

    console.log('\n=== 카테고리별 합계 ===');
    console.log('다자녀:', multiChildTotal);
    console.log('신혼부부:', newlywedTotal);
    console.log('생애최초:', firstLifeTotal);
    console.log('노부모:', oldParentTotal);
    console.log('신생아:', newBabyTotal);
    console.log('청년:', youthTotal);
    console.log('기관추천 (본당첨):', institutionDcsnTotal);
    console.log('기관추천 (예비):', institutionPrepTotal);

    // 기관추천 예비 포함 vs 미포함 계산
    const totalWithoutPrep = multiChildTotal + newlywedTotal + firstLifeTotal + oldParentTotal + newBabyTotal + youthTotal + institutionDcsnTotal;
    const totalWithPrep = totalWithoutPrep + institutionPrepTotal;

    console.log('\n=== 총합계 비교 ===');
    console.log('기관추천 예비 미포함:', totalWithoutPrep);
    console.log('기관추천 예비 포함:', totalWithPrep);
    console.log('');
    console.log('프로그램 표시 데이터: 6,802건');
    console.log('청약홈 공식 데이터: 6,840건');
    console.log('');
    console.log('API(예비미포함) vs 청약홈 차이:', 6840 - totalWithoutPrep, '건');
    console.log('API(예비포함) vs 청약홈 차이:', 6840 - totalWithPrep, '건');
}

checkDefineYeonhui().catch(console.error);
