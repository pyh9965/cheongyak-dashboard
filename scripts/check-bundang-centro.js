require('dotenv').config();

async function checkBundangCentro() {
    const API_KEY = process.env.REB_API_KEY;
    const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

    // Test with "Dr. Fine Yeonhui" which we know exists
    const HOUSE_MANAGE_NO = '2025000660';
    const PBLANC_NO = '2025000660';
    const HOUSE_NM = '드파인 연희 (Debug Check)';

    console.log(`=== ${HOUSE_NM} 특별공급 데이터 확인 (Client-side Filtering) ===`);

    // Use page 1, 100 items - same as original script
    const specialUrl = `${COMPET_BASE}/getAPTSpsplyReqstStus?serviceKey=${API_KEY}&page=1&perPage=100`;

    try {
        const response = await fetch(specialUrl);
        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            console.log('API 데이터가 비어있습니다.');
            return;
        }

        const filtered = data.data.filter(row =>
            String(row.HOUSE_MANAGE_NO) === String(HOUSE_MANAGE_NO) &&
            String(row.PBLANC_NO) === String(PBLANC_NO)
        );

        if (filtered.length === 0) {
            console.log('해당 단지의 특별공급 데이터를 찾을 수 없습니다.');
            return;
        }

        console.log('타입 수:', filtered.length);

        let totalWithoutPrep = 0;
        let totalWithPrep = 0;

        filtered.forEach((row, idx) => {
            const houseTy = row.HOUSE_TY || '-';

            // 합산 로직
            const instt = (Number(row.INSTT_RECOMEND_DCSN_CNT) || 0);
            const insttPrep = (Number(row.INSTT_RECOMEND_PREPAR_CNT) || 0);

            const newlywed = (Number(row.CRSPAREA_MNYCH_CNT) || 0) + (Number(row.ETC_AREA_MNYCH_CNT) || 0) + (Number(row.CTPRVN_MNYCH_CNT) || 0);
            const life = (Number(row.CRSPAREA_LFE_FRST_CNT) || 0) + (Number(row.ETC_AREA_LFE_FRST_CNT) || 0) + (Number(row.CTPRVN_LFE_FRST_CNT) || 0);
            const multi = (Number(row.CRSPAREA_NWWDS_NMTW_CNT) || 0) + (Number(row.ETC_AREA_NWWDS_NMTW_CNT) || 0) + (Number(row.CTPRVN_NWWDS_NMTW_CNT) || 0);
            const oldParent = (Number(row.CRSPAREA_OPS_CNT) || 0) + (Number(row.ETC_AREA_OPS_CNT) || 0) + (Number(row.CTPRVN_OPS_CNT) || 0);
            const etc = (Number(row.CRSPAREA_NWBB_NWBBSHR_CNT) || 0) + (Number(row.ETC_AREA_NWBB_NWBBSHR_CNT) || 0) + (Number(row.CTPRVN_NWBB_NWBBSHR_CNT) || 0);
            const transfer = Number(row.TRANSR_INSTT_ENFSN_CNT) || 0;
            const young = (Number(row.CRSPAREA_YGMN_CNT) || 0) + (Number(row.ETC_AREA_YGMN_CNT) || 0) + (Number(row.CTPRVN_YGMN_CNT) || 0);

            const rowTotal = instt + newlywed + life + multi + oldParent + etc + transfer + young;
            const rowTotalWithPrep = rowTotal + insttPrep;

            totalWithoutPrep += rowTotal;
            totalWithPrep += rowTotalWithPrep;

            console.log(`[${idx + 1}] ${houseTy}: 본당첨소계=${rowTotal}, 예비포함=${rowTotalWithPrep} (예비: ${insttPrep})`);
        });

        console.log('\n=== 총합계 결과 ===');
        console.log('API (예비 미포함):', totalWithoutPrep);
        console.log('API (예비 포함):', totalWithPrep);

    } catch (e) {
        console.error("Error:", e);
    }
}

checkBundangCentro();
