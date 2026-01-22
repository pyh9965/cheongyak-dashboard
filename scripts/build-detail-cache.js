/**
 * 청약 타입별 상세 데이터 캐시 생성 스크립트
 * 
 * 2020년~2025년까지의 모든 청약 데이터를 수집하여
 * cheongyak-details-cache.json 파일 생성
 */

// .env 파일 로드
require('dotenv').config({ path: '.env' });

const fs = require('fs').promises;
const path = require('path');

// API 호출 함수 (Next.js API 라우트 사용)
async function fetchFromAPI(dataset, params = {}) {
    const baseUrl = 'http://localhost:3000/api/cheongyak';

    const queryParams = new URLSearchParams({
        dataset,
        perPage: '100',
        ...params
    });

    const url = `${baseUrl}?${queryParams.toString()}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();

        // 에러 체크
        if (json.errors && Object.keys(json.errors).length > 0) {
            const errorMsg = Object.values(json.errors)[0];
            throw new Error(`API 에러: ${errorMsg}`);
        }

        // 데이터 추출
        const data = json.datasets?.[dataset] || [];
        return data;
    } catch (error) {
        console.error(`[API ERROR] ${dataset}:`, error.message);
        throw error;
    }
}

// buildApplicationRows 함수 (detail-data.ts에서 복사)
function normalizeModelNo(modelNo) {
    if (modelNo === null || modelNo === undefined) return "";
    let str = String(modelNo).trim().toUpperCase();
    if (/^0+[1-9]/.test(str)) {
        str = str.replace(/^0+/, "");
    }
    return str;
}

function toInt(value) {
    if (value === null || value === undefined || value === '') return 0;
    const num = parseInt(String(value).replace(/,/g, ''), 10);
    return isNaN(num) ? 0 : num;
}

function toFloat(value) {
    if (value === null || value === undefined || value === '') return 0;
    const num = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
}

function buildApplicationRows(models, competition, special) {
    // 경쟁률 데이터 집계
    const compMap = new Map();

    competition.forEach((item) => {
        const rawModelNo = String(item.MODEL_NO ?? item.HOUSE_TY ?? "").trim();
        const modelNo = normalizeModelNo(rawModelNo);
        if (!modelNo) return;

        const stageCode = toInt(item.SUBSCRPT_RANK_CODE);
        const region = String(item.RESIDE_SECD ?? "");
        const target = toInt(item.SUPLY_HSHLDCO);
        const request = toInt(item.REQ_CNT);

        const acc = compMap.get(modelNo) ?? {
            rank1Target: null,
            rank1Requests: 0,
            rank1Local: 0,
            rank1Etc: 0,
            rank2Target: null,
            rank2Requests: 0,
            rank2Local: 0,
            rank2Etc: 0,
        };

        if (stageCode === 1) {
            if (acc.rank1Target === null && target > 0) acc.rank1Target = target;
            acc.rank1Requests += request;
            if (region === "01") acc.rank1Local += request;
            else if (region === "02") acc.rank1Etc += request;
        } else if (stageCode === 2) {
            if (acc.rank2Target === null && target > 0) acc.rank2Target = target;
            acc.rank2Requests += request;
            if (region === "01") acc.rank2Local += request;
            else if (region === "02") acc.rank2Etc += request;
        }

        compMap.set(modelNo, acc);
    });

    // 특별공급 데이터 집계
    const specialMap = new Map();

    special.forEach((item) => {
        const keys = [
            normalizeModelNo(item.MODEL_NO),
            normalizeModelNo(item.HOUSE_TY)
        ].filter((key) => key.length > 0);
        if (keys.length === 0) return;

        const instt = toInt(item.INSTT_RECOMEND_DCSN_CNT);
        const newlywed =
            toInt(item.CRSPAREA_MNYCH_CNT) +
            toInt(item.ETC_AREA_MNYCH_CNT) +
            toInt(item.CTPRVN_MNYCH_CNT);
        const life =
            toInt(item.CRSPAREA_LFE_FRST_CNT) +
            toInt(item.ETC_AREA_LFE_FRST_CNT) +
            toInt(item.CTPRVN_LFE_FRST_CNT);
        const multi =
            toInt(item.CRSPAREA_NWWDS_NMTW_CNT) +
            toInt(item.ETC_AREA_NWWDS_NMTW_CNT) +
            toInt(item.CTPRVN_NWWDS_NMTW_CNT);
        const oldParent =
            toInt(item.CRSPAREA_OPS_CNT) +
            toInt(item.ETC_AREA_OPS_CNT) +
            toInt(item.CTPRVN_OPS_CNT);
        const etc =
            toInt(item.CRSPAREA_NWBB_NWBBSHR_CNT) +
            toInt(item.ETC_AREA_NWBB_NWBBSHR_CNT) +
            toInt(item.CTPRVN_NWBB_NWBBSHR_CNT);
        const transfer = toInt(item.TRANSR_INSTT_ENFSN_CNT);
        const young =
            toInt(item.CRSPAREA_YGMN_CNT) +
            toInt(item.ETC_AREA_YGMN_CNT) +
            toInt(item.CTPRVN_YGMN_CNT);
        const total = instt + newlywed + life + multi + oldParent + etc + transfer + young;

        keys.forEach((key) => {
            if (!key) return;
            const acc = specialMap.get(key) ?? {
                total: 0, instt: 0, newlywed: 0, life: 0,
                multi: 0, oldParent: 0, etc: 0, transfer: 0, young: 0,
            };

            acc.instt += instt;
            acc.newlywed += newlywed;
            acc.life += life;
            acc.multi += multi;
            acc.oldParent += oldParent;
            acc.etc += etc;
            acc.transfer += transfer;
            acc.young += young;
            acc.total += total;

            specialMap.set(key, acc);
        });
    });

    // 모델 데이터 기반 행 생성
    const rows = models
        .map((model) => {
            const rawModelNo = String(model.MODEL_NO ?? model.HOUSE_TY ?? "").trim();
            const modelNo = normalizeModelNo(rawModelNo);
            if (!modelNo) return null;

            const houseType = String(model.HOUSE_TY ?? model.MODEL_NO ?? "-").trim();
            const normHouseType = normalizeModelNo(houseType);

            const areaSqmRaw = toFloat(model.SUPLY_AR);
            const areaSqm = areaSqmRaw > 0 ? areaSqmRaw : null;
            const areaPyeong = areaSqm ? areaSqm / 3.3058 : null;

            const specialSupply = toInt(model.SPSPLY_HSHLDCO);
            const generalSupply = toInt(model.SUPLY_HSHLDCO);
            const supplyTotal = specialSupply + generalSupply;

            const priceThousand = toInt(model.LTTOT_TOP_AMOUNT);

            const comp = compMap.get(modelNo) ?? {
                rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
                rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0,
            };

            const rank1Target = comp.rank1Target
                ?? (generalSupply > 0 ? generalSupply : null)
                ?? (supplyTotal > 0 ? supplyTotal : null);

            const rank2Target = comp.rank2Target ?? rank1Target;
            const totalTarget = rank1Target ?? rank2Target ?? (generalSupply > 0 ? generalSupply : null);
            const totalRequest = comp.rank1Requests + comp.rank2Requests;

            const specialAgg = specialMap.get(modelNo) ?? specialMap.get(normHouseType);
            const specialRequests = {
                기관추천: specialAgg ? specialAgg.instt : null,
                신혼부부: specialAgg ? specialAgg.newlywed : null,
                생애최초: specialAgg ? specialAgg.life : null,
                다자녀가구: specialAgg ? specialAgg.multi : null,
                노부모부양: specialAgg ? specialAgg.oldParent : null,
                기타: specialAgg ? specialAgg.etc : null,
                이전기관: specialAgg ? specialAgg.transfer : null,
                영구임대: specialAgg ? specialAgg.young : null,
            };
            const specialRequestTotal = specialAgg ? specialAgg.total : null;

            return {
                modelNo,
                houseType,
                areaSqm,
                areaPyeong,
                priceThousand: priceThousand > 0 ? priceThousand : null,
                supplyGeneral: generalSupply,
                supplySpecial: specialSupply,
                supplyTotal,
                specialRequests,
                stages: {
                    special: {
                        target: specialSupply > 0 ? specialSupply : null,
                        request: specialRequestTotal,
                        rate: specialSupply && specialRequestTotal !== null
                            ? specialRequestTotal / specialSupply
                            : specialSupply ? 0 : null,
                        remaining: specialSupply !== null && specialRequestTotal !== null
                            ? specialSupply - specialRequestTotal
                            : null,
                    },
                    rank1: {
                        target: rank1Target,
                        request: comp.rank1Requests ?? null,
                        rate: rank1Target && comp.rank1Requests
                            ? comp.rank1Requests / rank1Target
                            : rank1Target ? 0 : null,
                        remaining: rank1Target !== null
                            ? rank1Target - comp.rank1Requests
                            : null,
                        localRequest: comp.rank1Local,
                        etcRequest: comp.rank1Etc,
                    },
                    rank2: {
                        target: rank2Target,
                        request: comp.rank2Requests ?? null,
                        rate: rank2Target && comp.rank2Requests
                            ? comp.rank2Requests / rank2Target
                            : rank2Target ? 0 : null,
                        remaining: rank2Target !== null
                            ? rank2Target - comp.rank2Requests
                            : null,
                        localRequest: comp.rank2Local,
                        etcRequest: comp.rank2Etc,
                    },
                    total: {
                        target: totalTarget,
                        request: totalTarget !== null ? totalRequest : null,
                        rate: totalTarget && totalRequest
                            ? totalRequest / totalTarget
                            : totalTarget ? 0 : null,
                        remaining: totalTarget !== null
                            ? totalTarget - totalRequest
                            : null,
                    },
                },
            };
        })
        .filter((value) => value !== null);

    // 합계 계산 (간략화)
    const totals = rows.length > 0 ? {
        modelNo: "TOTAL",
        houseType: "합계",
        areaSqm: null,
        areaPyeong: null,
        priceThousand: null,
        supplyGeneral: rows.reduce((sum, r) => sum + r.supplyGeneral, 0),
        supplySpecial: rows.reduce((sum, r) => sum + r.supplySpecial, 0),
        supplyTotal: rows.reduce((sum, r) => sum + r.supplyTotal, 0),
        specialRequests: {},
        stages: {
            special: {
                target: rows.reduce((sum, r) => sum + (r.stages.special.target ?? 0), 0),
                request: rows.reduce((sum, r) => sum + (r.stages.special.request ?? 0), 0),
                rate: null,
                remaining: null,
            },
            rank1: {
                target: rows.reduce((sum, r) => sum + (r.stages.rank1.target ?? 0), 0),
                request: rows.reduce((sum, r) => sum + (r.stages.rank1.request ?? 0), 0),
                rate: null,
                remaining: null,
            },
            rank2: {
                target: rows.reduce((sum, r) => sum + (r.stages.rank2.target ?? 0), 0),
                request: rows.reduce((sum, r) => sum + (r.stages.rank2.request ?? 0), 0),
                rate: null,
                remaining: null,
            },
            total: {
                target: rows.reduce((sum, r) => sum + (r.stages.total.target ?? 0), 0),
                request: rows.reduce((sum, r) => sum + (r.stages.total.request ?? 0), 0),
                rate: null,
                remaining: null,
            },
        },
    } : null;

    const missingSpecialRequests = special.length === 0;

    return { rows, missingSpecialRequests, totals };
}

// 청약 상세 데이터 수집
async function fetchDetailData(houseManageNo, pblancNo) {
    try {
        const params = {
            houseManageNo,
            pblancNo
        };

        const [models, competition, special] = await Promise.all([
            fetchFromAPI('noticeModel', params),
            fetchFromAPI('noticeCompetition', params),
            fetchFromAPI('noticeSpecial', params),
        ]);

        const result = buildApplicationRows(models, competition, special);

        return result;
    } catch (error) {
        console.error(`[ERROR] ${houseManageNo}_${pblancNo}: ${error.message}`);
        return null;
    }
}

// 메인 함수
async function main() {
    console.log('='.repeat(60));
    console.log('청약 타입별 상세 데이터 캐시 생성 시작');
    console.log('='.repeat(60));

    // 1. 기존 archive 캐시 로드
    const archivePath = path.join(__dirname, '../public/data/cheongyak-archive.json');
    const archiveData = JSON.parse(await fs.readFile(archivePath, 'utf-8'));

    console.log(`\n[1] 기존 캐시 로드 완료: ${archiveData.lists.length}건`);

    // 2. 2025년 이전 데이터 필터링
    const targetItems = archiveData.lists.filter(item => {
        const date = item.RCRIT_PBLANC_DE || '';
        return date <= '20251231';
    });

    console.log(`[2] 2025년 이전 데이터: ${targetItems.length}건`);

    // 3. 상세 데이터 수집
    const detailsCache = {};
    let successCount = 0;
    let failCount = 0;

    console.log('\n[3] 상세 데이터 수집 시작...\n');

    for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        console.log(`[${i + 1}/${targetItems.length}] ${item.HOUSE_NM}`);

        const detailData = await fetchDetailData(item.HOUSE_MANAGE_NO, item.PBLANC_NO);

        if (detailData) {
            detailsCache[key] = detailData;
            successCount++;
        } else {
            failCount++;
        }

        // API 호출 제한 (0.5초 대기)
        if (i < targetItems.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log('\n[4] 수집 완료');
    console.log(`  성공: ${successCount}건`);
    console.log(`  실패: ${failCount}건`);

    // 4. JSON 파일 저장
    const outputPath = path.join(__dirname, '../public/data/cheongyak-details-cache.json');

    const cacheData = {
        metadata: {
            generatedAt: new Date().toISOString(),
            totalCount: successCount,
            dateRange: {
                start: '2020-01-01',
                end: '2025-12-31',
            },
        },
        details: detailsCache,
    };

    await fs.writeFile(outputPath, JSON.stringify(cacheData, null, 2), 'utf-8');

    const stats = await fs.stat(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\n[5] 캐시 파일 생성 완료`);
    console.log(`  경로: ${outputPath}`);
    console.log(`  크기: ${sizeMB} MB`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ 캐시 생성 완료!');
    console.log('='.repeat(60));
}

// 실행
main().catch(console.error);
