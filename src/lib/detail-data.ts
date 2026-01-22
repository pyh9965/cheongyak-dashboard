// 상세정보 데이터 통합 로직

import { toInt, toFloat, parseHouseTypeKey } from "./detail-utils";

/**
 * 모델 번호(타입명)를 정규화하여 매칭률을 높입니다.
 * 예: "084.99" -> "84.99", " 84.99 " -> "84.99"
 */
function normalizeModelNo(modelNo: any): string {
  if (modelNo === null || modelNo === undefined) return "";
  let str = String(modelNo).trim().toUpperCase();
  // 숫자로 시작하고 앞자리에 0이 있는 경우 제거 (단, "0.1" 등은 유지)
  if (/^0+[1-9]/.test(str)) {
    str = str.replace(/^0+/, "");
  }
  return str;
}

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
  rank1Requests: number | null;
  rank1Local: number | null;
  rank1Etc: number | null;
  rank2Target: number | null;
  rank2Requests: number | null;
  rank2Local: number | null;
  rank2Etc: number | null;
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
    const rawModelNo = String(item.MODEL_NO ?? item.HOUSE_TY ?? "").trim();
    const modelNo = normalizeModelNo(rawModelNo);
    if (!modelNo) return;

    const stageCode = toInt(item.SUBSCRPT_RANK_CODE);
    const region = String(item.RESIDE_SECD ?? "");
    const target = toInt(item.SUPLY_HSHLDCO);

    // REQ_CNT가 null/undefined인지 명시적으로 확인
    const requestValue = item.REQ_CNT;
    const request = requestValue !== null && requestValue !== undefined
      ? toInt(requestValue)
      : null;

    const acc = compMap.get(modelNo) ?? {
      rank1Target: null,
      rank1Requests: null,
      rank1Local: null,
      rank1Etc: null,
      rank2Target: null,
      rank2Requests: null,
      rank2Local: null,
      rank2Etc: null,
    };

    if (stageCode === 1) {
      if (acc.rank1Target === null && target > 0) acc.rank1Target = target;

      // request가 null이 아닌 경우에만 누적
      if (request !== null) {
        acc.rank1Requests = (acc.rank1Requests ?? 0) + request;
        if (region === "01") acc.rank1Local = (acc.rank1Local ?? 0) + request;
        else if (region === "02") acc.rank1Etc = (acc.rank1Etc ?? 0) + request;
      }
    } else if (stageCode === 2) {
      if (acc.rank2Target === null && target > 0) acc.rank2Target = target;

      if (request !== null) {
        acc.rank2Requests = (acc.rank2Requests ?? 0) + request;
        if (region === "01") acc.rank2Local = (acc.rank2Local ?? 0) + request;
        else if (region === "02") acc.rank2Etc = (acc.rank2Etc ?? 0) + request;
      }
    }

    compMap.set(modelNo, acc);
  });

  // 2. 특별공급 데이터 집계
  const specialMap = new Map<string, SpecialAccumulator>();

  special.forEach((item) => {
    const keys = [
      normalizeModelNo(item.MODEL_NO),
      normalizeModelNo(item.HOUSE_TY)
    ].filter((key) => key.length > 0);
    if (keys.length === 0) return;

    const instt = toInt(item.INSTT_RECOMEND_DCSN_CNT) + toInt(item.INSTT_RECOMEND_PREPAR_CNT);
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
    .map((model): ApplicationRow | null => {
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
        rank1Target: null, rank1Requests: null, rank1Local: null, rank1Etc: null,
        rank2Target: null, rank2Requests: null, rank2Local: null, rank2Etc: null,
      };

      const rank1Target = comp.rank1Target
        ?? (generalSupply > 0 ? generalSupply : null)
        ?? (supplyTotal > 0 ? supplyTotal : null);

      // [보정] 만약 rank1Target이 개별 모델 공급수(82)보다 크고 공공분양/국민주택인 경우 
      // API가 단지 전체 합계를 모든 행에 내려주는 케이스일 수 있음
      const rank2Target = comp.rank2Target ?? rank1Target;
      const totalTarget = rank1Target ?? rank2Target ?? (generalSupply > 0 ? generalSupply : null);
      const totalRequest = (comp.rank1Requests !== null || comp.rank2Requests !== null)
        ? (comp.rank1Requests ?? 0) + (comp.rank2Requests ?? 0)
        : null;

      const specialBreakdown: Record<string, number> = {
        기관추천: toInt(model.INSTT_RECOMEND_HSHLDCO),
        "신혼부부": toInt(model.MNYCH_HSHLDCO),
        "생애최초": toInt(model.LFE_FRST_HSHLDCO),
        "다자녀": toInt(model.NWWDS_HSHLDCO),
        "노부모부양": toInt(model.OLD_PARNTS_SUPORT_HSHLDCO),
        "기타": toInt(model.ETC_HSHLDCO),
      };

      const specialAgg = specialMap.get(modelNo) ?? specialMap.get(normHouseType);
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
            rate: specialSupply > 0 && specialRequestTotal !== null
              ? specialRequestTotal / specialSupply
              : null,
            remaining: specialSupply !== null && specialRequestTotal !== null
              ? specialSupply - specialRequestTotal
              : null,
            breakdown: specialBreakdown,
          },
          rank1: {
            target: rank1Target,
            request: comp.rank1Requests,
            rate: rank1Target !== null && comp.rank1Requests !== null
              ? comp.rank1Requests / rank1Target
              : null,
            remaining: rank1Target !== null && comp.rank1Requests !== null
              ? rank1Target - comp.rank1Requests
              : null,
            localRequest: comp.rank1Local,
            etcRequest: comp.rank1Etc,
          },
          rank2: {
            target: rank2Target,
            request: comp.rank2Requests,
            rate: rank2Target !== null && comp.rank2Requests !== null
              ? comp.rank2Requests / rank2Target
              : null,
            remaining: rank2Target !== null && comp.rank2Requests !== null
              ? rank2Target - comp.rank2Requests
              : null,
            localRequest: comp.rank2Local,
            etcRequest: comp.rank2Etc,
          },
          total: {
            target: totalTarget,
            request: totalRequest,
            rate: totalTarget !== null && totalRequest !== null
              ? totalRequest / totalTarget
              : null,
            remaining: totalTarget !== null && totalRequest !== null
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
            target: row.stages.special.target ?? null,
            request: row.stages.special.request ?? null,
            rate: null,
            remaining: null,
            breakdown: row.stages.special.breakdown ? { ...row.stages.special.breakdown } : undefined,
          },
          rank1: {
            target: row.stages.rank1.target ?? null,
            request: row.stages.rank1.request ?? null,
            rate: null,
            remaining: null,
            localRequest: row.stages.rank1.localRequest ?? null,
            etcRequest: row.stages.rank1.etcRequest ?? null,
          },
          rank2: {
            target: row.stages.rank2.target ?? null,
            request: row.stages.rank2.request ?? null,
            rate: null,
            remaining: null,
            localRequest: row.stages.rank2.localRequest ?? null,
            etcRequest: row.stages.rank2.etcRequest ?? null,
          },
          total: {
            target: row.stages.total.target ?? null,
            request: row.stages.total.request ?? null,
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

    acc.stages.special.target = acc.stages.special.target !== null || row.stages.special.target !== null
      ? (acc.stages.special.target ?? 0) + (row.stages.special.target ?? 0)
      : null;
    acc.stages.special.request = acc.stages.special.request !== null || row.stages.special.request !== null
      ? (acc.stages.special.request ?? 0) + (row.stages.special.request ?? 0)
      : null;

    acc.stages.rank1.target = acc.stages.rank1.target !== null || row.stages.rank1.target !== null
      ? (acc.stages.rank1.target ?? 0) + (row.stages.rank1.target ?? 0)
      : null;
    acc.stages.rank1.request = acc.stages.rank1.request !== null || row.stages.rank1.request !== null
      ? (acc.stages.rank1.request ?? 0) + (row.stages.rank1.request ?? 0)
      : null;
    acc.stages.rank1.localRequest = acc.stages.rank1.localRequest !== null || row.stages.rank1.localRequest !== null
      ? (acc.stages.rank1.localRequest ?? 0) + (row.stages.rank1.localRequest ?? 0)
      : null;
    acc.stages.rank1.etcRequest = acc.stages.rank1.etcRequest !== null || row.stages.rank1.etcRequest !== null
      ? (acc.stages.rank1.etcRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0)
      : null;

    acc.stages.rank2.target = acc.stages.rank2.target !== null || row.stages.rank2.target !== null
      ? (acc.stages.rank2.target ?? 0) + (row.stages.rank2.target ?? 0)
      : null;
    acc.stages.rank2.request = acc.stages.rank2.request !== null || row.stages.rank2.request !== null
      ? (acc.stages.rank2.request ?? 0) + (row.stages.rank2.request ?? 0)
      : null;
    acc.stages.rank2.localRequest = acc.stages.rank2.localRequest !== null || row.stages.rank2.localRequest !== null
      ? (acc.stages.rank2.localRequest ?? 0) + (row.stages.rank2.localRequest ?? 0)
      : null;
    acc.stages.rank2.etcRequest = acc.stages.rank2.etcRequest !== null || row.stages.rank2.etcRequest !== null
      ? (acc.stages.rank2.etcRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0)
      : null;

    acc.stages.total.target = acc.stages.total.target !== null || row.stages.total.target !== null
      ? (acc.stages.total.target ?? 0) + (row.stages.total.target ?? 0)
      : null;
    acc.stages.total.request = acc.stages.total.request !== null || row.stages.total.request !== null
      ? (acc.stages.total.request ?? 0) + (row.stages.total.request ?? 0)
      : null;

    return acc;
  }, null);

  // 4.1 합계 행의 대상 수 보정 (중복 합산 방지)
  // Godeok 사례처럼 모든 모델에 '120'이라는 전체 합계가 들어있는 경우, 
  // 위 reduce에서 120+120+120 = 360이 되었을 것임. 이를 다시 120으로 보정.
  if (totals && rows.length > 1) {
    const checkAndFixSharedTarget = (stage: ApplicationStage, stageName: string) => {
      if (!stage.target) return;

      // 모든 행의 해당 스테이지 대상수가 동일한지 확인
      const targets = rows.map(r => (r.stages as any)[stageName].target).filter(t => t !== null);
      if (targets.length === rows.length && targets.every(t => t === targets[0])) {
        // 모든 행이 동일한 대상수를 가지고 있다면, 단지 전체 합계일 가능성이 매우 높음
        stage.target = targets[0];
      }
    };

    checkAndFixSharedTarget(totals.stages.special, "special");
    checkAndFixSharedTarget(totals.stages.rank1, "rank1");
    checkAndFixSharedTarget(totals.stages.rank2, "rank2");
    checkAndFixSharedTarget(totals.stages.total, "total");
  }

  // 5. 합계 행의 경쟁률 계산
  if (totals) {
    const fillRate = (stage: ApplicationStage) => {
      if (stage.target !== null && stage.request !== null && stage.target > 0) {
        stage.rate = stage.request / stage.target;
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

  const missingSpecialRequests = special.length === 0;

  return { rows, missingSpecialRequests, totals };
}

