/**
 * 모든 청약 항목에 대한 정적 상세 데이터(JSON) 생성 스크립트
 * 
 * - 캐시된 모든 항목을 순회하며 ./public/data/details/ 폴더에 JSON 파일이 없는 경우 생성합니다.
 * - API 호출 속도 제한을 준수하며 실행됩니다.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REB_API_KEY;
const DETAIL_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const COMPET_BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1';

const DATA_DIR = path.join(__dirname, '../public/data');
const CACHE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');
const DETAIL_DIR = path.join(DATA_DIR, 'details');

// Helper functions (Copied from auto-update-cache.js)
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
        return {
            raw: cleanType,
            numeric: parseFloat(match[1]),
            suffix: match[2] || "",
            base: Math.floor(parseFloat(match[1]))
        };
    }
    return { raw: cleanType, numeric: 0, suffix: "", base: 0 };
}

// Build Logic
function buildApplicationRows(models, competition, special) {
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
            if (region === "01") acc.rank1Local += request; else if (region === "02") acc.rank1Etc += request;
        } else if (stageCode === 2) {
            if (acc.rank2Target === null && target > 0) acc.rank2Target = target;
            acc.rank2Requests += request;
            if (region === "01") acc.rank2Local += request; else if (region === "02") acc.rank2Etc += request;
        }
        compMap.set(modelNo, acc);
    });

    const specialMap = new Map();
    special.forEach((item) => {
        const keys = [normalizeModelNo(item.MODEL_NO), normalizeModelNo(item.HOUSE_TY)].filter(k => k.length > 0);
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
            const acc = specialMap.get(key) || { total: 0, instt: 0, newlywed: 0, life: 0, multi: 0, oldParent: 0, etc: 0, transfer: 0, young: 0 };
            acc.instt += instt; acc.newlywed += newlywed; acc.life += life; acc.multi += multi; acc.oldParent += oldParent; acc.etc += etc; acc.transfer += transfer; acc.young += young; acc.total += total;
            specialMap.set(key, acc);
        });
    });

    const rows = models.map((model) => {
        const rawModelNo = String(model.MODEL_NO || model.HOUSE_TY || "").trim();
        const modelNo = normalizeModelNo(rawModelNo);
        if (!modelNo) return null;
        const houseType = String(model.HOUSE_TY || model.MODEL_NO || "-").trim();
        const normHouseType = normalizeModelNo(houseType);
        const areaSqm = toFloat(model.SUPLY_AR);
        const specialSupply = toInt(model.SPSPLY_HSHLDCO);
        const generalSupply = toInt(model.SUPLY_HSHLDCO);
        const supplyTotal = specialSupply + generalSupply;
        const priceThousand = toInt(model.LTTOT_TOP_AMOUNT);
        const comp = compMap.get(modelNo) || { rank1Target: null, rank1Requests: 0, rank1Local: 0, rank1Etc: 0, rank2Target: null, rank2Requests: 0, rank2Local: 0, rank2Etc: 0 };
        const rank1Target = comp.rank1Target ?? (generalSupply > 0 ? generalSupply : null) ?? (supplyTotal > 0 ? supplyTotal : null);
        const rank2Target = comp.rank2Target || rank1Target;
        const totalTarget = rank1Target || rank2Target || (generalSupply > 0 ? generalSupply : null);
        const totalRequest = comp.rank1Requests + comp.rank2Requests;
        const specialAgg = specialMap.get(modelNo) || specialMap.get(normHouseType);
        const specialRequestTotal = specialAgg ? specialAgg.total : null;
        return {
            modelNo, houseType, areaSqm, areaPyeong: areaSqm ? areaSqm / 3.3058 : null, priceThousand: priceThousand > 0 ? priceThousand : null,
            supplyGeneral: generalSupply, supplySpecial: specialSupply, supplyTotal,
            specialRequests: {
                기관추천: specialAgg ? specialAgg.instt : null, 신혼부부: specialAgg ? specialAgg.newlywed : null, 생애최초: specialAgg ? specialAgg.life : null,
                다자녀가구: specialAgg ? specialAgg.multi : null, 노부모부양: specialAgg ? specialAgg.oldParent : null, 기타: specialAgg ? specialAgg.etc : null,
                이전기관: specialAgg ? specialAgg.transfer : null, 영구임대: specialAgg ? specialAgg.young : null,
            },
            stages: {
                special: { target: specialSupply > 0 ? specialSupply : null, request: specialRequestTotal, rate: specialSupply && specialRequestTotal !== null ? specialRequestTotal / specialSupply : (specialSupply ? 0 : null), remaining: specialSupply !== null && specialRequestTotal !== null ? specialSupply - specialRequestTotal : null },
                rank1: { target: rank1Target, request: comp.rank1Requests || null, rate: rank1Target && comp.rank1Requests ? comp.rank1Requests / rank1Target : (rank1Target ? 0 : null), remaining: rank1Target !== null ? rank1Target - comp.rank1Requests : null, localRequest: comp.rank1Local, etcRequest: comp.rank1Etc },
                rank2: { target: rank2Target, request: comp.rank2Requests || null, rate: rank2Target && comp.rank2Requests ? comp.rank2Requests / rank2Target : (rank2Target ? 0 : null), remaining: rank2Target !== null ? rank2Target - comp.rank2Requests : null, localRequest: comp.rank2Local, etcRequest: comp.rank2Etc },
                total: { target: totalTarget, request: totalTarget !== null ? totalRequest : null, rate: totalTarget && totalRequest ? totalRequest / totalTarget : (totalTarget ? 0 : null), remaining: totalTarget !== null ? totalTarget - totalRequest : null },
            },
        };
    }).filter(v => v !== null).sort((a, b) => {
        const aKey = parseHouseTypeKey(a.houseType);
        const bKey = parseHouseTypeKey(b.houseType);
        if (aKey.base !== null && bKey.base !== null && aKey.base !== bKey.base) return aKey.base - bKey.base;
        if (aKey.suffix && bKey.suffix && aKey.suffix !== bKey.suffix) return aKey.suffix.localeCompare(bKey.suffix, "en", { sensitivity: "base" });
        return aKey.raw.localeCompare(bKey.raw, "en", { numeric: true, sensitivity: "base" });
    });

    const totals = rows.reduce((acc, row, index) => {
        if (index === 0) return {
            modelNo: "TOTAL", houseType: "합계", areaSqm: null, areaPyeong: null, priceThousand: null,
            supplyGeneral: row.supplyGeneral, supplySpecial: row.supplySpecial, supplyTotal: row.supplyTotal,
            specialRequests: { ...row.specialRequests }, stages: JSON.parse(JSON.stringify(row.stages))
        };
        if (!acc) return acc;
        acc.supplyGeneral += row.supplyGeneral; acc.supplySpecial += row.supplySpecial; acc.supplyTotal += row.supplyTotal;
        Object.keys(row.specialRequests).forEach(k => acc.specialRequests[k] = (acc.specialRequests[k] || 0) + (row.specialRequests[k] || 0));
        ['special', 'rank1', 'rank2', 'total'].forEach(stage => {
            acc.stages[stage].target = (acc.stages[stage].target || 0) + (row.stages[stage].target || 0);
            acc.stages[stage].request = (acc.stages[stage].request || 0) + (row.stages[stage].request || 0);
            if (acc.stages[stage].localRequest !== undefined) acc.stages[stage].localRequest = (acc.stages[stage].localRequest || 0) + (row.stages[stage].localRequest || 0);
            if (acc.stages[stage].etcRequest !== undefined) acc.stages[stage].etcRequest = (acc.stages[stage].etcRequest || 0) + (row.stages[stage].etcRequest || 0);
        });
        return acc;
    }, null);

    if (totals && rows.length > 1) {
        ['special', 'rank1', 'rank2', 'total'].forEach(stageName => {
            const targets = rows.map(r => r.stages[stageName].target).filter(t => t !== null);
            if (targets.length === rows.length && targets.every(t => t === targets[0])) {
                totals.stages[stageName].target = targets[0];
            }
        });
    }

    if (totals) {
        ['special', 'rank1', 'rank2', 'total'].forEach(stageName => {
            const stage = totals.stages[stageName];
            if (stage.target && stage.request !== null) {
                stage.rate = stage.target > 0 ? stage.request / stage.target : null;
                stage.remaining = stage.target - stage.request;
            } else { stage.rate = null; stage.remaining = null; }
        });
    }

    return { rows, missingSpecialRequests: special.length === 0, totals };
}

// Fetch Logic
async function fetchApi(baseUrl, endpoint, params = {}) {
    const url = new URL(`${baseUrl}/${endpoint}`);
    url.searchParams.set('serviceKey', API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    try {
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`API 오류: ${response.status}`);
        return response.json();
    } catch (e) {
        // Retry once
        await new Promise(r => setTimeout(r, 1000));
        try {
            const response = await fetch(url.toString());
            return response.json();
        } catch (e2) {
            throw new Error(`API 오류(재시도 실패): ${e2.message}`);
        }
    }
}

async function fetchDetails(item) {
    const { HOUSE_MANAGE_NO, PBLANC_NO } = item;
    try {
        const [competData, specialData, modelData] = await Promise.all([
            fetchApi(COMPET_BASE, 'getAPTLttotPblancCmpet', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': HOUSE_MANAGE_NO, 'cond[PBLANC_NO::EQ]': PBLANC_NO }),
            fetchApi(COMPET_BASE, 'getAPTSpsplyReqstStus', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': HOUSE_MANAGE_NO, 'cond[PBLANC_NO::EQ]': PBLANC_NO }),
            fetchApi(DETAIL_BASE, 'getAPTLttotPblancMdl', { page: 1, perPage: 100, 'cond[HOUSE_MANAGE_NO::EQ]': HOUSE_MANAGE_NO, 'cond[PBLANC_NO::EQ]': PBLANC_NO })
        ]);

        const result = buildApplicationRows(modelData.data || [], competData.data || [], specialData.data || []);

        if (!fs.existsSync(DETAIL_DIR)) fs.mkdirSync(DETAIL_DIR, { recursive: true });
        fs.writeFileSync(path.join(DETAIL_DIR, `${HOUSE_MANAGE_NO}_${PBLANC_NO}.json`), JSON.stringify(result, null, 2));
        return true;
    } catch (error) {
        console.error(`  ❌ ${item.HOUSE_NM} 실패: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 정적 상세 데이터 전체 생성 (Missing Files)');
    if (!fs.existsSync(CACHE_FILE)) { console.error('캐시 파일 없음'); return; }

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const allItems = cache.lists || [];

    // 이미 파일이 존재하는 것은 제외
    const jobs = allItems.filter(item => {
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        // 당첨자 발표일이 지난 것만 대상
        // 당첨자 발표일 체크 제거 (분양정보는 발표 전에도 필요함)
        // const presDate = item.PRZWNER_PRESNATN_DE ? new Date(item.PRZWNER_PRESNATN_DE.replace(/-/g, '/')) : null;
        // if (!presDate || presDate > new Date()) return false;

        const filePath = path.join(DETAIL_DIR, `${key}.json`);
        return !fs.existsSync(filePath);
    });

    console.log(`📌 할 일: ${jobs.length}건 (전체 ${allItems.length}건 중)`);

    const BATCH_SIZE = 5;
    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batch = jobs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(item => fetchDetails(item)));
        console.log(`  진행: ${Math.min(i + BATCH_SIZE, jobs.length)}/${jobs.length}`);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('✅ 완료');
}

main();
