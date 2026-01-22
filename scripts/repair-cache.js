/**
 * 청약 데이터 캐시 Repair 스크립트
 * 목표: cheongyak-archive.json 파일에 있는 목록 중, Calculated Stats가 누락되었거나 불완전한 항목을 찾아
 * API를 통해 상세 정보를 다시 수집하고 통계를 계산하여 업데이트한다.
 */

const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');

// ----------------------------------------------------------------------
// 유틸리티 함수 (generate-cache.js에서 복사)
// ----------------------------------------------------------------------

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

function isResultAnnounced(przwnerPresnatnDe) {
    if (!przwnerPresnatnDe) return false;
    const announceDate = parseDate(przwnerPresnatnDe);
    if (!announceDate) return false;
    // 당첨자 발표일이 지났는지 확인 (API에는 보통 발표 후 데이터가 들어옴)
    // 안전하게 오늘보다 이전이면 True
    return announceDate < new Date();
}

// ----------------------------------------------------------------------
// 상세 데이터 수집 (fetchNoticeDetail)
// ----------------------------------------------------------------------

async function fetchNoticeDetail(houseManageNo, pblancNo) {
    try {
        const params = new URLSearchParams({
            dataset: 'noticeModel,noticeCompetition,noticeSpecial',
            houseManageNo,
            pblancNo,
            perPage: '100',
        });

        // API 호출
        const response = await fetch(`${API_BASE_URL}/api/cheongyak?${params.toString()}`);
        if (!response.ok) {
            console.error(`    ❌ 상세 정보 요청 실패 (${response.status}): ${houseManageNo}_${pblancNo}`);
            return null;
        }

        const json = await response.json();
        return {
            noticeModel: json.datasets?.noticeModel || [],
            noticeCompetition: json.datasets?.noticeCompetition || [],
            noticeSpecial: json.datasets?.noticeSpecial || [],
        };
    } catch (error) {
        console.error(`    ❌ 상세 정보 수집 오류: ${houseManageNo}_${pblancNo}`, error);
        return null;
    }
}

// ----------------------------------------------------------------------
// 통계 계산 로직 (generate-cache.js에서 복사)
// ----------------------------------------------------------------------

function calculateStatsForItem(detail) {
    if (!detail) return null;

    const models = detail.noticeModel || [];
    const competitions = detail.noticeCompetition || [];
    const specials = detail.noticeSpecial || [];

    // 1. 총 공급 세대수 계산
    const supplyTotal = models.reduce((sum, model) => sum + Number(model.SUPLY_HSHLDCO || 0), 0);

    // 2. 경쟁률 계산 (특별공급, 1순위, 2순위, 총계)
    const stageAgg = {
        special: { supply: new Map(), apply: 0, target: 0 },
        rank1: { supply: new Map(), apply: 0, target: 0 },
        rank2: { supply: new Map(), apply: 0, target: 0 }
    };

    // 특별공급 집계
    specials.forEach(item => {
        const modelNo = item.MODEL_NO || item.HOUSE_TY || 'DEFAULT';
        const supply = Number(item.SPSPLY_HSHLDCO || 0);

        // 모델별로 공급수 기록
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
        const supply = Number(item.SUPLY_HSHLDCO || 0); // 일반공급 공급세대수
        const apply = Number(item.REQ_CNT || 0); // 접수건수

        if (rankCode === 1) {
            if (!stageAgg.rank1.supply.has(modelNo)) stageAgg.rank1.supply.set(modelNo, supply);
            stageAgg.rank1.apply += apply;
        } else if (rankCode === 2) {
            if (!stageAgg.rank2.supply.has(modelNo)) stageAgg.rank2.supply.set(modelNo, supply);
            stageAgg.rank2.apply += apply;
        }
    });

    // 공급수(Target) 합산 (중복 체크 로직 포함)
    // 여러 주택형(Model No)에 대해 각각 공급수가 있으므로 이를 모두 합쳐야 함.
    const getFinalSupply = (map) => {
        // Map<ModelNo, Count>
        const values = Array.from(map.values());
        if (values.length === 0) return 0;
        return values.reduce((s, v) => s + v, 0);
    };

    // 각 단계별 총 공급수
    stageAgg.special.target = getFinalSupply(stageAgg.special.supply);
    stageAgg.rank1.target = getFinalSupply(stageAgg.rank1.supply);
    stageAgg.rank2.target = getFinalSupply(stageAgg.rank2.supply);

    // 최종 비율 계산 함수
    const calcRate = (supply, apply) => supply > 0 ? apply / supply : 0;

    return {
        totals: {
            supplyTotal: supplyTotal, // 전체 공급 세대수 (특별 + 일반 포함) - noticeModel 기반
            stages: {
                special: {
                    target: stageAgg.special.target,
                    request: stageAgg.special.apply,
                    rate: calcRate(stageAgg.special.target, stageAgg.special.apply)
                },
                rank1: {
                    target: stageAgg.rank1.target,
                    request: stageAgg.rank1.apply,
                    rate: calcRate(stageAgg.rank1.target, stageAgg.rank1.apply)
                },
                rank2: {
                    target: stageAgg.rank2.target,
                    request: stageAgg.rank2.apply,
                    rate: calcRate(stageAgg.rank2.target, stageAgg.rank2.apply)
                },
                total: {
                    // 전체 경쟁률: (특별 접수 + 1,2순위 접수) / (특별 공급 + 일반 공급)
                    // 주의: noticeModel의 SUPLY_HSHLDCO는 전체 공급량.
                    // 따라서 분모는 supplyTotal을 쓰는게 맞을 수도 있고, 
                    // 청약이 진행된(공급이 있는) 세대수만 합산해야 할 수도 있음.
                    // 여기서는 계산된 각 단계별 공급의 합을 사용.
                    target: stageAgg.special.target + stageAgg.rank1.target, // 2순위 공급은 1순위 잔여분이므로 별도 합산 X?? 
                    // 보통 전체 경쟁률 = 총 접수 / 총 공급
                    rate: calcRate(supplyTotal, stageAgg.special.apply + stageAgg.rank1.apply + stageAgg.rank2.apply)
                }
            }
        }
    };
}

