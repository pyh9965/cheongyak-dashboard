// 상세정보 데이터 통합 로직

import { toInt, toFloat, parseHouseTypeKey } from "./detail-utils";

export type ApiValue = string | number | null | undefined;

// API 응답 타입
export type NoticeModelApiRow = {
  MODEL_NO?: ApiValue;
  HOUSE_TY?: ApiValue;
  SUPLY_AR?: ApiValue;
  SUPLY_HSHLDCO?: ApiValue;
  SPSPLY_HSHLDCO?: ApiValue;
  LTTOT_TOP_AMOUNT?: ApiValue;
  INSTT_RECOMEND_HSHLDCO?: ApiValue;
  LFE_FRST_HSHLDCO?: ApiValue;
  MNYCH_HSHLDCO?: ApiValue;
  NWWDS_HSHLDCO?: ApiValue;
  OLD_PARNTS_SUPORT_HSHLDCO?: ApiValue;
  ETC_HSHLDCO?: ApiValue;
  TRANSR_INSTT_ENFSN_HSHLDCO?: ApiValue;
  YGMN_HSHLDCO?: ApiValue;
  [key: string]: ApiValue;
};

export type NoticeCompetitionApiRow = {
  MODEL_NO?: ApiValue;
  HOUSE_TY?: ApiValue;
  SUBSCRPT_RANK_CODE?: ApiValue;
  RESIDE_SECD?: ApiValue;
  RESIDE_SENM?: ApiValue;
  SUPLY_HSHLDCO?: ApiValue;
  REQ_CNT?: ApiValue;
};

export type NoticeSpecialApiRow = {
  MODEL_NO?: ApiValue;
  HOUSE_TY?: ApiValue;
  INSTT_RECOMEND_DCSN_CNT?: ApiValue;
  INSTT_RECOMEND_HSHLDCO?: ApiValue;
  INSTT_RECOMEND_PREPAR_CNT?: ApiValue;
  CRSPAREA_LFE_FRST_CNT?: ApiValue;
  CRSPAREA_MNYCH_CNT?: ApiValue;
  CRSPAREA_NWBB_NWBBSHR_CNT?: ApiValue;
  CRSPAREA_NWWDS_NMTW_CNT?: ApiValue;
  CRSPAREA_OPS_CNT?: ApiValue;
  CRSPAREA_YGMN_CNT?: ApiValue;
  CTPRVN_LFE_FRST_CNT?: ApiValue;
  CTPRVN_MNYCH_CNT?: ApiValue;
  CTPRVN_NWBB_NWBBSHR_CNT?: ApiValue;
  CTPRVN_NWWDS_NMTW_CNT?: ApiValue;
  CTPRVN_OPS_CNT?: ApiValue;
  CTPRVN_YGMN_CNT?: ApiValue;
  ETC_AREA_LFE_FRST_CNT?: ApiValue;
  ETC_AREA_MNYCH_CNT?: ApiValue;
  ETC_AREA_NWBB_NWBBSHR_CNT?: ApiValue;
  ETC_AREA_NWWDS_NMTW_CNT?: ApiValue;
  ETC_AREA_OPS_CNT?: ApiValue;
  ETC_AREA_YGMN_CNT?: ApiValue;
  TRANSR_INSTT_ENFSN_CNT?: ApiValue;
  TRANSR_INSTT_ENFSN_HSHLDCO?: ApiValue;
  YGMN_HSHLDCO?: ApiValue;
  [key: string]: ApiValue;
};

// 변환된 데이터 타입
export type ApplicationStage = {
  target: number | null;
  request: number | null;
  rate: number | null;
  remaining: number | null;
  localRequest?: number | null;
  etcRequest?: number | null;
  breakdown?: Record<string, number>;
};

export type ApplicationRow = {
  modelNo: string;
  houseType: string;
  areaSqm: number | null;
  areaPyeong: number | null;
  priceThousand: number | null;
  supplyGeneral: number;
  supplySpecial: number;
  supplyTotal: number;
  specialRequests: Record<string, number | null>;
  stages: {
    special: ApplicationStage;
    rank1: ApplicationStage;
    rank2: ApplicationStage;
    total: ApplicationStage;
  };
};

type CompAccumulator = {
  rank1Target: number | null;
  rank1Requests: number;
  rank1Local: number;
  rank1Etc: number;
  rank2Target: number | null;
  rank2Requests: number;
  rank2Local: number;
  rank2Etc: number;
};

type SpecialAccumulator = {
  total: number;
  instt: number;
  newlywed: number;
  life: number;
  multi: number;
  oldParent: number;
  etc: number;
  transfer: number;
  young: number;
};

