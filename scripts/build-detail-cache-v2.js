/**
 * 청약 상세 데이터 캐시 생성 스크립트 v2
 * 직접 공공데이터 API를 호출하여 캐시를 생성합니다.
 */

require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');

// API 키 확인
const API_KEY = process.env.REB_API_KEY;
if (!API_KEY) {
    console.error('❌ REB_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

const BASE_URLS = {
    detail: "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1",
    competition: "https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1"
};

// 설정
const DELAY_MS = 300;  // API 호출 간격 (ms)
const MAX_RETRIES = 2;
const TARGET_DATE = '20251231';  // 이 날짜 이전의 청약만 캐싱

// 유틸리티 함수
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toInt(value) {
    if (value === null || value === undefined) return 0;
    const raw = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9-]/g, ''));
    return Number.isFinite(raw) ? raw : 0;
}

function toFloat(value) {
    if (value === null || value === undefined) return 0;
    const raw = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(raw) ? raw : 0;
}

// API 호출 함수
async function fetchAPI(baseUrl, endpoint, houseManageNo, pblancNo, retries = 0) {
    const params = new URLSearchParams({
        serviceKey: API_KEY,
        returnType: 'json',
        page: '1',
        perPage: '100',
        'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo,
        'cond[PBLANC_NO::EQ]': pblancNo
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const json = await response.json();
        return json.data || json.body || [];
    } catch (error) {
        if (retries < MAX_RETRIES) {
            await sleep(1000);
            return fetchAPI(baseUrl, endpoint, houseManageNo, pblancNo, retries + 1);
        }
        return [];
    }
}

// 데이터 빌드 함수 (buildApplicationRows 간소화 버전)
function buildApplicationRows(models, competition, special) {
    if (!Array.isArray(models) || models.length === 0) {
        return { rows: [], totals: null, missingSpecialRequests: true };
    }

    // 경쟁률 데이터 집계
    const compMap = new Map();
    (competition || []).forEach(item => {
        const modelNo = String(item.MODEL_NO ?? item.HOUSE_TY ?? '').trim();
        if (!modelNo) return;

        const stageCode = toInt(item.SUBSCRPT_RANK_CODE);
        const region = String(item.RESIDE_SECD ?? '');
        const target = toInt(item.SUPLY_HSHLDCO);
        const request = toInt(item.REQ_CNT);

        const acc = compMap.get(modelNo) || {
            rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
            rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0
        };

        if (stageCode === 1) {
            if (acc.rank1Target === null && target > 0) acc.rank1Target = target;
            acc.rank1Requests += request;
            if (region === '01') acc.rank1Local += request;
            else if (region === '02') acc.rank1Etc += request;
        } else if (stageCode === 2) {
            if (acc.rank2Target === null && target > 0) acc.rank2Target = target;
            acc.rank2Requests += request;
            if (region === '01') acc.rank2Local += request;
            else if (region === '02') acc.rank2Etc += request;
        }

        compMap.set(modelNo, acc);
    });

    // 특별공급 데이터 집계
    const specialMap = new Map();
    (special || []).forEach(item => {
        const keys = [
            String(item.MODEL_NO ?? '').trim(),
            String(item.HOUSE_TY ?? '').trim()
        ].filter(k => k.length > 0);
        if (keys.length === 0) return;

        const instt = toInt(item.INSTT_RECOMEND_DCSN_CNT);
        const newlywed = toInt(item.CRSPAREA_MNYCH_CNT) + toInt(item.ETC_AREA_MNYCH_CNT) + toInt(item.CTPRVN_MNYCH_CNT);
        const life = toInt(item.CRSPAREA_LFE_FRST_CNT) + toInt(item.ETC_AREA_LFE_FRST_CNT) + toInt(item.CTPRVN_LFE_FRST_CNT);
        const multi = toInt(item.CRSPAREA_NWWDS_NMTW_CNT) + toInt(item.ETC_AREA_NWWDS_NMTW_CNT) + toInt(item.CTPRVN_NWWDS_NMTW_CNT);
        const oldParent = toInt(item.CRSPAREA_OPS_CNT) + toInt(item.ETC_AREA_OPS_CNT) + toInt(item.CTPRVN_OPS_CNT);
        const etc = toInt(item.CRSPAREA_NWBB_NWBBSHR_CNT) + toInt(item.ETC_AREA_NWBB_NWBBSHR_CNT) + toInt(item.CTPRVN_NWBB_NWBBSHR_CNT);
        const transfer = toInt(item.TRANSR_INSTT_ENFSN_CNT);
        const young = toInt(item.CRSPAREA_YGMN_CNT) + toInt(item.ETC_AREA_YGMN_CNT) + toInt(item.CTPRVN_YGMN_CNT);
        const total = instt + newlywed + life + multi + oldParent + etc + transfer + young;

        keys.forEach(key => {
            const acc = specialMap.get(key) || { total: 0, instt: 0, newlywed: 0, life: 0, multi: 0, oldParent: 0, etc: 0, transfer: 0, young: 0 };
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

    // 행 데이터 생성
    const rows = models.map(model => {
        const modelNo = String(model.MODEL_NO ?? model.HOUSE_TY ?? '').trim();
        if (!modelNo) return null;

        const houseType = String(model.HOUSE_TY ?? model.MODEL_NO ?? '-').trim();
        const areaSqmRaw = toFloat(model.SUPLY_AR);
        const areaSqm = areaSqmRaw > 0 ? areaSqmRaw : null;
        const areaPyeong = areaSqm ? areaSqm / 3.3058 : null;

        const specialSupply = toInt(model.SPSPLY_HSHLDCO);
        const generalSupply = toInt(model.SUPLY_HSHLDCO);
        const supplyTotal = specialSupply + generalSupply;
        const priceThousand = toInt(model.LTTOT_TOP_AMOUNT);

        const comp = compMap.get(modelNo) || {
            rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
            rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0
        };

        const rank1Target = comp.rank1Target ?? (generalSupply > 0 ? generalSupply : null);
        const rank2Target = comp.rank2Target ?? rank1Target;
        const totalTarget = rank1Target ?? rank2Target ?? (generalSupply > 0 ? generalSupply : null);
        const totalRequest = comp.rank1Requests + comp.rank2Requests;

        const specialAgg = specialMap.get(modelNo) || specialMap.get(houseType);
        const specialRequests = {
            '기관추천': specialAgg ? specialAgg.instt : null,
            '신혼부부': specialAgg ? specialAgg.newlywed : null,
            '생애최초': specialAgg ? specialAgg.life : null,
            '다자녀가구': specialAgg ? specialAgg.multi : null,
            '노부모부양': specialAgg ? specialAgg.oldParent : null,
            '기타': specialAgg ? specialAgg.etc : null,
            '이전기관': specialAgg ? specialAgg.transfer : null,
            '영구임대': specialAgg ? specialAgg.young : null
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
                    rate: specialSupply && specialRequestTotal !== null ? specialRequestTotal / specialSupply : (specialSupply ? 0 : null),
                    remaining: specialSupply !== null && specialRequestTotal !== null ? specialSupply - specialRequestTotal : null
                },
                rank1: {
                    target: rank1Target,
                    request: comp.rank1Requests || null,
                    rate: rank1Target && comp.rank1Requests ? comp.rank1Requests / rank1Target : (rank1Target ? 0 : null),
                    remaining: rank1Target !== null ? rank1Target - comp.rank1Requests : null,
                    localRequest: comp.rank1Local,
                    etcRequest: comp.rank1Etc
                },
                rank2: {
                    target: rank2Target,
                    request: comp.rank2Requests || null,
                    rate: rank2Target && comp.rank2Requests ? comp.rank2Requests / rank2Target : (rank2Target ? 0 : null),
                    remaining: rank2Target !== null ? rank2Target - comp.rank2Requests : null,
                    localRequest: comp.rank2Local,
                    etcRequest: comp.rank2Etc
                },
                total: {
                    target: totalTarget,
                    request: totalTarget !== null ? totalRequest : null,
                    rate: totalTarget && totalRequest ? totalRequest / totalTarget : (totalTarget ? 0 : null),
                    remaining: totalTarget !== null ? totalTarget - totalRequest : null
                }
            }
        };
    }).filter(Boolean);

    // 합계 계산
    let totals = null;
    if (rows.length > 0) {
        totals = rows.reduce((acc, row, idx) => {
            if (idx === 0) {
                return {
                    modelNo: 'TOTAL',
                    houseType: '합계',
                    areaSqm: null,
                    areaPyeong: null,
                    priceThousand: null,
                    supplyGeneral: row.supplyGeneral,
                    supplySpecial: row.supplySpecial,
                    supplyTotal: row.supplyTotal,
                    specialRequests: {},
                    stages: {
                        special: { target: row.stages.special.target || 0, request: row.stages.special.request || 0, rate: null, remaining: null },
                        rank1: { target: row.stages.rank1.target || 0, request: row.stages.rank1.request || 0, rate: null, remaining: null, localRequest: row.stages.rank1.localRequest || 0, etcRequest: row.stages.rank1.etcRequest || 0 },
                        rank2: { target: row.stages.rank2.target || 0, request: row.stages.rank2.request || 0, rate: null, remaining: null, localRequest: row.stages.rank2.localRequest || 0, etcRequest: row.stages.rank2.etcRequest || 0 },
                        total: { target: row.stages.total.target || 0, request: row.stages.total.request || 0, rate: null, remaining: null }
                    }
                };
            }
            if (!acc) return acc;

            acc.supplyGeneral += row.supplyGeneral;
            acc.supplySpecial += row.supplySpecial;
            acc.supplyTotal += row.supplyTotal;
            acc.stages.special.target = (acc.stages.special.target || 0) + (row.stages.special.target || 0);
            acc.stages.special.request = (acc.stages.special.request || 0) + (row.stages.special.request || 0);
            acc.stages.rank1.target = (acc.stages.rank1.target || 0) + (row.stages.rank1.target || 0);
            acc.stages.rank1.request = (acc.stages.rank1.request || 0) + (row.stages.rank1.request || 0);
            acc.stages.rank2.target = (acc.stages.rank2.target || 0) + (row.stages.rank2.target || 0);
            acc.stages.rank2.request = (acc.stages.rank2.request || 0) + (row.stages.rank2.request || 0);
            acc.stages.total.target = (acc.stages.total.target || 0) + (row.stages.total.target || 0);
            acc.stages.total.request = (acc.stages.total.request || 0) + (row.stages.total.request || 0);

            return acc;
        }, null);

        // 합계 경쟁률 계산
        if (totals) {
            ['special', 'rank1', 'rank2', 'total'].forEach(stage => {
                const s = totals.stages[stage];
                if (s.target && s.request !== null) {
                    s.rate = s.target > 0 ? s.request / s.target : null;
                    s.remaining = s.target - s.request;
                }
            });
        }
    }

    const missingSpecialRequests = special.length === 0;
    return { rows, totals, missingSpecialRequests };
}

// 데이터 유효성 검사
function isValidData(result) {
    if (!result || !result.rows || result.rows.length === 0) return false;
    return result.rows.some(row =>
        (row.stages?.rank1?.request && row.stages.rank1.request > 0) ||
        (row.stages?.rank2?.request && row.stages.rank2.request > 0) ||
        (row.stages?.special?.request && row.stages.special.request > 0)
    );
}

// 메인 함수
async function main() {
    console.log('🚀 캐시 생성 시작...\n');

    // 1. 기존 아카이브 로드
    const archivePath = path.join(__dirname, '../public/data/cheongyak-archive.json');
    const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
    const archive = archiveData.lists || [];
    console.log(`📦 아카이브 로드: ${archive.length}개 항목`);

    // 2. 타겟 필터링 (2025년 12월 31일 이전)
    const targetItems = archive.filter(item => {
        const noticeDate = item.RCRIT_PBLANC_DE;
        return noticeDate && noticeDate <= TARGET_DATE && item.HOUSE_MANAGE_NO && item.PBLANC_NO;
    });
    console.log(`🎯 대상 항목: ${targetItems.length}개 (공고일 ${TARGET_DATE} 이전)\n`);

    // 3. 캐시 생성
    const detailsCache = {};
    let successCount = 0;
    let validCount = 0;
    let errorCount = 0;

    const startTime = Date.now();

    for (let i = 0; i < targetItems.length; i++) {
        const item = targetItems[i];
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        const houseManageNo = String(item.HOUSE_MANAGE_NO);
        const pblancNo = String(item.PBLANC_NO);

        try {
            // 병렬 API 호출
            const [models, competition, special] = await Promise.all([
                fetchAPI(BASE_URLS.detail, 'getAPTLttotPblancMdl', houseManageNo, pblancNo),
                fetchAPI(BASE_URLS.competition, 'getAPTLttotPblancCmpet', houseManageNo, pblancNo),
                fetchAPI(BASE_URLS.competition, 'getAPTSpsplyReqstStus', houseManageNo, pblancNo)
            ]);

            const result = buildApplicationRows(models, competition, special);

            if (result.rows.length > 0) {
                detailsCache[key] = result;
                successCount++;

                if (isValidData(result)) {
                    validCount++;
                }
            }
        } catch (error) {
            errorCount++;
        }

        // 진행상황 출력
        if ((i + 1) % 50 === 0 || i === targetItems.length - 1) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const percent = ((i + 1) / targetItems.length * 100).toFixed(1);
            console.log(`📊 진행: ${i + 1}/${targetItems.length} (${percent}%) | 성공: ${successCount} | 유효: ${validCount} | 에러: ${errorCount} | 경과: ${elapsed}초`);
        }

        await sleep(DELAY_MS);
    }

    // 4. 캐시 파일 저장
    const outputPath = path.join(__dirname, '../public/data/cheongyak-details-cache.json');
    const cacheData = {
        metadata: {
            generatedAt: new Date().toISOString(),
            totalCount: Object.keys(detailsCache).length,
            validCount: validCount,
            dateRange: { start: '2020-01-01', end: '2025-12-31' }
        },
        details: detailsCache
    };

    fs.writeFileSync(outputPath, JSON.stringify(cacheData));
    const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);

    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ 캐시 생성 완료!');
    console.log(`${'='.repeat(60)}`);
    console.log(`📁 파일: ${outputPath}`);
    console.log(`📊 크기: ${fileSizeMB} MB`);
    console.log(`📊 전체 항목: ${Object.keys(detailsCache).length}개`);
    console.log(`📊 유효 데이터: ${validCount}개 (${(validCount / Object.keys(detailsCache).length * 100).toFixed(1)}%)`);
    console.log(`📊 소요 시간: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)}분`);
}

main().catch(console.error);
