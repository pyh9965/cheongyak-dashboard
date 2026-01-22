/**
 * 청약홈 API 연결 테스트 스크립트
 * 직접 공공데이터 API를 호출하여 응답을 확인합니다.
 */

require('dotenv').config({ path: '.env' });

const API_KEY = process.env.REB_API_KEY;

if (!API_KEY) {
    console.error('❌ REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

const BASE_URLS = {
    detail: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
    competition: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1"
};

// 테스트할 청약 정보 (역삼센트럴자이)
const TEST_HOUSE_MANAGE_NO = "2025000566";
const TEST_PBLANC_NO = "2025000566";

async function testAPI(baseUrl, endpoint, description) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📡 테스트: ${description}`);
    console.log(`${'='.repeat(60)}`);

    const params = new URLSearchParams({
        serviceKey: API_KEY,
        returnType: "json",
        page: "1",
        perPage: "100",
        "cond[HOUSE_MANAGE_NO::EQ]": TEST_HOUSE_MANAGE_NO,
        "cond[PBLANC_NO::EQ]": TEST_PBLANC_NO
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log(`\n📌 URL: ${url.substring(0, 100)}...`);

    try {
        const response = await fetch(url);
        console.log(`\n📊 HTTP 상태: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const text = await response.text();
            console.log(`❌ 에러 응답: ${text.substring(0, 500)}`);
            return null;
        }

        const json = await response.json();

        // 응답 코드 확인
        console.log(`\n📋 응답 코드: ${json.code}`);
        if (json.msg) console.log(`📋 응답 메시지: ${json.msg}`);

        // 데이터 추출
        const data = json.data || json.body || [];
        console.log(`📋 데이터 개수: ${Array.isArray(data) ? data.length : (data ? 1 : 0)}개`);

        // 메타데이터
        if (json.totalCount !== undefined) console.log(`📋 전체 건수: ${json.totalCount}`);
        if (json.currentCount !== undefined) console.log(`📋 현재 건수: ${json.currentCount}`);

        // 첫 번째 데이터 샘플 출력
        if (Array.isArray(data) && data.length > 0) {
            console.log(`\n📦 첫 번째 데이터 샘플:`);
            const sample = data[0];
            const keys = Object.keys(sample);
            console.log(`   - 필드 개수: ${keys.length}개`);
            console.log(`   - 필드 목록: ${keys.join(', ')}`);
            console.log(`\n   📝 상세 값:`);
            keys.forEach(key => {
                const value = sample[key];
                console.log(`      ${key}: ${value}`);
            });
        }

        return { data, json };
    } catch (error) {
        console.log(`\n❌ 에러 발생: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('');
    console.log('🚀 청약홈 API 연결 테스트 시작');
    console.log('📌 테스트 대상: 역삼센트럴자이 (2025000566)');
    console.log('');

    // 1. 모델 정보 API 테스트
    const modelResult = await testAPI(
        BASE_URLS.detail,
        "getAPTLttotPblancMdl",
        "모델 정보 (타입별 공급 세대)"
    );

    // 2. 경쟁률 API 테스트
    const competitionResult = await testAPI(
        BASE_URLS.competition,
        "getAPTLttotPblancCmpet",
        "경쟁률 (1순위/2순위 접수 현황)"
    );

    // 3. 특별공급 API 테스트
    const specialResult = await testAPI(
        BASE_URLS.competition,
        "getAPTSpsplyReqstStus",
        "특별공급 접수 현황"
    );

    // 요약
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 테스트 결과 요약');
    console.log(`${'='.repeat(60)}`);

    console.log(`\n1. 모델 정보: ${modelResult ? `✅ 성공 (${modelResult.data?.length || 0}개)` : '❌ 실패'}`);
    console.log(`2. 경쟁률: ${competitionResult ? `✅ 성공 (${competitionResult.data?.length || 0}개)` : '❌ 실패'}`);
    console.log(`3. 특별공급: ${specialResult ? `✅ 성공 (${specialResult.data?.length || 0}개)` : '❌ 실패'}`);

    // 저장 가능한 정보 분석
    console.log(`\n${'='.repeat(60)}`);
    console.log('💾 저장 가능한 정보 분석');
    console.log(`${'='.repeat(60)}`);

    if (modelResult?.data?.length > 0) {
        console.log('\n📦 모델 정보에서 저장 가능한 필드:');
        const modelKeys = Object.keys(modelResult.data[0]);
        const importantModelFields = [
            'MODEL_NO', 'HOUSE_TY', 'SUPLY_AR', 'SUPLY_HSHLDCO', 'SPSPLY_HSHLDCO',
            'LTTOT_TOP_AMOUNT', 'INSTT_RECOMEND_HSHLDCO', 'LFE_FRST_HSHLDCO',
            'MNYCH_HSHLDCO', 'NWWDS_HSHLDCO', 'OLD_PARNTS_SUPORT_HSHLDCO'
        ];
        importantModelFields.forEach(field => {
            if (modelKeys.includes(field)) {
                console.log(`   ✅ ${field}: ${modelResult.data[0][field]}`);
            }
        });
    }

    if (competitionResult?.data?.length > 0) {
        console.log('\n📦 경쟁률 정보에서 저장 가능한 필드:');
        const compKeys = Object.keys(competitionResult.data[0]);
        const importantCompFields = [
            'MODEL_NO', 'HOUSE_TY', 'SUBSCRPT_RANK_CODE', 'RESIDE_SECD',
            'SUPLY_HSHLDCO', 'REQ_CNT'
        ];
        importantCompFields.forEach(field => {
            if (compKeys.includes(field)) {
                console.log(`   ✅ ${field}: ${competitionResult.data[0][field]}`);
            }
        });
    }

    if (specialResult?.data?.length > 0) {
        console.log('\n📦 특별공급 정보에서 저장 가능한 필드:');
        const specialKeys = Object.keys(specialResult.data[0]);
        console.log(`   - 총 ${specialKeys.length}개 필드`);
        console.log(`   - 주요 필드: ${specialKeys.slice(0, 10).join(', ')}...`);
    }

    console.log('\n✅ 테스트 완료!');
}

main().catch(console.error);