export function buildApplicationRows(
  models: NoticeModelApiRow[],
  competition: NoticeCompetitionApiRow[],
  special: NoticeSpecialApiRow[],
): { 
  rows: ApplicationRow[]; 
  missingSpecialRequests: boolean; 
  totals: ApplicationRow | null 
} {
  // 1. 경쟁률 데이터 집계
  const compMap = new Map<string, CompAccumulator>();
  
  competition.forEach((item) => {
    const modelNo = String(item.MODEL_NO ?? item.HOUSE_TY ?? "").trim();
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

  // 2. 특별공급 데이터 집계
  const specialMap = new Map<string, SpecialAccumulator>();
  
  special.forEach((item) => {
    const keys = [
      String(item.MODEL_NO ?? "").trim(), 
      String(item.HOUSE_TY ?? "").trim()
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

  // 3. 모델 데이터를 기반으로 행 생성
  const rows: ApplicationRow[] = models
    .map((model) => {
      const modelNo = String(model.MODEL_NO ?? model.HOUSE_TY ?? "").trim();
      if (!modelNo) return null;

      const houseType = String(model.HOUSE_TY ?? model.MODEL_NO ?? "-").trim();
      
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
      
      const specialBreakdown: Record<string, number> = {
        기관추천: toInt(model.INSTT_RECOMEND_HSHLDCO),
        "신혼부부": toInt(model.MNYCH_HSHLDCO),
        "생애최초": toInt(model.LFE_FRST_HSHLDCO),
        "다자녀": toInt(model.NWWDS_HSHLDCO),
        "노부모부양": toInt(model.OLD_PARNTS_SUPORT_HSHLDCO),
        "기타": toInt(model.ETC_HSHLDCO),
      };
      
      const specialAgg = specialMap.get(modelNo) ?? specialMap.get(houseType);
      const specialRequests: Record<string, number | null> = {
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
            breakdown: specialBreakdown,
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
      } satisfies ApplicationRow;
    })
    .filter((value): value is ApplicationRow => value !== null)
    .sort((a, b) => {
      const aKey = parseHouseTypeKey(a.houseType);
      const bKey = parseHouseTypeKey(b.houseType);
      
      if (aKey.base !== null && bKey.base !== null && aKey.base !== bKey.base) {
        return aKey.base - bKey.base;
      }
      
      if (aKey.suffix && bKey.suffix && aKey.suffix !== bKey.suffix) {
        return aKey.suffix.localeCompare(bKey.suffix, "en", { sensitivity: "base" });
      }
      
      if (aKey.numeric !== null && bKey.numeric !== null && aKey.numeric !== bKey.numeric) {
        return aKey.numeric - bKey.numeric;
      }
      
      return aKey.raw.localeCompare(bKey.raw, "en", { numeric: true, sensitivity: "base" });
    });

  // 4. 합계 행 계산
  const totals = rows.reduce<ApplicationRow | null>((acc, row, index) => {
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
        stages: {
          special: {
            target: row.stages.special.target ?? 0,
            request: row.stages.special.request ?? 0,
            rate: null,
            remaining: null,
            breakdown: row.stages.special.breakdown ? { ...row.stages.special.breakdown } : undefined,
          },
          rank1: {
            target: row.stages.rank1.target ?? 0,
            request: row.stages.rank1.request ?? 0,
            rate: null,
            remaining: null,
            localRequest: row.stages.rank1.localRequest ?? 0,
            etcRequest: row.stages.rank1.etcRequest ?? 0,
          },
          rank2: {
            target: row.stages.rank2.target ?? 0,
            request: row.stages.rank2.request ?? 0,
            rate: null,
            remaining: null,
            localRequest: row.stages.rank2.localRequest ?? 0,
            etcRequest: row.stages.rank2.etcRequest ?? 0,
          },
          total: {
            target: row.stages.total.target ?? 0,
            request: row.stages.total.request ?? 0,
            rate: null,
            remaining: null,
          },
        },
      } satisfies ApplicationRow;
    }

    if (!acc) return acc;

    acc.supplyGeneral += row.supplyGeneral;
    acc.supplySpecial += row.supplySpecial;
    acc.supplyTotal += row.supplyTotal;
    
    acc.specialRequests = acc.specialRequests ?? {};
    Object.entries(row.specialRequests).forEach(([key, value]) => {
      acc!.specialRequests[key] = (acc!.specialRequests[key] ?? 0) + (value ?? 0);
    });
    
    acc.stages.special.target = (acc.stages.special.target ?? 0) + (row.stages.special.target ?? 0);
    acc.stages.special.request = (acc.stages.special.request ?? 0) + (row.stages.special.request ?? 0);
    
    acc.stages.rank1.target = (acc.stages.rank1.target ?? 0) + (row.stages.rank1.target ?? 0);
    acc.stages.rank1.request = (acc.stages.rank1.request ?? 0) + (row.stages.rank1.request ?? 0);
    acc.stages.rank1.localRequest = (acc.stages.rank1.localRequest ?? 0) + (row.stages.rank1.localRequest ?? 0);
    acc.stages.rank1.etcRequest = (acc.stages.rank1.etcRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0);
    
    acc.stages.rank2.target = (acc.stages.rank2.target ?? 0) + (row.stages.rank2.target ?? 0);
    acc.stages.rank2.request = (acc.stages.rank2.request ?? 0) + (row.stages.rank2.request ?? 0);
    acc.stages.rank2.localRequest = (acc.stages.rank2.localRequest ?? 0) + (row.stages.rank2.localRequest ?? 0);
    acc.stages.rank2.etcRequest = (acc.stages.rank2.etcRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0);
    
    acc.stages.total.target = (acc.stages.total.target ?? 0) + (row.stages.total.target ?? 0);
    acc.stages.total.request = (acc.stages.total.request ?? 0) + (row.stages.total.request ?? 0);
    
    return acc;
  }, null);

  // 합계 행의 경쟁률 계산
  if (totals) {
    const fillRate = (stage: ApplicationStage) => {
      if (stage.target && stage.request !== null) {
        stage.rate = stage.target > 0 ? stage.request / stage.target : null;
        stage.remaining = stage.target - stage.request;
      } else {
        stage.rate = null;
        stage.remaining = null;
      }
    };

    fillRate(totals.stages.rank1);
    fillRate(totals.stages.rank2);
    fillRate(totals.stages.total);
  }

  const missingSpecialRequests = special.length === 0;

  return { rows, missingSpecialRequests, totals };
}

