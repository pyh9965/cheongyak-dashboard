/**
 * 프로그램 시작 시 자동 캐시 업데이트 스크립트
 * 
 * - 기존 캐시의 마지막 모집공고일 확인
 * - API에서 새 공고 조회
 * - 경쟁률 및 특별공급 데이터 수집
 * - 캐시에 병합하여 저장
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REB_API_KEY;
const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

const DATA_DIR = path.join(__dirname, '../public/data');
const CACHE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');

// 날짜 파싱 유틸리티
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

// 당첨자 발표일이 지났는지 확인
function isResultAnnounced(przwnerPresnatnDe) {
    if (!przwnerPresnatnDe) return false;
    const announceDate = parseDate(przwnerPresnatnDe);
    if (!announceDate) return false;
    return announceDate < new Date();
}

// 접수 종료일이 지났는지 확인 (경쟁률 데이터 수집용)
function isApplicationClosed(item) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 오늘 00:00:00

    // 2순위 접수 종료일 확인
    const rank2End = item.GNRL_RNK2_ETC_AREA_ENDDE || item.GNRL_RNK2_CRSPAREA_ENDDE || item.RCEPT_ENDDE;
    if (rank2End) {
        const endDate = parseDate(rank2End);
        if (endDate && endDate <= today) {
            return true; // 2순위 접수 종료 (당일도 포함)
        }
    }

    // 1순위 접수 종료일 확인
    const rank1End = item.GNRL_RNK1_ETC_AREA_ENDDE || item.GNRL_RNK1_CRSPAREA_ENDDE || item.RCEPT_ENDDE;
    if (rank1End) {
        const endDate = parseDate(rank1End);
        if (endDate && endDate <= today) {
            return true; // 1순위 접수 종료 (2순위 데이터는 없을 수 있음)
        }
    }

    return false;
}

// API 호출 헬퍼
async function fetchApi(baseUrl, endpoint, params = {}) {
    const url = new URL(`${baseUrl}/${endpoint}`);
    url.searchParams.set('serviceKey', API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
    }
    return response.json();
}

// 기존 캐시 로드
function loadExistingCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        console.log('⚠️ 기존 캐시 파일 없음 - 새로 생성합니다.');
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (error) {
        console.error('❌ 캐시 파일 읽기 실패:', error.message);
        return null;
    }
}

// 캐시에서 마지막 모집공고일 확인
function getLastAnnouncementDate(cache) {
    if (!cache || !cache.lists || cache.lists.length === 0) {
        return '2020-01-01'; // 기본값
    }

    let latestDate = '2020-01-01';
    cache.lists.forEach(item => {
        const date = item.RCRIT_PBLANC_DE || '';
        if (date > latestDate) {
            latestDate = date;
        }
    });

    return latestDate;
}

// 새 공고 조회
async function fetchNewAnnouncements(afterDate) {
    console.log(`📡 ${afterDate} 이후 새 공고 조회 중...`);

    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
        const data = await fetchApi(DETAIL_BASE, 'getAPTLttotPblancDetail', {
            page,
            perPage: 100,
            [`cond[RCRIT_PBLANC_DE::GT]`]: afterDate.replace(/-/g, '')
        });

        if (!data.data || data.data.length === 0) {
            hasMore = false;
        } else {
            // 공공분양/임대 제외
            const filtered = data.data.filter(item => {
                const houseType = item.HOUSE_DTL_SECD_NM || '';
                const houseName = item.HOUSE_NM || '';
                return !houseType.includes('공공') &&
                    !houseType.includes('임대') &&
                    !houseName.includes('공공') &&
                    !houseName.includes('신혼희망');
            });

            allItems.push(...filtered);
            page++;

            if (data.data.length < 100) hasMore = false;

            // API 부하 방지
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return allItems;
}

// Helper functions (ported from detail-utils.ts and detail-data.ts)
function toInt(value) {
    if (!value) return 0;
    const num = Number(String(value).replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
}

function toFloat(value) {
    if (!value) return 0;
    const num = parseFloat(String(value).replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
}

function normalizeModelNo(modelNo) {
    if (modelNo === null || modelNo === undefined) return "";
    let str = String(modelNo).trim().toUpperCase();
    if (/^0+[1-9]/.test(str)) {
        str = str.replace(/^0+/, "");
    }
    return str;
}

function parseHouseTypeKey(houseType) {
    const cleanType = String(houseType).trim();
    if (!cleanType) return { raw: "", numeric: 0, suffix: "", base: 0 };

    const match = cleanType.match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/);
    if (match) {
        const numericPart = parseFloat(match[1]);
        const suffixPart = match[2] || "";
        return {
            raw: cleanType,
            numeric: numericPart,
            suffix: suffixPart,
            base: Math.floor(numericPart)
        };
    }
    return { raw: cleanType, numeric: 0, suffix: "", base: 0 };
}

// Logic to build application rows (ported from buildApplicationRows in detail-data.ts)
function buildApplicationRows(models, competition, special) {
    // 1. Competition Data Aggregation
    const compMap = new Map();

    competition.forEach((item) => {
        const rawModelNo = String(item.MODEL_NO || item.HOUSE_TY || "").trim();
        const modelNo = normalizeModelNo(rawModelNo);
        if (!modelNo) return;

        const stageCode = toInt(item.SUBSCRPT_RANK_CODE);
        const region = String(item.RESIDE_SECD || "");
        const target = toInt(item.SUPLY_HSHLDCO);
        const request = toInt(item.REQ_CNT);

        const acc = compMap.get(modelNo) || {
            rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
            rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0,
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

    // 2. Special Supply Data Aggregation
    const specialMap = new Map();

    special.forEach((item) => {
        const keys = [
            normalizeModelNo(item.MODEL_NO),
            normalizeModelNo(item.HOUSE_TY)
        ].filter((key) => key.length > 0);
        if (keys.length === 0) return;

        const instt = toInt(item.INSTT_RECOMEND_DCSN_CNT) + toInt(item.INSTT_RECOMEND_PREPAR_CNT);
        const newlywed = toInt(item.CRSPAREA_MNYCH_CNT) + toInt(item.ETC_AREA_MNYCH_CNT) + toInt(item.CTPRVN_MNYCH_CNT);
        const life = toInt(item.CRSPAREA_LFE_FRST_CNT) + toInt(item.ETC_AREA_LFE_FRST_CNT) + toInt(item.CTPRVN_LFE_FRST_CNT);
        const multi = toInt(item.CRSPAREA_NWWDS_NMTW_CNT) + toInt(item.ETC_AREA_NWWDS_NMTW_CNT) + toInt(item.CTPRVN_NWWDS_NMTW_CNT);
        const oldParent = toInt(item.CRSPAREA_OPS_CNT) + toInt(item.ETC_AREA_OPS_CNT) + toInt(item.CTPRVN_OPS_CNT);
        const etc = toInt(item.CRSPAREA_NWBB_NWBBSHR_CNT) + toInt(item.ETC_AREA_NWBB_NWBBSHR_CNT) + toInt(item.CTPRVN_NWBB_NWBBSHR_CNT);
        const transfer = toInt(item.TRANSR_INSTT_ENFSN_CNT);
        const young = toInt(item.CRSPAREA_YGMN_CNT) + toInt(item.ETC_AREA_YGMN_CNT) + toInt(item.CTPRVN_YGMN_CNT);
        const total = instt + newlywed + life + multi + oldParent + etc + transfer + young;

        keys.forEach((key) => {
            if (!key) return;
            const acc = specialMap.get(key) || {
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

    // 3. Application Rows Construction
    const rows = models
        .map((model) => {
            const rawModelNo = String(model.MODEL_NO || model.HOUSE_TY || "").trim();
            const modelNo = normalizeModelNo(rawModelNo);
            if (!modelNo) return null;

            const houseType = String(model.HOUSE_TY || model.MODEL_NO || "-").trim();
            const normHouseType = normalizeModelNo(houseType);

            const areaSqmRaw = toFloat(model.SUPLY_AR);
            const areaSqm = areaSqmRaw > 0 ? areaSqmRaw : null;
            const areaPyeong = areaSqm ? areaSqm / 3.3058 : null;

            const specialSupply = toInt(model.SPSPLY_HSHLDCO);
            const generalSupply = toInt(model.SUPLY_HSHLDCO);
            const supplyTotal = specialSupply + generalSupply;

            const priceThousand = toInt(model.LTTOT_TOP_AMOUNT);

            const comp = compMap.get(modelNo) || {
                rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0,
                rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0,
            };

            const rank1Target = comp.rank1Target
                ?? (generalSupply > 0 ? generalSupply : null)
                ?? (supplyTotal > 0 ? supplyTotal : null);

            const rank2Target = comp.rank2Target || rank1Target;
            const totalTarget = rank1Target || rank2Target || (generalSupply > 0 ? generalSupply : null);
            const totalRequest = comp.rank1Requests + comp.rank2Requests;

            const specialBreakdown = {
                기관추천: toInt(model.INSTT_RECOMEND_HSHLDCO),
                "신혼부부": toInt(model.MNYCH_HSHLDCO),
                "생애최초": toInt(model.LFE_FRST_HSHLDCO),
                "다자녀": toInt(model.NWWDS_HSHLDCO),
                "노부모부양": toInt(model.OLD_PARNTS_SUPORT_HSHLDCO),
                "기타": toInt(model.ETC_HSHLDCO),
            };

            const specialAgg = specialMap.get(modelNo) || specialMap.get(normHouseType);
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
                            : (specialSupply ? 0 : null),
                        remaining: specialSupply !== null && specialRequestTotal !== null
                            ? specialSupply - specialRequestTotal
                            : null,
                        breakdown: specialBreakdown,
                    },
                    rank1: {
                        target: rank1Target,
                        request: comp.rank1Requests || null,
                        rate: rank1Target && comp.rank1Requests
                            ? comp.rank1Requests / rank1Target
                            : (rank1Target ? 0 : null),
                        remaining: rank1Target !== null
                            ? rank1Target - comp.rank1Requests
                            : null,
                        localRequest: comp.rank1Local,
                        etcRequest: comp.rank1Etc,
                    },
                    rank2: {
                        target: rank2Target,
                        request: comp.rank2Requests || null,
                        rate: rank2Target && comp.rank2Requests
                            ? comp.rank2Requests / rank2Target
                            : (rank2Target ? 0 : null),
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
                            : (totalTarget ? 0 : null),
                        remaining: totalTarget !== null
                            ? totalTarget - totalRequest
                            : null,
                    },
                },
            };
        })
        .filter(value => value !== null)
        .sort((a, b) => {
            const aKey = parseHouseTypeKey(a.houseType);
            const bKey = parseHouseTypeKey(b.houseType);
            if (aKey.base !== null && bKey.base !== null && aKey.base !== bKey.base) return aKey.base - bKey.base;
            if (aKey.suffix && bKey.suffix && aKey.suffix !== bKey.suffix) return aKey.suffix.localeCompare(bKey.suffix, "en", { sensitivity: "base" });
            if (aKey.numeric !== null && bKey.numeric !== null && aKey.numeric !== bKey.numeric) return aKey.numeric - bKey.numeric;
            return aKey.raw.localeCompare(bKey.raw, "en", { numeric: true, sensitivity: "base" });
        });

    // 4. Totals Calculation
    const totals = rows.reduce((acc, row, index) => {
        if (index === 0) {
            return {
                modelNo: "TOTAL",
                houseType: "합계",
                areaSqm: null,
                areaPyeong: null,
                priceThousand: null,
                supplyGeneral: row.supplyGeneral,
                supplySpecial: row.supplySpecial,
                supplyTotal: row.supplyTotal,
                specialRequests: { ...row.specialRequests },
                stages: JSON.parse(JSON.stringify(row.stages)) // Deep copy
            };
        }

        if (!acc) return acc;

        acc.supplyGeneral += row.supplyGeneral;
        acc.supplySpecial += row.supplySpecial;
        acc.supplyTotal += row.supplyTotal;

        Object.keys(row.specialRequests).forEach(key => {
            acc.specialRequests[key] = (acc.specialRequests[key] || 0) + (row.specialRequests[key] || 0);
        });

        const mergeStage = (stageName) => {
            // target, request, localRequest, etcRequest 합산
            const accStage = acc.stages[stageName];
            const rowStage = row.stages[stageName];

            accStage.target = (accStage.target || 0) + (rowStage.target || 0);
            accStage.request = (accStage.request || 0) + (rowStage.request || 0);
            if (accStage.localRequest !== undefined) accStage.localRequest = (accStage.localRequest || 0) + (rowStage.localRequest || 0);
            if (accStage.etcRequest !== undefined) accStage.etcRequest = (accStage.etcRequest || 0) + (rowStage.etcRequest || 0);
        };

        mergeStage("special");
        mergeStage("rank1");
        mergeStage("rank2");
        mergeStage("total");

        return acc;
    }, null);

    // 4.1 Fix Shared Targets (if total is repeated across rows)
    if (totals && rows.length > 1) {
        const checkAndFixSharedTarget = (stage, stageName) => {
            if (!stage.target) return;
            const targets = rows.map(r => r.stages[stageName].target).filter(t => t !== null);
            if (targets.length === rows.length && targets.every(t => t === targets[0])) {
                stage.target = targets[0];
            }
        };

        checkAndFixSharedTarget(totals.stages.special, "special");
        checkAndFixSharedTarget(totals.stages.rank1, "rank1");
        checkAndFixSharedTarget(totals.stages.rank2, "rank2");
        checkAndFixSharedTarget(totals.stages.total, "total");
    }

    // 5. Fill Rates for Totals
    if (totals) {
        const fillRate = (stage) => {
            if (stage.target && stage.request !== null) {
                stage.rate = stage.target > 0 ? stage.request / stage.target : null;
                stage.remaining = stage.target - stage.request;
            } else {
                stage.rate = null;
                stage.remaining = null;
            }
        };
        fillRate(totals.stages.special);
        fillRate(totals.stages.rank1);
        fillRate(totals.stages.rank2);
        fillRate(totals.stages.total);
    }

    return { rows, missingSpecialRequests: special.length === 0, totals };
}

// Special Supply & Competition Fetching
async function fetchDetailsForItem(item) {
    const houseManageNo = item.HOUSE_MANAGE_NO;
    const pblancNo = item.PBLANC_NO;

    if (!houseManageNo || !pblancNo) return null;
    // 접수 종료 여부로 확인 (당첨자 발표 전에도 경쟁률 데이터 수집 가능)
    if (!isApplicationClosed(item)) return null;

    try {
        // Fetch all necessary datasets
        const [competData, specialData, modelData] = await Promise.all([
            fetchApi(COMPET_BASE, 'getAPTLttotPblancCmpet', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
            fetchApi(COMPET_BASE, 'getAPTSpsplyReqstStus', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo }),
            fetchApi(DETAIL_BASE, 'getAPTLttotPblancMdl', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': houseManageNo, 'cond[PBLANC_NO::EQ]': pblancNo })
        ]);

        const competRows = competData.data || [];
        const specialRows = specialData.data || [];
        const modelRows = modelData.data || [];

        // Build detailed rows
        const result = buildApplicationRows(modelRows, competRows, specialRows);

        // Save detailed JSON file
        const detailDir = path.join(DATA_DIR, 'details');
        if (!fs.existsSync(detailDir)) {
            fs.mkdirSync(detailDir, { recursive: true });
        }

        const detailFile = path.join(detailDir, `${houseManageNo}_${pblancNo}.json`);
        fs.writeFileSync(detailFile, JSON.stringify(result, null, 2));

        // Return summary for main cache
        const totals = result.totals || { stages: { special: {}, rank1: {}, rank2: {}, total: {} } };
        return {
            totals: {
                supplyTotal: totals.supplyTotal || 0,
                stages: {
                    special: {
                        request: totals.stages.special.request,
                        rate: totals.stages.special.rate
                    },
                    rank1: {
                        request: totals.stages.rank1.request,
                        rate: totals.stages.rank1.rate
                    },
                    rank2: {
                        request: totals.stages.rank2.request,
                        rate: totals.stages.rank2.rate
                    },
                    total: {
                        request: totals.stages.total.request,
                        rate: totals.stages.total.rate
                    }
                }
            }
        };

    } catch (error) {
        console.error(`  ⚠️ ${item.HOUSE_NM} 상세 조회 실패:`, error.message);
        return null;
    }
}

// 캐시 저장
function saveCache(data) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');

    const stats = fs.statSync(CACHE_FILE);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`💾 메인 캐시 저장 완료: ${sizeMB}MB`);
}

// 메인 함수
async function main() {
    console.log('🚀 청약경쟁률 대시보드 - 정적 캐시 생성 시스템');
    console.log('='.repeat(50));

    if (!API_KEY) {
        console.error('❌ REB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
        process.exit(1);
    }

    // 1. 기존 캐시 로드
    const existingCache = loadExistingCache();
    const lastDate = getLastAnnouncementDate(existingCache);
    console.log(`📅 마지막 캐시 공고일: ${lastDate}`);

    // 2. 새 공고 조회
    const newItems = await fetchNewAnnouncements(lastDate);

    // *중요* 기존 항목 중 상세 파일이 없는 경우도 처리하기 위해
    // 이번 업데이트에서는 "새 항목" + "최근 30일 항목"을 체크하도록 로직 개선이 필요할 수 있으나
    // 우선 "새 공고"에 집중합니다.

    if (newItems.length === 0) {
        console.log('✅ 새로운 공고가 없습니다.');
        // 하지만 상세 파일 생성을 위해 최근 항목들을 다시 체크할 수 있습니다.
        // 여기서는 일단 종료
        // process.exit(0);
    } else {
        console.log(`📋 새 공고 ${newItems.length}건 발견`);
    }

    // 3. 상세 데이터 수집 (결과 발표된 것만)
    // 기존 캐시에 있는 항목 중에서도 상세 JSON이 없는 경우를 대비해
    // 최근 100개 항목에 대해 상세 파일 존재 여부를 체크하고 없으면 생성
    const allCandidates = [...newItems];
    if (existingCache && existingCache.lists) {
        // 최근 것부터 역순으로 50개 추가 검사
        allCandidates.push(...existingCache.lists.slice(-50));
    }

    // 중복 제거
    const uniqueCandidates = Array.from(new Map(allCandidates.map(item => [`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`, item])).values());

    const targetItems = uniqueCandidates.filter(item => {
        // 접수 종료일 기준으로 변경 (경쟁률은 접수 후 바로 확인 가능)
        if (!isApplicationClosed(item)) return false;

        // 상세 파일 존재 여부 확인
        const detailPath = path.join(DATA_DIR, 'details', `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}.json`);
        if (fs.existsSync(detailPath)) return false; // 이미 있으면 패스 (속도 최적화)

        return true;
    });

    console.log(`📊 상세 데이터 생성 대상: ${targetItems.length}건`);

    const newCalculatedStats = {};

    // 5개씩 병렬 처리
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetItems.length; i += BATCH_SIZE) {
        const batch = targetItems.slice(i, i + BATCH_SIZE);
        const promises = batch.map(item => fetchDetailsForItem(item));

        const results = await Promise.all(promises);

        results.forEach((res, idx) => {
            if (res) {
                const item = batch[idx];
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                newCalculatedStats[key] = res;
            }
        });

        console.log(`  진행: ${Math.min(i + BATCH_SIZE, targetItems.length)}/${targetItems.length}`);
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate Limit buffer
    }

    // 4. 캐시 병합 (새로운 항목만)
    if (newItems.length > 0) {
        const existingIds = new Set((existingCache?.lists || []).map(item => `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));
        const uniqueNewItems = newItems.filter(item => !existingIds.has(`${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`));

        const updatedCache = {
            lists: [...(existingCache?.lists || []), ...uniqueNewItems],
            calculatedStats: {
                ...(existingCache?.calculatedStats || {}),
                ...newCalculatedStats
            },
            metadata: {
                generatedAt: new Date().toISOString(),
                totalCount: (existingCache?.lists?.length || 0) + uniqueNewItems.length,
                statsCount: Object.keys({
                    ...(existingCache?.calculatedStats || {}),
                    ...newCalculatedStats
                }).length,
                dateRange: {
                    start: existingCache?.metadata?.dateRange?.start || '2020-01-01',
                    end: uniqueNewItems.length > 0
                        ? uniqueNewItems[uniqueNewItems.length - 1].RCRIT_PBLANC_DE
                        : existingCache?.metadata?.dateRange?.end
                }
            }
        };
        saveCache(updatedCache);
    } else if (Object.keys(newCalculatedStats).length > 0) {
        // 새 항목은 없지만 기존 항목의 통계가 업데이트된 경우 (상세 파일 생성 등)
        // calculatedStats만 업데이트
        const updatedCache = {
            ...existingCache,
            calculatedStats: {
                ...(existingCache.calculatedStats || {}),
                ...newCalculatedStats
            }
        };
        saveCache(updatedCache);
    }

    console.log('='.repeat(50));
    console.log(`✅ 정적 캐시 생성 완료!`);
}

main().catch(error => {
    console.error('❌ 자동 업데이트 실패:', error.message);
    // 업데이트 실패해도 서버는 계속 실행되도록 exit하지 않음
});