// ----------------------------------------------------------------------
// 메인 실행 로직
// ----------------------------------------------------------------------

async function main() {
    console.log('🚀 Cache Repair Script Started\n');

    // 1. 기존 캐시 로드
    if (!fs.existsSync(ARCHIVE_FILE)) {
        console.error('❌ Archive file not found:', ARCHIVE_FILE);
        process.exit(1);
    }
    const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));

    // items: archive.list (목록 배열)
    // stats: archive.calculatedStats (이미 계산된 통계 맵)
    const items = archive.lists || archive.list || [];
    const statsMap = archive.calculatedStats || {};

    console.log(`📋 Total Items in Archive: ${items.length}`);
    console.log(`📊 Existing Stats: ${Object.keys(statsMap).length}`);

    // 2. 누락된 아이템 식별
    const missingItems = [];

    for (const item of items) {
        // 공공/임대는 제외 (기존 로직 유지)
        const houseType = item.HOUSE_DTL_SECD_NM || "";
        if (houseType.includes("공공") || houseType.includes("임대")) {
            continue;
        }

        // 발표일이 지났는지 확인
        if (!isResultAnnounced(item.PRZWNER_PRESNATN_DE)) {
            continue;
        }

        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        // 통계가 아예 없거나, totals.stages 정보가 없는 경우 (불완전)
        const stat = statsMap[key];

        let shouldRepair = false;
        let reason = "";

        if (!stat || !stat.totals || !stat.totals.stages) {
            shouldRepair = true;
            reason = "No stats object";
        } else {
            // 구조는 있지만 내용이 비어있는 경우 확인
            // 특히 공급수는 있는데 접수건수가 0인 경우 (물론 진짜 0일수도 있지만, 과거 데이터 누락 가능성 높음)
            // 또는 상세 공급 정보(stages.rank1.target 등)가 0인 경우
            const supply = stat.totals.supplyTotal || 0;
            const request =
                (stat.totals.stages.special?.request || 0) +
                (stat.totals.stages.rank1?.request || 0) +
                (stat.totals.stages.rank2?.request || 0);

            // 1. 공급 총합이 0이면 무조건 재수집
            if (supply === 0) {
                shouldRepair = true;
                reason = "Zero supply";
            }
            // 2. 공급은 있는데 경쟁률 정보(접수)가 0인 경우 (보수적으로 200건만 샘플링하거나, 전체 다 하거나)
            // 여기서는 일단 모든 '0 접수' 건을 의심하지 않고, 최근 3년치(2023~) 중 접수가 0인 것을 타겟팅
            // (너무 옛날 것은 API에도 없을 수 있음)
            else if (request === 0 && item.RCRIT_PBLANC_DE >= '2023-01-01') {
                shouldRepair = true;
                reason = "Zero result (Recent)";
            }
        }

        if (shouldRepair) {
            // console.log(`   Targeting ${item.HOUSE_NM}: ${reason}`);
            missingItems.push(item);
        }
    }

    console.log(`⚠️  Found ${missingItems.length} items with missing/incomplete stats.`);

    if (missingItems.length === 0) {
        console.log('✅ Nothing to repair. Exiting.');
        return;
    }

    // 3. 누락된 아이템들에 대해 API 요청 및 통계 계산
    console.log('\n🛠️  Starting Repair Process...');
    let successCount = 0;

    // 최근 날짜부터 처리하기 위해 정렬 (선택 사항)
    missingItems.sort((a, b) => b.RCRIT_PBLANC_DE.localeCompare(a.RCRIT_PBLANC_DE));

    // [TEST LIST] 처음 5개만 먼저 처리해서 저장 테스트
    const targetItems = missingItems.slice(0, 5);

    for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        console.log(`[${i + 1}/${missingItems.length}] Repairing: ${item.HOUSE_NM} (${key})`);

        // 상세 정보 수집
        const detail = await fetchNoticeDetail(String(item.HOUSE_MANAGE_NO), String(item.PBLANC_NO));

        if (detail) {
            // 통계 계산
            const newStats = calculateStatsForItem(detail);
            if (newStats) {
                statsMap[key] = newStats;
                successCount++;
                // console.log(`   -> Stats updated. Total Supply: ${newStats.totals.supplyTotal}, Rate: ${newStats.totals.stages.total.rate}`);
            } else {
                console.warn(`   -> Failed to calculate stats (empty detail?)`);
            }
        }

        // API Rate Limit 방지 (약간의 딜레이)
        await new Promise(r => setTimeout(r, 200));

        // 중간 저장 (50개마다)
        if (successCount > 0 && successCount % 50 === 0) {
            console.log(`💾 Saving intermediate progress (${successCount} repaired)...`);
            archive.calculatedStats = statsMap;
            archive.metadata.lastRepairDate = new Date().toISOString();
            fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2), 'utf-8');
        }
    }

    console.log(`\n✅ Repaired ${successCount} items.`);

    // 4. 저장
    archive.calculatedStats = statsMap;
    archive.metadata.lastRepairDate = new Date().toISOString();
    archive.metadata.statsCount = Object.keys(statsMap).length;

    console.log('💾 Saving updated archive...');
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2), 'utf-8');
    console.log('🎉 Done!');
}

main();
