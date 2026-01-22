
const fs = require('fs');
const path = require('path');

// Mock data (from current cache for Godeok Jayeon & Housing-D (국민))
// In reality, this data would come from the API details.
// Let's simulate the bug I found.

const mockCompetitionRows = [
    { MODEL_NO: '084.8941A', SUBSCRPT_RANK_CODE: 1, SUPLY_HSHLDCO: 120, REQ_CNT: 136 },
    { MODEL_NO: '084.8325B', SUBSCRPT_RANK_CODE: 1, SUPLY_HSHLDCO: 120, REQ_CNT: 449 },
    { MODEL_NO: '084.8977C', SUBSCRPT_RANK_CODE: 1, SUPLY_HSHLDCO: 120, REQ_CNT: 36 },
    { MODEL_NO: '084.8941A', SUBSCRPT_RANK_CODE: 2, SUPLY_HSHLDCO: 120, REQ_CNT: 21 },
    { MODEL_NO: '084.8325B', SUBSCRPT_RANK_CODE: 2, SUPLY_HSHLDCO: 120, REQ_CNT: 38 },
    { MODEL_NO: '084.8977C', SUBSCRPT_RANK_CODE: 2, SUPLY_HSHLDCO: 120, REQ_CNT: 12 },
];

const mockSpecialRows = [
    { MODEL_NO: '084.8941A', SPSPLY_HSHLDCO: 246, CRSPAREA_MNYCH_CNT: 34, ETC_AREA_MNYCH_CNT: 0, CTPRVN_MNYCH_CNT: 0 /* simplified */ },
    // Notice how SPSPLY_HSHLDCO is 246 for all rows in some cases?
    { MODEL_NO: '084.8325B', SPSPLY_HSHLDCO: 246 /* ... */ },
    { MODEL_NO: '084.8977C', SPSPLY_HSHLDCO: 246 /* ... */ },
];

// Fixed logic
const stageAgg = {
    special: { supply: new Map(), apply: 298 /* known correct value */ },
    rank1: { supply: new Map(), apply: 136 + 449 + 36 },
    rank2: { supply: new Map(), apply: 21 + 38 + 12 }
};

mockCompetitionRows.forEach(item => {
    const modelNo = item.MODEL_NO;
    const rankCode = item.SUBSCRPT_RANK_CODE;
    const supply = item.SUPLY_HSHLDCO;
    if (rankCode === 1) {
        if (!stageAgg.rank1.supply.has(modelNo)) stageAgg.rank1.supply.set(modelNo, supply);
    } else if (rankCode === 2) {
        if (!stageAgg.rank2.supply.has(modelNo)) stageAgg.rank2.supply.set(modelNo, supply);
    }
});

mockSpecialRows.forEach(item => {
    const modelNo = item.MODEL_NO;
    const supply = item.SPSPLY_HSHLDCO;
    if (!stageAgg.special.supply.has(modelNo)) stageAgg.special.supply.set(modelNo, supply);
});

const getFinalSupply = (map) => {
    const values = Array.from(map.values());
    if (values.length === 0) return 0;
    if (values.length > 1 && values.every(v => v === values[0] && v > 0)) {
        return values[0];
    }
    return values.reduce((s, v) => s + v, 0);
};

const specialS = getFinalSupply(stageAgg.special.supply);
const rank1S = getFinalSupply(stageAgg.rank1.supply);
const rank2S = getFinalSupply(stageAgg.rank2.supply);

console.log(`Special Supply: ${specialS} (Map had ${stageAgg.special.supply.size} entries)`);
console.log(`Rank 1 Supply: ${rank1S} (Map had ${stageAgg.rank1.supply.size} entries)`);
console.log(`Total Requests: ${stageAgg.special.apply + stageAgg.rank1.apply + stageAgg.rank2.apply}`);
console.log(`Final Rate: ${(stageAgg.special.apply + stageAgg.rank1.apply + stageAgg.rank2.apply) / (specialS + rank1S)}:1`);

const oldSpecialS = Array.from(stageAgg.special.supply.values()).reduce((s, v) => s + v, 0);
const oldRank1S = Array.from(stageAgg.rank1.supply.values()).reduce((s, v) => s + v, 0);
console.log(`Old Final Rate (buggy): ${(stageAgg.special.apply + stageAgg.rank1.apply + stageAgg.rank2.apply) / (oldSpecialS + oldRank1S)}:1`);
