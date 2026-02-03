/**
 * 청약 데이터 캐시 생성 스크립트 (JavaScript)
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');

// Geocoding 함수
// 주의: KAKAO_API_KEY는 REST API 키여야 합니다 (JavaScript 키 아님)
// Kakao Developers 콘솔에서 REST API 키를 발급받아 .env.local에 설정하세요
async function geocodeAddress(address) {
    if (!address) return null;

    const KAKAO_API_KEY = process.env.KAKAO_API_KEY;
    if (!KAKAO_API_KEY) {
        console.error('❌ KAKAO_API_KEY가 설정되지 않았습니다.');
        console.error('   .env.local 파일에 REST API 키를 설정하세요.');
        return null;
    }

    // 괄호 제거 및 주소 정리
    const cleanAddress = address.replace(/\([^)]*\)/g, '').trim();

    // 두 가지 주소로 시도: 정리된 주소 우선, 원본 주소(괄호만 제거) 대체
    const addresses = [cleanAddress];
    const originalWithoutParens = address.replace(/\([^)]*\)/g, '').trim();
    if (originalWithoutParens !== cleanAddress) {
        addresses.push(originalWithoutParens);
    }

    for (const addr of addresses) {
        try {
            const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `KakaoAK ${KAKAO_API_KEY}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.error('❌ Kakao API 인증 실패 (401): REST API 키가 올바른지 확인하세요.');
                    return null; // 401 에러면 더 이상 시도하지 않음
                }
                continue;
            }

            const data = await response.json();
            if (data.documents && data.documents.length > 0) {
                const doc = data.documents[0];
                const lat = parseFloat(doc.y);
                const lng = parseFloat(doc.x);
                return [lat, lng];
            }
        } catch (error) {
            // 다음 주소로 시도
            continue;
        }
    }

    return null;
}

async function geocodeAllItems(lists) {
    console.log('🗺️  주소 좌표 변환 시작...');

    let geocodedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < lists.length; i++) {
        const item = lists[i];

        if (item.HSSPLY_ADRES) {
            const coordinates = await geocodeAddress(item.HSSPLY_ADRES);

            if (coordinates) {
                item.coordinates = coordinates;
                geocodedCount++;
            } else {
                failedCount++;
            }
        } else {
            failedCount++;
        }

        // 진행 상황 로깅 (50개마다)
        if ((i + 1) % 50 === 0) {
            console.log(`  - 진행중: ${i + 1}/${lists.length} (성공: ${geocodedCount}, 실패: ${failedCount})`);
        }

        // Rate limiting (100ms 대기)
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ 좌표 변환 완료: 성공 ${geocodedCount}건, 실패 ${failedCount}건\n`);
    return { geocodedCount, failedCount };
}

// 날짜 유틸리티
function parseDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, '');
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

// 당첨자 발표가 완료되었는지 확인
function isResultAnnounced(przwnerPresnatnDe) {
    if (!przwnerPresnatnDe) return false;
    const announceDate = parseDate(przwnerPresnatnDe);
    if (!announceDate) return false;
    return announceDate < new Date();
}

// 청약 목록 데이터 수집
async function fetchNoticeList() {
    console.log('📋 청약 목록 데이터 수집 시작...');

    const allData = [];
    let page = 1;
    let hasMore = true;
    const endDate = '20251231';

    while (hasMore && page <= 100) {
        console.log(`  - 페이지 ${page} 조회 중...`);

        try {
            const params = new URLSearchParams({
                dataset: 'noticeList',
                page: String(page),
                perPage: '500',
                endDate: endDate,
                'cond[RCRIT_PBLANC_DE::LTE]': endDate,
            });

            const response = await fetch(`${API_BASE_URL}/api/cheongyak?${params.toString()}`);
            if (!response.ok) {
                console.error(`    ❌ API 오류: ${response.status}`);
                break;
            }

            const json = await response.json();
            const items = json.datasets?.noticeList || [];

            if (items.length === 0) {
                hasMore = false;
                break;
            }

            allData.push(...items);
            console.log(`    ✓ ${items.length}건 수집 (누적: ${allData.length}건)`);

            const totalCount = json.metadata?.noticeList?.totalCount || 0;
            if (allData.length >= totalCount) {
                hasMore = false;
            }

            page++;

            // API 부하 방지
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`    ❌ 오류 발생:`, error);
            break;
        }
    }

    console.log(`✅ 총 ${allData.length}건의 목록 데이터 수집 완료\n`);
    return allData;
}

// 개별 청약 상세 데이터 수집
async function fetchNoticeDetail(houseManageNo, pblancNo) {
    try {
        const params = new URLSearchParams({
            dataset: 'noticeModel,noticeCompetition,noticeSpecial',
            houseManageNo,
            pblancNo,
            perPage: '100',
        });

        const response = await fetch(`${API_BASE_URL}/api/cheongyak?${params.toString()}`);
        if (!response.ok) return null;

        const json = await response.json();
        return {
            noticeModel: json.datasets?.noticeModel || [],
            noticeCompetition: json.datasets?.noticeCompetition || [],
            noticeSpecial: json.datasets?.noticeSpecial || [],
        };
    } catch (error) {
        console.error(`    ❌ 상세 정보 수집 실패: ${houseManageNo}_${pblancNo}`, error);
        return null;
    }
}

// 상세 데이터 배치 수집
async function fetchAllDetails(lists) {
    console.log('📊 상세 데이터 수집 시작...');

    const completedItems = lists.filter(item => {
        return isResultAnnounced(item.PRZWNER_PRESNATN_DE) &&
            item.HOUSE_MANAGE_NO &&
            item.PBLANC_NO;
    });

    console.log(`  - 당첨자 발표 완료: ${completedItems.length}건 (전체 ${lists.length}건 중)`);

    const details = {};
    let successCount = 0;

    for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        if (i % 10 === 0) {
            console.log(`  - 진행중: ${i + 1}/${completedItems.length} (${Math.round((i / completedItems.length) * 100)}%)`);
        }

        const detail = await fetchNoticeDetail(
            String(item.HOUSE_MANAGE_NO),
            String(item.PBLANC_NO)
        );

        if (detail) {
            details[key] = detail;
            successCount++;
        }

        // API 부하 방지
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ 총 ${successCount}건의 상세 데이터 수집 완료\n`);
    return details;
}

// 캐시 파일 저장
function saveCache(data) {
    console.log('💾 캐시 파일 저장 중...');

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(data, null, 2), 'utf-8');

    const fileSizeMB = (fs.statSync(ARCHIVE_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`✅ 캐시 파일 저장 완료: ${ARCHIVE_FILE}`);
    console.log(`   파일 크기: ${fileSizeMB} MB\n`);
}

// 메인 실행
async function main() {
    console.log('🚀 청약 데이터 캐시 생성 시작\n');
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
        // 1. 목록 데이터 수집
        const lists = await fetchNoticeList();

        // 1.5 필터링 (공공분양/임대 제외)
        const filteredLists = lists.filter(item => {
            const houseType = item.HOUSE_DTL_SECD_NM || "";
            return !houseType.includes("공공") && !houseType.includes("임대");
        });
        console.log(`🧹 공공/임대 제외 후 ${filteredLists.length}건 (전체 ${lists.length}건)`);

        // 1.6 주소 좌표 변환 (geocoding)
        const geocodeResults = await geocodeAllItems(lists);

        // 2. 상세 데이터 수집
        const details = await fetchAllDetails(filteredLists);

        // 3. 통계 데이터 미리 계산
        console.log('🔄 경쟁률 통계 계산 중...');
        const calculatedStats = {};

        Object.keys(details).forEach(key => {
            const detail = details[key];
            const models = detail.noticeModel || [];
            const competitions = detail.noticeCompetition || [];
            const specials = detail.noticeSpecial || [];

            // 1. 총 공급 세대수 계산
            const supplyTotal = models.reduce((sum, model) => sum + Number(model.SUPLY_HSHLDCO || 0), 0);

            // 2. 경쟁률 계산 (특별공급, 1순위, 2순위, 총계)
            const stageAgg = {
                special: { supply: new Map(), apply: 0 },
                rank1: { supply: new Map(), apply: 0 },
                rank2: { supply: new Map(), apply: 0 }
            };

            // 특별공급 집계
            specials.forEach(item => {
                const modelNo = item.MODEL_NO || item.HOUSE_TY || 'DEFAULT';
                const supply = Number(item.SPSPLY_HSHLDCO || 0);

                // 모델별로 대상수 기록
                if (!stageAgg.special.supply.has(modelNo)) stageAgg.special.supply.set(modelNo, supply);

                let applyCount = 0;
                Object.keys(item).forEach(k => {
                    if (k.endsWith('_CNT')) {
                        applyCount += Number(item[k] || 0);
                    }
                });
                stageAgg.special.apply += applyCount;
            });

            // 일반공급 집계
            competitions.forEach(item => {
                const modelNo = item.MODEL_NO || item.HOUSE_TY || 'DEFAULT';
                const rankCode = Number(item.SUBSCRPT_RANK_CODE);
                const supply = Number(item.SUPLY_HSHLDCO || 0);
                const apply = Number(item.REQ_CNT || 0);

                if (rankCode === 1) {
                    if (!stageAgg.rank1.supply.has(modelNo)) stageAgg.rank1.supply.set(modelNo, supply);
                    stageAgg.rank1.apply += apply;
                } else if (rankCode === 2) {
                    if (!stageAgg.rank2.supply.has(modelNo)) stageAgg.rank2.supply.set(modelNo, supply);
                    stageAgg.rank2.apply += apply;
                }
            });

            // 대상수 합산 (중복 체크 로직 포함)
            const getFinalSupply = (map) => {
                const values = Array.from(map.values());
                if (values.length === 0) return 0;
                // 모든 값이 동일하면 하나만 사용 (단지 전체 합계인 경우)
                if (values.length > 1 && values.every(v => v === values[0] && v > 0)) {
                    return values[0];
                }
                // 그렇지 않으면 합산
                return values.reduce((s, v) => s + v, 0);
            };

            const specialSupply = getFinalSupply(stageAgg.special.supply);
            const rank1Supply = getFinalSupply(stageAgg.rank1.supply);
            const rank2Supply = getFinalSupply(stageAgg.rank2.supply);

            // 최종 비율 계산
            const calcRate = (supply, apply) => supply > 0 ? apply / supply : null;

            calculatedStats[key] = {
                totals: {
                    supplyTotal: supplyTotal,
                    stages: {
                        special: { rate: calcRate(specialSupply, stageAgg.special.apply) },
                        rank1: { rate: calcRate(rank1Supply, stageAgg.rank1.apply) },
                        rank2: { rate: calcRate(rank2Supply, stageAgg.rank2.apply) },
                        total: { rate: calcRate(specialSupply + rank1Supply, stageAgg.special.apply + stageAgg.rank1.apply + stageAgg.rank2.apply) }
                    }
                }
            };
        });
        console.log(`✅ ${Object.keys(calculatedStats).length}건 통계 계산 완료`);

        // 3. 캐시 데이터 구성
        const cacheData = {
            lists,
            calculatedStats, // 미리 계산된 통계
            // details: details, // 원본 상세 데이터 제거하여 용량 최적화 (필요시 포함 가능)
            metadata: {
                generatedAt: new Date().toISOString(),
                totalCount: lists.length,
                statsCount: Object.keys(calculatedStats).length,
                geocodedCount: geocodeResults.geocodedCount,
                dateRange: {
                    start: '2020-01-01',
                    end: '2025-12-31',
                },
            },
        };

        // 4. 파일 저장
        saveCache(cacheData);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('='.repeat(60));
        console.log(`✅ 캐시 생성 완료! (소요 시간: ${duration}초)`);
        console.log(`   - 목록 데이터: ${lists.length}건`);
        console.log(`   - 좌표 변환: ${geocodeResults.geocodedCount}건 성공, ${geocodeResults.failedCount}건 실패`);
        console.log(`   - 상세 데이터: ${Object.keys(details).length}건`);
    } catch (error) {
        console.error('❌ 캐시 생성 실패:', error);
        process.exit(1);
    }
}

// 스크립트 실행
main();
