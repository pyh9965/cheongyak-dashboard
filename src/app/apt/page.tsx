"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { buildApplicationRows, type NoticeModelApiRow, type NoticeCompetitionApiRow, type NoticeSpecialApiRow } from "@/lib/detail-data";
import { formatNumber, formatPriceTenThousand, formatRate, formatDifference, formatSpecialRequestEntries, formatValue } from "@/lib/detail-utils";
import { loadArchiveCache, loadDetailCache, mergeCacheAndApiData, getDetailFromCache, getStaticDetail, type CacheData, type DetailCacheData } from "@/lib/cache-loader";
import styles from "./page.module.css";

// 지도 컴포넌트 동적 임포트 (SSR 비활성화)
const CompetitionRateMap = dynamic(
  () => import("@/components/CompetitionRateMap"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>지도를 불러오는 중...</div> }
);

// 경쟁률 표 컴포넌트 동적 임포트
const CompetitionTable = dynamic(
  () => import("@/components/CompetitionTable"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>표를 불러오는 중...</div> }
);

// 통계 대시보드 컴포넌트 동적 임포트
const StatsDashboard = dynamic(
  () => import("@/components/StatsDashboard"),
  { ssr: false, loading: () => <div style={{ padding: "40px", textAlign: "center" }}>통계 분석 중...</div> }
);

const SIDO_CODE_MAP: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주"
};

type RateType = "special" | "rank1" | "rank2" | "total";
type ViewTab = "list" | "map" | "table";


type AptInfo = {
  HOUSE_NM: string;
  BSNS_MBY_NM?: string;
  BSNS_MBY_TELNO?: string;
  RCRIT_PBLANC_DE?: string;
  RCEPT_BGNDE?: string;
  RCEPT_ENDDE?: string;
  PRZWNER_PRESNATN_DE?: string;
  SUBSCRPT_AREA_CODE_NM?: string;
  HOUSE_DTL_SECD_NM?: string;
  HOUSE_MANAGE_NO?: string;
  PBLANC_NO?: string;
  [key: string]: any;
};

type NoticeDetailRow = Record<string, unknown>;

type ApiResponse = {
  datasets: {
    noticeList?: AptInfo[];
  };
  metadata: {
    noticeList?: {
      page: number;
      perPage: number;
      totalCount: number;
      currentCount: number;
    };
  };
  errors: Record<string, string>;
};

export default function APTPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>로딩 중...</div>}>
      <APTPageContent />
    </Suspense>
  );
}

function APTPageContent() {
  const urlSearchParams = useSearchParams();

  // 기본 날짜 설정: 1년 전부터 현재까지 (성능 최적화)
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const oneYearAgo = new Date(currentYear - 1, currentMonth - 1, 1);
  const defaultStartMonth = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}`;
  const defaultEndMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // URL 파라미터에서 초기값 읽기
  const [searchParams, setSearchParams] = useState({
    houseNm: urlSearchParams.get("houseNm") || "",
    sidoCode: urlSearchParams.get("sidoCode") || "",
    houseDtlSecd: urlSearchParams.get("houseDtlSecd") || "",
    startMonth: urlSearchParams.get("startMonth") || defaultStartMonth,
    endMonth: urlSearchParams.get("endMonth") || defaultEndMonth,
    saleType: urlSearchParams.get("saleType") || "all",
  });
  const [data, setData] = useState<AptInfo[]>([]);
  const [metadata, setMetadata] = useState<ApiResponse["metadata"]["noticeList"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(Number(urlSearchParams.get("page")) || 1);

  // 상세정보 상태
  const [selectedItem, setSelectedItem] = useState<AptInfo | null>(null);
  const [detailRows, setDetailRows] = useState<NoticeDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [datasetErrors, setDatasetErrors] = useState<Record<string, string>>({});
  const [applicationRows, setApplicationRows] = useState<any[]>([]);
  const [missingSpecialRequestData, setMissingSpecialRequestData] = useState(false);
  const [applicationTotals, setApplicationTotals] = useState<any | null>(null);

  // 정적 캐시 상태 (아카이브 캐시)
  const [archiveCache, setArchiveCache] = useState<CacheData | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);

  // 상세 데이터 캐시 상태
  const [detailCache, setDetailCache] = useState<DetailCacheData | null>(null);

  // 배치 로딩 상태 - localStorage 캐시 지원
  const CACHE_KEY = "cheongyak_extraData_cache";
  const CACHE_VERSION = "v3"; // 데이터 구조 버전 (구조 변경 시 증가)
  const CACHE_EXPIRY_DAYS = 7; // 캐시 유효기간 7일

  // localStorage에서 캐시된 데이터 로드
  const loadCachedExtraData = useCallback((): Record<string, any> => {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return {};

      const parsed = JSON.parse(cached);
      const { data, timestamp, version } = parsed;

      // 버전 체크 - 버전이 다르면 캐시 무효화
      if (version !== CACHE_VERSION) {
        console.log(`Cache version mismatch (${version} vs ${CACHE_VERSION}), clearing cache`);
        localStorage.removeItem(CACHE_KEY);
        return {};
      }

      const now = Date.now();
      const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      // 캐시 만료 확인
      if (now - timestamp > expiryMs) {
        localStorage.removeItem(CACHE_KEY);
        console.log("Cache expired, cleared");
        return {};
      }

      console.log(`Loaded ${Object.keys(data).length} cached competition rate items (${version})`);
      return data;
    } catch (e) {
      console.warn("Failed to load cache:", e);
      return {};
    }
  }, []);

  const [extraData, setExtraData] = useState<Record<string, any>>(() => {
    // 초기 로드 시 캐시에서 데이터 복원
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const { data, timestamp, version } = parsed;

          // 버전 체크
          if (version !== CACHE_VERSION) {
            console.log(`⚠️ Cache version outdated (${version || 'v1'} → ${CACHE_VERSION}), clearing...`);
            localStorage.removeItem(CACHE_KEY);
            return {};
          }

          const now = Date.now();
          const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

          if (now - timestamp <= expiryMs) {
            console.log(`✅ Initial load: ${Object.keys(data).length} cached items (${version})`);
            return data;
          }
        }
      } catch (e) {
        console.warn("Cache init failed:", e);
      }
    }
    return {};
  });

  // extraData를 ref로도 유지 (useCallback에서 최신 값 접근용)
  const extraDataRef = useRef(extraData);
  useEffect(() => {
    extraDataRef.current = extraData;
  }, [extraData]);

  // extraData 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (Object.keys(extraData).length === 0) return;

    try {
      const cacheData = {
        data: extraData,
        timestamp: Date.now(),
        version: CACHE_VERSION  // 버전 정보 포함
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      // 저장 시마다 로그 출력하면 너무 많으므로 생략
    } catch (e) {
      console.warn("Failed to save cache:", e);
    }
  }, [extraData]);

  const fetchingPool = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // 탭 및 지도 상태
  const [activeTab, setActiveTab] = useState<ViewTab>("list");
  const [mapRateType, setMapRateType] = useState<RateType>("rank1");
  const [mapStartDate, setMapStartDate] = useState("");
  const [mapEndDate, setMapEndDate] = useState("");
  const [mapData, setMapData] = useState<AptInfo[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const mapDataFetched = useRef(false);

  // 지도 데이터 상태 관리 (handleSearch에서 업데이트됨)
  // 기존 fetchMapData 로직 제거됨 (캐시 병합 데이터 사용)

  // 개별 항목 상세 데이터 비동기 로딩 함수
  const fetchSingleExtraData = useCallback(async (houseManageNo: string, pblancNo: string, noticeDate?: string) => {
    const key = `${houseManageNo}_${pblancNo}`;
    if (fetchingPool.current.has(key)) return;

    // extraDataRef를 사용해서 현재 캐시 확인
    const cached = extraDataRef.current[key];
    const cachedRate = cached?.totals?.stages?.total?.rate;
    // 캐시에 유효한 경쟁률이 있으면 API 호출 불필요
    if (cachedRate !== null && cachedRate !== undefined && cachedRate > 0) {
      return;
    }

    // API 호출
    fetchingPool.current.add(key);

    try {
      const params = new URLSearchParams({
        dataset: "noticeModel,noticeCompetition,noticeSpecial",
        houseManageNo,
        pblancNo,
        perPage: "100"
      });
      const res = await fetch(`/api/cheongyak?${params.toString()}`);
      if (!res.ok) throw new Error("API failed");

      const json = await res.json();
      const modelRows = Array.isArray(json.datasets?.noticeModel) ? json.datasets.noticeModel : [];
      const competitionRows = Array.isArray(json.datasets?.noticeCompetition) ? json.datasets.noticeCompetition : [];
      const specialRows = Array.isArray(json.datasets?.noticeSpecial) ? json.datasets.noticeSpecial : [];

      // 통계 데이터 빌드
      const result = buildApplicationRows(modelRows, competitionRows, specialRows);

      if (result.totals) {
        setExtraData(prev => ({
          ...prev,
          [key]: result  // rows, totals, missingSpecialRequests 모두 저장
        }));
      }
    } catch (err) {
      console.error(`Failed to fetch extra data for ${key}:`, err);
    } finally {
      fetchingPool.current.delete(key);
    }
  }, []);

  // 페이지 데이터 변경 시 배치 로딩 트리거
  useEffect(() => {
    // 청약 시작된 모든 항목 (청약 접수 시작일이 지난 항목들) - 결과가 나왔을 수 있음
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const itemsToFetch = data.filter(item => {
      if (!item.HOUSE_MANAGE_NO || !item.PBLANC_NO) return false;

      // 청약 접수 시작일이 지난 항목들 (청약이 시작된 항목)
      const startDate = parseCheongyakDate(item.RCEPT_BGNDE || "");
      if (!startDate || today < startDate) return false; // 아직 시작 안 됨

      // 캐시에 유효한 경쟁률이 없는 항목만
      const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
      const cachedRate = extraDataRef.current[key]?.totals?.stages?.total?.rate;
      if (cachedRate !== null && cachedRate !== undefined && cachedRate > 0) {
        return false; // 이미 유효한 경쟁률이 있음
      }

      return true;
    });

    if (itemsToFetch.length === 0) return;

    // 병렬 페칭 (서버 부하 방지하며 속도 향상)
    let isCancelled = false;
    const loadSequentially = async () => {
      // 큐 생성
      const queue = [...itemsToFetch];
      const BATCH_SIZE = 5; // 5개씩 병렬 처리

      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        if (isCancelled) break;

        const batch = queue.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (item) => {
          await fetchSingleExtraData(String(item.HOUSE_MANAGE_NO), String(item.PBLANC_NO), item.RCRIT_PBLANC_DE);
        });

        await Promise.all(promises);

        // 배치 사이 짧은 대기 (Rate Limit 방지)
        if (i + BATCH_SIZE < queue.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    };

    void loadSequentially();

    return () => {
      isCancelled = true;
    };
  }, [data, fetchSingleExtraData]);

  // 지도/표 탭에서 경쟁률 데이터 점진적 로딩
  useEffect(() => {
    if ((activeTab !== 'map' && activeTab !== 'table') || mapData.length === 0) return;

    // 결과가 발표된 청약만 필터링 (경쟁률 데이터가 있을 수 있는 항목)
    const actionableItems = mapData.filter(item => {
      const status = getCheongyakStatus(item.RCEPT_ENDDE || "", item.PRZWNER_PRESNATN_DE || "");
      return status.isActionable && item.HOUSE_MANAGE_NO && item.PBLANC_NO;
    });

    if (actionableItems.length === 0) return;

    let isCancelled = false;

    const loadSequentially = async () => {
      for (const item of actionableItems) {
        if (isCancelled) break;

        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        let alreadyHasData = false;
        setExtraData(prev => {
          if (prev[key]) alreadyHasData = true;
          return prev;
        });

        if (!alreadyHasData) {
          await fetchSingleExtraData(String(item.HOUSE_MANAGE_NO), String(item.PBLANC_NO), item.RCRIT_PBLANC_DE);
          // 빠르게 로드 (80ms 간격)
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }
    };

    void loadSequentially();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, mapData, fetchSingleExtraData]);

  // 앱 시작 시 정적 캐시 로드
  useEffect(() => {
    const initCache = async () => {
      setCacheLoading(true);
      const [archive, detail] = await Promise.all([
        loadArchiveCache(),
        loadDetailCache()
      ]);
      setArchiveCache(archive);
      setDetailCache(detail);

      // detailCache.details를 extraData에 병합
      if (detail?.details) {
        setExtraData(prev => {
          const merged = { ...prev };
          for (const [key, value] of Object.entries(detail.details)) {
            // 기존 extraData에 없거나, 유효한 rate가 없는 경우에만 덮어씀
            if (!merged[key] || !merged[key]?.totals?.stages?.total?.rate) {
              merged[key] = value;
            }
          }
          return merged;
        });
      }

      setCacheLoading(false);
    };
    void initCache();
  }, []);

  // 페이지 로드 시 자동으로 조회 (URL 파라미터 반영)
  useEffect(() => {
    // 캐시 로딩이 완료될 때까지 대기
    if (cacheLoading) return;

    const urlSidoCode = urlSearchParams.get("sidoCode") || "";
    const urlHouseNm = urlSearchParams.get("houseNm") || "";
    const urlHouseDtlSecd = urlSearchParams.get("houseDtlSecd") || "";
    const urlStartMonth = urlSearchParams.get("startMonth") || defaultStartMonth;
    const urlEndMonth = urlSearchParams.get("endMonth") || defaultEndMonth;
    const urlSaleType = urlSearchParams.get("saleType") || "all";
    const urlPage = Number(urlSearchParams.get("page")) || 1;

    // URL 파라미터로 상태 업데이트
    setSearchParams({
      houseNm: urlHouseNm,
      sidoCode: urlSidoCode,
      houseDtlSecd: urlHouseDtlSecd,
      startMonth: urlStartMonth,
      endMonth: urlEndMonth,
      saleType: urlSaleType,
    });
    setCurrentPage(urlPage);

    // URL 파라미터를 사용하여 검색 실행
    handleSearch(urlPage, {
      houseNm: urlHouseNm,
      sidoCode: urlSidoCode,
      houseDtlSecd: urlHouseDtlSecd,
      startMonth: urlStartMonth,
      endMonth: urlEndMonth,
      saleType: urlSaleType,
    }, archiveCache);
  }, [cacheLoading]);

  const handleSearch = async (page: number = 1, overrideParams?: typeof searchParams, overrideCache?: CacheData | null) => {
    setLoading(true);
    setError("");
    setCurrentPage(page);

    const paramsToUse = overrideParams || searchParams;
    const cacheToUse = overrideCache !== undefined ? overrideCache : archiveCache;

    try {
      const params = new URLSearchParams();
      params.set("dataset", "noticeList");
      params.set("page", String(page));
      // 지역 필터나 주택명 검색이 있을 때는 더 많은 데이터를 가져와서 정확한 개수 계산
      const hasFilter = (paramsToUse.sidoCode && paramsToUse.sidoCode.trim() && paramsToUse.sidoCode.trim() !== "all") ||
        (paramsToUse.houseNm && paramsToUse.houseNm.trim());
      const perPage = hasFilter ? "200" : "50";
      params.set("perPage", perPage);

      if (paramsToUse.houseNm) {
        params.set("houseNm", paramsToUse.houseNm);
      }
      if (paramsToUse.sidoCode) {
        params.set("sidoCode", paramsToUse.sidoCode);
      }
      if (paramsToUse.houseDtlSecd) {
        params.set("houseDtlSecd", paramsToUse.houseDtlSecd);
      }

      // 날짜 범위 파라미터 추가
      if (paramsToUse.startMonth) {
        // 시작일: 해당 월의 1일
        const [startYear, startMonth] = paramsToUse.startMonth.split('-');
        params.set("startDate", `${startYear}${startMonth}01`);
        // 모집공고일 범위 필터링을 위한 조건식
        params.set("cond[RCRIT_PBLANC_DE::GTE]", `${startYear}${startMonth}01`);
      }
      if (paramsToUse.endMonth) {
        // 종료일: 해당 월의 마지막 일
        const [endYear, endMonth] = paramsToUse.endMonth.split('-');
        const lastDay = new Date(parseInt(endYear), parseInt(endMonth), 0).getDate();
        params.set("endDate", `${endYear}${endMonth}${String(lastDay).padStart(2, '0')}`);
        params.set("cond[RCRIT_PBLANC_DE::LTE]", `${endYear}${endMonth}${String(lastDay).padStart(2, '0')}`);
      }

      const res = await fetch(`/api/cheongyak?${params.toString()}`);
      const json: ApiResponse = await res.json();

      if (json.errors && Object.keys(json.errors).length > 0) {
        setError(Object.values(json.errors)[0]);
        setData([]);
      } else {
        let filteredData = json.datasets.noticeList || [];

        // 주택명 검색은 클라이언트 측에서 필터링 (API가 지원하지 않을 수 있음)
        if (paramsToUse.houseNm && paramsToUse.houseNm.trim()) {
          const searchKeyword = paramsToUse.houseNm.trim().toLowerCase();
          filteredData = filteredData.filter((item: AptInfo) => {
            const houseNm = (item.HOUSE_NM || "").toLowerCase();
            const bsnsMbyNm = (item.BSNS_MBY_NM || "").toLowerCase(); // 시공사명
            return houseNm.includes(searchKeyword) || bsnsMbyNm.includes(searchKeyword);
          });
        }

        // 공공분양/임대 제외 (경쟁률 데이터 미제공)
        filteredData = filteredData.filter((item: AptInfo) => {
          const houseType = item.HOUSE_DTL_SECD_NM || "";
          return !houseType.includes("공공") && !houseType.includes("임대");
        });

        // 캐시 데이터와 API 데이터 병합
        console.log(`[Search] API Data: ${filteredData.length} items, Cache available: ${!!cacheToUse}`);
        let mergedData = mergeCacheAndApiData(
          cacheToUse,
          filteredData,
          paramsToUse.startMonth,
          paramsToUse.endMonth
        );
        console.log(`[Search] Merged Data (Date Filtered): ${mergedData.length} items`);

        // [중요] 병합된 데이터에 대해 클라이언트 필터링 적용 (캐시 데이터가 포함되어 있으므로 필수)

        // 1. 공공분양 제외 (전체 데이터 대상)
        mergedData = mergedData.filter((item: AptInfo) => {
          const houseType = (item.HOUSE_DTL_SECD_NM || "").trim();
          const houseName = (item.HOUSE_NM || "").trim();

          // 공공, 임대, 신혼희망타운 등이 포함되면 제외
          if (houseType.includes("공공") || houseName.includes("공공")) return false;
          if (houseType.includes("신혼희망") || houseName.includes("신혼희망")) return false;
          if (houseName.includes("국민임대") || houseName.includes("영구임대") || houseName.includes("행복주택")) return false;

          return true;
        });

        // 2. 지역 필터링 (코드 비교 OR 이름 포함)
        const beforeRegionFilter = mergedData.length;
        if (paramsToUse.sidoCode && paramsToUse.sidoCode !== "all") {
          const targetCode = paramsToUse.sidoCode;
          const targetName = SIDO_CODE_MAP[targetCode];
          console.log(`[Search] Region filter: targetCode=${targetCode}, targetName=${targetName}`);

          mergedData = mergedData.filter(item => {
            // 1. 코드가 일치하는가? (UI 코드 vs API 코드)
            if (item.SUBSCRPT_AREA_CODE === targetCode) return true;

            // 세종 특수 처리: 36 -> 338 (36 + "0" = 360은 충북이므로 잘못된 매칭)
            if (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") return true;

            // 제주 특수 처리: 50 -> 690 (50 + "0" = 500은 광주이므로 잘못된 매칭)
            if (targetCode === "50" && item.SUBSCRPT_AREA_CODE === "690") return true;

            if (targetCode !== "36" && targetCode !== "50" && item.SUBSCRPT_AREA_CODE === targetCode + "0") return true; // 41 -> 410 처리

            // 2. 이름이 정확히 일치하는가? (코드 매칭 실패 시 안전장치)
            if (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName) return true;

            return false;
          });
          console.log(`[Search] After region filter: ${beforeRegionFilter} -> ${mergedData.length}`);
        }

        // 3. 주택 구분 필터링
        const beforeHouseTypeFilter = mergedData.length;
        if (paramsToUse.houseDtlSecd && paramsToUse.houseDtlSecd !== "all") {
          console.log(`[Search] HouseType filter: houseDtlSecd=${paramsToUse.houseDtlSecd}`);
          mergedData = mergedData.filter(item => item.HOUSE_DTL_SECD === paramsToUse.houseDtlSecd);
          console.log(`[Search] After houseType filter: ${beforeHouseTypeFilter} -> ${mergedData.length}`);
        }

        // 4. 주택명 검색
        if (paramsToUse.houseNm && paramsToUse.houseNm.trim()) {
          const searchKeyword = paramsToUse.houseNm.trim().toLowerCase();
          mergedData = mergedData.filter((item: AptInfo) => {
            const houseNm = (item.HOUSE_NM || "").toLowerCase();
            const bsnsMbyNm = (item.BSNS_MBY_NM || "").toLowerCase();
            return houseNm.includes(searchKeyword) || bsnsMbyNm.includes(searchKeyword);
          });
          console.log(`[Search] After Keyword Filter ('${searchKeyword}'): ${mergedData.length} items`);
        }

        if (paramsToUse.saleType && paramsToUse.saleType !== "all") {
          const type = paramsToUse.saleType;
          mergedData = mergedData.filter((item: AptInfo) => {
            // RENT_SECD: 0(분양), 1(분양전환 가능임대), 2(분양전환 불가임대)
            // 캐시 데이터 등에서 RENT_SECD가 없는 경우 기본적으로 0(분양)으로 간주
            const rentSecd = item.RENT_SECD !== undefined ? String(item.RENT_SECD) : "0";

            if (type === "sale") return rentSecd === "0";
            if (type === "rent") return rentSecd === "1";
            if (type === "rentNo") return rentSecd === "2";
            return true;
          });
          console.log(`[Search] After Sale Type Filter: ${mergedData.length} items`);
        }

        // 지역 필터나 주택명 검색이 있을 때는 실제 필터링된 데이터 개수로 totalCount 업데이트
        const hasFilter = (paramsToUse.sidoCode && paramsToUse.sidoCode.trim() && paramsToUse.sidoCode.trim() !== "all") ||
          (paramsToUse.houseNm && paramsToUse.houseNm.trim());

        // 캐시 병합 데이터를 항상 사용 (필터 여부 무관)
        setData(mergedData);
        // 지도에는 항상 병합 데이터 사용
        setMapData(mergedData);
        // 메타데이터 업데이트
        const originalMetadata = json.metadata.noticeList;

        // 병합된 데이터 기준으로 메타데이터 설정
        setMetadata({
          ...originalMetadata,
          page: 1,
          perPage: mergedData.length,
          currentCount: mergedData.length,
          totalCount: mergedData.length,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(1);
  };

  // 상세정보 조회 함수
  const fetchDetail = useCallback(async (houseManageNo: string, pblancNo: string) => {
    if (!houseManageNo || !pblancNo) {
      setDetailRows([]);
      setDetailError("상세 조회에 필요한 식별자가 없습니다.");
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);
    setDatasetErrors({});
    setApplicationRows([]);
    setMissingSpecialRequestData(false);

    try {
      // 1. Static Detail File 확인 (가장 빠름)
      const staticDetail = await getStaticDetail(houseManageNo, pblancNo);

      let json: any = {};

      if (staticDetail) {
        // 정적 파일이 있으면 그것을 사용
        setApplicationRows(staticDetail.rows);
        setMissingSpecialRequestData(staticDetail.missingSpecialRequests);
        setApplicationTotals(staticDetail.totals);

        // 상세 정보(Notice)는 가져올 수 없으므로 빈 배열 혹은 API로 별도 요청 시도 가능
        // 하지만 대부분의 중요 정보(경쟁률)는 staticDetail에 있으므로 우선 표시
        setDetailRows([]);
      } else {
        // 2. 없으면 API 호출
        const params = new URLSearchParams({
          dataset: "notice,noticeModel,noticeCompetition,noticeSpecial",
          houseManageNo,
          pblancNo,
          perPage: "100"
        });
        const res = await fetch(`/api/cheongyak?${params.toString()}`);

        try {
          json = await res.json();
        } catch {
          json = {};
        }

        if (json.errors) {
          setDatasetErrors(json.errors);
        } else {
          setDatasetErrors({});
        }

        if (!res.ok) {
          const message = typeof json.error === "string" && json.error.trim().length > 0
            ? json.error
            : `API 요청 실패 (${res.status})`;
          throw new Error(message);
        }

        const rows = Array.isArray(json.datasets?.notice)
          ? (json.datasets.notice as NoticeDetailRow[])
          : [];
        setDetailRows(rows);

        const modelRows = Array.isArray(json.datasets?.noticeModel)
          ? (json.datasets.noticeModel as NoticeModelApiRow[])
          : [];
        const competitionRows = Array.isArray(json.datasets?.noticeCompetition)
          ? (json.datasets.noticeCompetition as NoticeCompetitionApiRow[])
          : [];
        const specialRows = Array.isArray(json.datasets?.noticeSpecial)
          ? (json.datasets.noticeSpecial as NoticeSpecialApiRow[])
          : [];

        const { rows: applicationSummary, missingSpecialRequests, totals } = buildApplicationRows(
          modelRows,
          competitionRows,
          specialRows
        );
        setApplicationRows(applicationSummary);
        setMissingSpecialRequestData(missingSpecialRequests);
        setApplicationTotals(totals);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "상세 데이터를 불러오지 못했습니다.";
      setDetailError(message);
      setDetailRows([]);
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      setApplicationTotals(null);
    } finally {
      setDetailLoading(false);
    }


  }, []);

  // 선택된 항목 변경 시 상세정보 조회
  useEffect(() => {
    if (!selectedItem?.HOUSE_MANAGE_NO || !selectedItem?.PBLANC_NO) {
      setDetailRows([]);
      setApplicationRows([]);
      setMissingSpecialRequestData(false);
      setApplicationTotals(null);
      return;
    }
    void fetchDetail(String(selectedItem.HOUSE_MANAGE_NO), String(selectedItem.PBLANC_NO));
  }, [fetchDetail, selectedItem]);

  // --- 정렬 및 페이지네이션 로직 ---
  const [itemsPerPage, setItemsPerPage] = useState(15);
  // 검색 조건이나 정렬 변경 시 페이지 초기화는 useEffect로 처리하거나 핸들러에서 처리

  // 필터링된 데이터 (검색 조건 적용 후)
  const filteredList = useMemo(() => {
    // 1. 기본 필터 (시도, 주택명, 공급유형 등) - 이미 data 상태는 API/캐시 필터링 후 2차 필터링 가능
    // 현재 data는 API/캐시 로더에서 이미 검색조건에 맞춰 가져온 것임.
    // 추가적인 클라이언트 사이드 필터가 있다면 여기서 적용.
    // 여기서는 data를 그대로 사용하거나, 필요시 정렬만 수행

    // 정렬: 최신순 (이미 API/캐시 로더가 대체로 정렬해주지만 확실하게)
    return [...data].sort((a, b) => {
      const dateA = a.RCRIT_PBLANC_DE || "";
      const dateB = b.RCRIT_PBLANC_DE || "";
      return dateB.localeCompare(dateA);
    });
  }, [data]);

  // 페이지 변경 시 스크롤 상단 이동
  useEffect(() => {
    // 데이터가 로드되거나 페이지가 바뀌면 리스트 상단으로 스크롤하지 않음 (사용자 경험 유지)
  }, [currentPage]);

  // 검색 조건 변경 시 페이지 1로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchParams, itemsPerPage]);

  // 현재 페이지 데이터 슬라이싱
  const paginatedList = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredList, currentPage, itemsPerPage]);

  // 총 페이지 수
  const totalPagesCount = Math.ceil(filteredList.length / itemsPerPage);

  // 페이지 네비게이션 핸들러
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPagesCount) {
      setCurrentPage(page);
    }
  };

  const handleRowClick = (item: AptInfo) => {
    setSelectedItem(item);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h1
        style={{ marginBottom: "24px", fontSize: "28px", fontWeight: "600", color: "#1a1a1a" }}
      >
        APT 분양정보 및 경쟁률 조회
      </h1>

      {/* 검색 필터 영역 */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "#fff9e6",
          border: "1px solid #ffd700",
          borderRadius: "8px",
          marginBottom: "30px",
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>안내:</strong> 청약 예정 또는 과거 5년 이내 공급주택의 분양정보와 경쟁률을 조회할 수 있습니다.
        </p>
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{ marginBottom: "20px", fontSize: "20px", fontWeight: "600", color: "#333" }}
        >
          주택 조회
        </h2>
        <SearchForm
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>

      <div>
        <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#333" }}>
            조회 결과
          </h2>
          {/* 탭 UI */}
          <div className={styles.tabContainer}>
            <button
              className={`${styles.tabButton} ${activeTab === "list" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("list")}
            >
              📋 목록
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "map" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("map")}
            >
              🗺️ 지도
            </button>
            <button
              className={`${styles.tabButton} ${activeTab === "table" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("table")}
            >
              📊 표
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: "6px",
            marginBottom: "20px",
            color: "#991b1b",
            fontSize: "14px",
            lineHeight: "1.5"
          }}>
            <strong>오류가 발생했습니다:</strong> {error}
          </div>
        )}

        {/* 목록 탭 */}
        {activeTab === "list" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "13px",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                <option value={15}>15개씩</option>
                <option value={30}>30개씩</option>
                <option value={50}>50개씩</option>
                <option value={100}>100개씩</option>
              </select>
            </div>
            <SearchResults
              data={paginatedList}
              loading={loading}
              extraData={extraData}
              totalCount={filteredList.length}
              onHouseNameClick={(item) => setSelectedItem(item)}
              onFetchExtra={fetchSingleExtraData}
            />
            {totalPagesCount > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPagesCount}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}

        {/* 지도 탭 */}
        {activeTab === "map" && (
          <>
            {mapLoading && (
              <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#f8f9fa", borderRadius: "8px", marginBottom: "16px" }}>
                <div style={{ marginBottom: "12px" }}>🗺️ 지도 데이터를 불러오는 중...</div>
                <div style={{ fontSize: "13px", color: "#666" }}>전체 청약 데이터를 집계 중입니다. 잠시만 기다려 주세요.</div>
              </div>
            )}
            <CompetitionRateMap
              data={mapData}
              extraData={extraData}
              archiveCache={archiveCache}
              rateType={mapRateType}
              startDate={mapStartDate}
              endDate={mapEndDate}
              onRateTypeChange={setMapRateType}
              onDateChange={(start, end) => {
                setMapStartDate(start);
                setMapEndDate(end);
              }}
              onItemClick={(item) => setSelectedItem(item)}
            />
          </>
        )}

        {/* 표 탭 */}
        {activeTab === "table" && (
          <>
            <StatsDashboard
              data={mapData.length > 0 ? mapData : data}
              extraData={extraData}
              archiveCache={archiveCache}
            />
            <CompetitionTable
              data={mapData.length > 0 ? mapData : data}
              extraData={extraData}
              archiveCache={archiveCache}
              loading={loading || mapLoading}
              totalCount={data.length}
              onExcelDownload={() => {
                // 엑셀 다운로드 핸들러
                const tableData = mapData.length > 0 ? mapData : data;
                const getStats = (item: AptInfo) => {
                  const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                  return archiveCache?.calculatedStats?.[key]?.totals?.stages || extraData[key]?.totals?.stages || null;
                };

                const rows = tableData.map(item => {
                  const stats = getStats(item);
                  return {
                    지역: item.SUBSCRPT_AREA_CODE_NM || "-",
                    주택명: item.HOUSE_NM || "-",
                    시공사: item.BSNS_MBY_NM || "-",
                    모집공고일: item.RCRIT_PBLANC_DE || "-",
                    청약시작: item.RCEPT_BGNDE || "-",
                    청약종료: item.RCEPT_ENDDE || "-",
                    공급세대수: item.TOT_SUPLY_HSHLDCO || 0,
                    분양가: item.LTTOT_TOP_AMOUNT || 0,
                    특공경쟁률: stats?.special?.rate?.toFixed(2) || "-",
                    "1순위경쟁률": stats?.rank1?.rate?.toFixed(2) || "-",
                    "2순위경쟁률": stats?.rank2?.rate?.toFixed(2) || "-",
                    전체경쟁률: stats?.total?.rate?.toFixed(2) || "-",
                  };
                });

                // CSV 생성 및 다운로드
                const headers = Object.keys(rows[0] || {});
                const csvContent = [
                  headers.join(","),
                  ...rows.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(","))
                ].join("\n");

                const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `청약경쟁률_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            />
          </>
        )}

        {/* 상세정보 모달 */}
        {selectedItem && (
          <DetailModal
            item={selectedItem}
            detailRows={detailRows}
            detailLoading={detailLoading}
            detailError={detailError}
            datasetErrors={datasetErrors}
            applicationRows={applicationRows}
            missingSpecialRequestData={missingSpecialRequestData}
            applicationTotals={applicationTotals}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </div>
  );
}

function SearchForm({
  searchParams,
  setSearchParams,
  onSubmit,
  loading,
}: {
  searchParams: any;
  setSearchParams: any;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
}) {
  // 과거 5년부터 미래 12개월까지 선택 가능
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const startYear = currentYear - 5;
  const startMonth = currentMonth;
  const totalMonths = 5 * 12 + 12; // 과거 5년 + 미래 12개월

  const months = [];
  for (let i = 0; i < totalMonths; i++) {
    const date = new Date(startYear, startMonth - 1 + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    months.push({ value: `${year}-${month}`, label: `${year}년 ${month}월` });
  }

  return (
    <div className={styles.searchFormContainer}>
      <form onSubmit={onSubmit}>
        <div className={styles.formRow}>
          <label className={styles.label}>
            조회 기간:
          </label>
          <select
            value={searchParams.startMonth}
            onChange={(e) => setSearchParams({ ...searchParams, startMonth: e.target.value })}
            className={styles.select}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <span style={{ fontSize: "14px", color: "#666" }}>~</span>
          <select
            value={searchParams.endMonth}
            onChange={(e) => setSearchParams({ ...searchParams, endMonth: e.target.value })}
            className={styles.select}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label}>
            주택 구분:
          </label>
          <select
            value={searchParams.houseDtlSecd}
            onChange={(e) => setSearchParams({ ...searchParams, houseDtlSecd: e.target.value })}
            className={`${styles.select} ${styles.flex1}`}
          >
            <option value="">전체</option>
            <option value="01">민영</option>
            <option value="03">국민</option>
          </select>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label}>
            공급 지역:
          </label>
          <select
            value={searchParams.sidoCode}
            onChange={(e) => setSearchParams({ ...searchParams, sidoCode: e.target.value })}
            className={`${styles.select} ${styles.flex1}`}
          >
            <option value="">전체</option>
            <option value="11">서울특별시</option>
            <option value="26">부산광역시</option>
            <option value="27">대구광역시</option>
            <option value="28">인천광역시</option>
            <option value="29">광주광역시</option>
            <option value="30">대전광역시</option>
            <option value="31">울산광역시</option>
            <option value="36">세종특별자치시</option>
            <option value="41">경기도</option>
            <option value="42">강원도</option>
            <option value="43">충청북도</option>
            <option value="44">충청남도</option>
            <option value="45">전라북도</option>
            <option value="46">전라남도</option>
            <option value="47">경상북도</option>
            <option value="48">경상남도</option>
            <option value="50">제주특별자치도</option>
          </select>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label}>
            주택명 또는 시공사명:
          </label>
          <input
            type="text"
            value={searchParams.houseNm}
            onChange={(e) => setSearchParams({ ...searchParams, houseNm: e.target.value })}
            className={`${styles.input} ${styles.flex1}`}
            placeholder="주택명 또는 시공사명을 입력하세요"
          />
          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>

        <div className={styles.formRow}>
          <label className={`${styles.label} ${styles.radioLabel}`} style={{ cursor: "default", marginRight: "20px" }}>
            분양·임대 구분:
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="saleType"
              value="all"
              checked={searchParams.saleType === "all"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              className={styles.radioInput}
            /> 전체
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="saleType"
              value="sale"
              checked={searchParams.saleType === "sale"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              className={styles.radioInput}
            /> 분양주택
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="saleType"
              value="rent"
              checked={searchParams.saleType === "rent"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              className={styles.radioInput}
            /> 분양전환 가능임대
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="saleType"
              value="rentNo"
              checked={searchParams.saleType === "rentNo"}
              onChange={(e) => setSearchParams({ ...searchParams, saleType: e.target.value })}
              className={styles.radioInput}
            /> 분양전환 불가임대
          </label>
        </div>

        <button
          type="button"
          className={styles.notificationButton}
        >
          알림 설정
        </button>
      </form>
    </div>
  );
}

// 청약 일정 판단을 위한 유틸리티 함수
function parseCheongyakDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // "20241231" 또는 "2024-12-31" 형식 지원
  const cleanDate = dateStr.replace(/-/g, "");
  if (cleanDate.length !== 8) return null;

  const year = parseInt(cleanDate.substring(0, 4));
  const month = parseInt(cleanDate.substring(4, 6)) - 1;
  const day = parseInt(cleanDate.substring(6, 8));

  return new Date(year, month, day);
}

function getCheongyakStatus(
  receiptEnd: string,
  announceDate: string
): { text: string; color: string; isActionable: boolean } {
  const today = new Date();
  // 시간을 00:00:00으로 설정하여 날짜 비교
  today.setHours(0, 0, 0, 0);

  const endDate = parseCheongyakDate(receiptEnd);
  const announce = parseCheongyakDate(announceDate);

  if (!endDate) return { text: "일정 미정", color: "#999", isActionable: false };

  // 접수 종료일이 오늘보다 미래이면 접수중 또는 예정
  if (today <= endDate) {
    return { text: "청약 접수중/예정", color: "#0066cc", isActionable: false };
  }

  // 접수 종료일이 지났고, 당첨자 발표일이 없거나 오늘보다 미래이면
  if (announce && today < announce) {
    return { text: "접수 마감", color: "#ff9800", isActionable: false };
  }

  // 그 외 (발표일 지남)
  return { text: "📊 결과 확인", color: "#28a745", isActionable: true };
}

function SearchResults({
  data,
  loading,
  extraData,
  totalCount,
  onHouseNameClick,
  onFetchExtra,
}: {
  data: AptInfo[];
  loading: boolean;
  extraData: Record<string, any>;
  totalCount: number;
  onHouseNameClick: (item: AptInfo) => void;
  onFetchExtra: (houseManageNo: string, pblancNo: string) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 모집공고일 기준 내림차순 정렬 (최신이 상단에)
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const dateA = a.RCRIT_PBLANC_DE || '';
      const dateB = b.RCRIT_PBLANC_DE || '';
      return dateB.localeCompare(dateA); // 내림차순
    });
  }, [data]);

  const handleRowClick = (item: AptInfo) => {
    const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
    if (expandedId === key) {
      setExpandedId(null);
    } else {
      setExpandedId(key);
      if (!extraData[key] && item.HOUSE_MANAGE_NO && item.PBLANC_NO) {
        onFetchExtra(String(item.HOUSE_MANAGE_NO), String(item.PBLANC_NO));
      }
    }
  };

  return (
    <div>
      <div style={{
        marginBottom: "16px",
        padding: "12px 16px",
        backgroundColor: "#f8f9fa",
        borderRadius: "4px",
        fontSize: "13px",
        lineHeight: "1.6",
        color: "#495057"
      }}>
        <p style={{ margin: "0 0 8px 0" }}>
          • <strong>주택명</strong>을 클릭하면 상세 타입별 경쟁률이 아래로 펼쳐집니다.
        </p>
        <p style={{ margin: "0 0 8px 0" }}>
          • 주택명, 청약기간, 당첨자발표 컬럼 헤더를 클릭하면 정렬 가능합니다. (추후 구현 예정)
        </p>
        <p style={{ margin: 0 }}>
          • 본 정보는 참고용이며, 청약 신청 시 반드시 해당 입주자모집공고 내용을 확인하시기 바랍니다.
        </p>
      </div>

      <div style={{ textAlign: "right", marginBottom: "12px" }}>
        <strong style={{ fontSize: "14px", color: "#333" }}>총 {totalCount.toLocaleString()}건</strong>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className={styles.resultsContainer}>
          <table className={styles.table}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th className={styles.th} style={{ width: "5%" }}>지역</th>
                <th className={styles.th} style={{ width: "6%" }}>주택구분</th>
                <th className={styles.th} style={{ width: "6%" }}>분양/임대</th>
                <th className={styles.th} style={{ width: "22%" }}>주택명</th>
                <th className={styles.th} style={{ width: "12%" }}>시공사</th>
                <th className={styles.th} style={{ width: "6%" }}>문의처</th>
                <th className={styles.th} style={{ width: "8%" }}>모집공고일</th>
                <th className={styles.th} style={{ width: "9%" }}>청약기간</th>
                <th className={styles.th} style={{ width: "8%" }}>당첨자발표</th>
                <th className={styles.th} style={{ width: "10%" }}>특별공급 신청현황</th>
                <th className={styles.th} style={{ width: "8%" }}>1·2순위 경쟁률</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: "40px", textAlign: "center" }}>조회 중...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "60px 40px", textAlign: "center", color: "#999", fontSize: "14px" }}>
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedData.map((item) => {
                  const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                  const isExpanded = expandedId === key;
                  return (
                    <React.Fragment key={key}>
                      <tr style={{ backgroundColor: isExpanded ? "#f0f7ff" : "transparent" }}>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.SUBSCRPT_AREA_CODE_NM || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.HOUSE_DTL_SECD_NM || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>분양주택</td>
                        <td
                          className={styles.td}
                          style={{ verticalAlign: "top" }}
                          onClick={() => handleRowClick(item)}
                        >
                          <div className={styles.houseName} style={{ fontWeight: isExpanded ? "bold" : "normal" }}>
                            {item.HOUSE_NM || "-"}
                          </div>
                        </td>
                        <td className={styles.td} style={{ verticalAlign: "top" }}>
                          <div>{item.BSNS_MBY_NM || "-"}</div>
                        </td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.BSNS_MBY_TELNO || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.RCRIT_PBLANC_DE || "-"}</td>
                        <td className={styles.td} style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.4" }}>
                          {item.RCEPT_BGNDE && item.RCEPT_ENDDE ? `${item.RCEPT_BGNDE} ~ ${item.RCEPT_ENDDE}` : "-"}
                        </td>
                        <td className={styles.td} style={{ whiteSpace: "nowrap" }}>{item.PRZWNER_PRESNATN_DE || "-"}</td>
                        <td className={styles.td} style={{ textAlign: "center", color: "#777", fontSize: "13px" }}>
                          {(() => {
                            const extra = extraData[key]?.totals || extraData[key];
                            if (extra?.stages?.special) {
                              const total = extra.stages.special.request;
                              if (total !== null && total > 0) {
                                return (
                                  <div style={{ color: "#2d3436" }}>
                                    <div style={{ fontWeight: "600" }}>{total.toLocaleString()}건</div>
                                    <div style={{ fontSize: "11px", color: "#636e72" }}>
                                      ({formatRate(extra.stages.special.request, extra.stages.special.target)})
                                    </div>
                                  </div>
                                );
                              }
                            }
                            return <span style={{ fontStyle: "italic" }}>주택명 클릭 확인</span>;
                          })()}
                        </td>
                        <td className={styles.td} style={{ textAlign: "center" }}>
                          {(() => {
                            const extra = extraData[key]?.totals || extraData[key];
                            if (extra?.stages?.total) {
                              const total = extra.stages.total.request;
                              if (total !== null && total > 0) {
                                return (
                                  <div style={{ color: "#0066cc" }}>
                                    <div style={{ fontWeight: "700" }}>{total.toLocaleString()}건</div>
                                    <div style={{ fontSize: "11px" }}>
                                      ({formatRate(extra.stages.total.request, extra.stages.total.target)})
                                    </div>
                                  </div>
                                );
                              }
                            }
                            const status = getCheongyakStatus(item.RCEPT_ENDDE || "", item.PRZWNER_PRESNATN_DE || "");
                            return <span style={{ color: status.color, fontWeight: status.isActionable ? "600" : "normal" }}>{status.text}</span>;
                          })()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={11} style={{ padding: "0", border: "1px solid #ddd", backgroundColor: "#fff" }}>
                            <div style={{ padding: "20px", borderTop: "2px solid #0066cc" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                                <h4 style={{ margin: 0, fontSize: "16px", color: "#1a1a1a" }}>청약 타입별 상세 결과</h4>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <button onClick={() => setExpandedId(null)} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer", border: "1px solid #ddd", borderRadius: "4px", backgroundColor: "#fff" }}>닫기 ✕</button>
                                </div>
                              </div>
                              {!extraData[key] ? (
                                <div style={{ textAlign: "center", padding: "40px", color: "#666" }}>데이터를 불러오는 중입니다...</div>
                              ) : (
                                <ExpandedDetailContent data={extraData[key]} item={item} />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Mobile Card View */}
          <div className={styles.mobileCardList}>
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center" }}>조회 중...</div>
            ) : data.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#999", border: "1px solid #ddd", borderRadius: "8px" }}>
                조회 결과가 없습니다.
              </div>
            ) : (
              data.map((item) => {
                const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
                const isExpanded = expandedId === key;
                const status = getCheongyakStatus(item.RCEPT_ENDDE || "", item.PRZWNER_PRESNATN_DE || "");

                return (
                  <div key={key} className={styles.mobileCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.cardTitle} onClick={() => handleRowClick(item)}>
                          {item.HOUSE_NM || "-"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>{item.BSNS_MBY_NM}</div>
                      </div>
                      <span
                        className={styles.cardBadge}
                        style={{
                          backgroundColor: status.color + "20",
                          color: status.color,
                          border: `1px solid ${status.color}`
                        }}
                      >
                        {status.text}
                      </span>
                    </div>

                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>지역/유형</span>
                      <span className={styles.cardValue}>{item.SUBSCRPT_AREA_CODE_NM} · {item.HOUSE_DTL_SECD_NM}</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>청약기간</span>
                      <span className={styles.cardValue}>
                        {item.RCEPT_BGNDE && item.RCEPT_ENDDE ? `${parseCheongyakDate(item.RCEPT_BGNDE)?.getMonth()! + 1}/${parseCheongyakDate(item.RCEPT_BGNDE)?.getDate()} ~ ${parseCheongyakDate(item.RCEPT_ENDDE)?.getMonth()! + 1}/${parseCheongyakDate(item.RCEPT_ENDDE)?.getDate()}` : "-"}
                      </span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>당첨발표</span>
                      <span className={styles.cardValue}>{item.PRZWNER_PRESNATN_DE}</span>
                    </div>

                    {/* Competition Summary */}
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>경쟁률</span>
                      <span className={styles.cardValue}>
                        {(() => {
                          const extra = extraData[key]?.totals || extraData[key];
                          if (extra?.stages?.total?.request) {
                            return <span style={{ color: "#0066cc" }}>{formatRate(extra.stages.total.request, extra.stages.total.target)} ({extra.stages.total.request.toLocaleString()}건)</span>;
                          }
                          return "-";
                        })()}
                      </span>
                    </div>

                    <button
                      className={styles.expandButton}
                      onClick={() => handleRowClick(item)}
                    >
                      {isExpanded ? "접기 ▲" : "상세보기 ▼"}
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                        {!extraData[key] ? (
                          <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>로딩 중...</div>
                        ) : (
                          <ExpandedDetailContent data={extraData[key]} item={item} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = [];
  const startPage = Math.max(1, currentPage - 5);
  const endPage = Math.min(totalPages, startPage + 9);

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div style={{
      marginTop: "20px",
      display: "flex",
      justifyContent: "center",
      gap: "5px",
      alignItems: "center"
    }}>
      <button
        onClick={() => onPageChange(1)}
        disabled={currentPage === 1}
        style={{
          padding: "5px 10px",
          border: "1px solid #ddd",
          backgroundColor: "white",
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          opacity: currentPage === 1 ? 0.5 : 1
        }}
      >
        &lt;&lt;
      </button>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        style={{
          padding: "5px 10px",
          border: "1px solid #ddd",
          backgroundColor: "white",
          cursor: currentPage === 1 ? "not-allowed" : "pointer",
          opacity: currentPage === 1 ? 0.5 : 1
        }}
      >
        &lt;
      </button>
      {pages.map((num) => (
        <button
          key={num}
          onClick={() => onPageChange(num)}
          style={{
            padding: "5px 10px",
            border: "1px solid #ddd",
            backgroundColor: num === currentPage ? "#0066cc" : "white",
            color: num === currentPage ? "white" : "black",
            cursor: "pointer"
          }}
        >
          {num}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{
          padding: "5px 10px",
          border: "1px solid #ddd",
          backgroundColor: "white",
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          opacity: currentPage === totalPages ? 0.5 : 1
        }}
      >
        &gt;
      </button>
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={currentPage === totalPages}
        style={{
          padding: "5px 10px",
          border: "1px solid #ddd",
          backgroundColor: "white",
          cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          opacity: currentPage === totalPages ? 0.5 : 1
        }}
      >
        &gt;&gt;
      </button>
    </div>
  );
}

// 상세정보 모달 컴포넌트
function DetailModal({
  item,
  detailRows,
  detailLoading,
  detailError,
  datasetErrors,
  applicationRows,
  missingSpecialRequestData,
  applicationTotals,
  onClose,
}: {
  item: AptInfo;
  detailRows: NoticeDetailRow[];
  detailLoading: boolean;
  detailError: string | null;
  datasetErrors: Record<string, string>;
  applicationRows: any[];
  missingSpecialRequestData: boolean;
  applicationTotals: any | null;
  onClose: () => void;
}) {
  const FIELD_SECTIONS = [
    {
      title: "기본 정보",
      fields: [
        { key: "HOUSE_NM", label: "주택명" },
        { key: "HSSPLY_ADRES", label: "공급위치" },
        { key: "TOT_SUPLY_HSHLDCO", label: "총 공급 세대수" },
        { key: "SUPLY_AR", label: "공급 규모" },
        { key: "HMPG_URL", label: "모집공고 URL" },
        { key: "BSNS_MBY_NM", label: "사업주체" },
        { key: "BSNS_MBY_TELNO", label: "사업주체 문의처" },
        { key: "MNGT_INSTT_NM", label: "관리기관" },
        { key: "MNGT_INSTT_TELNO", label: "관리기관 문의처" },
      ],
    },
    {
      title: "청약 일정",
      fields: [
        { key: "RCEPT_BGNDE", label: "청약접수 시작" },
        { key: "RCEPT_ENDDE", label: "청약접수 종료" },
        { key: "PRZWNER_PRESNATN_DE", label: "당첨자 발표일" },
        { key: "CNTRCT_CNCLS_BGNDE", label: "계약 시작" },
        { key: "CNTRCT_CNCLS_ENDDE", label: "계약 종료" },
        { key: "SUBSCRPT_AREA_CODE_NM", label: "접수 지역" },
        { key: "RCEPT_SE_NM", label: "접수 방식" },
        { key: "RCEPT_PLACE", label: "접수 장소" },
      ],
    },
  ];

  function buildSectionData(row: NoticeDetailRow) {
    const usedKeys = new Set<string>();

    const sections = FIELD_SECTIONS.map(({ title, fields }) => {
      const items = fields
        .map(({ key, label }) => {
          const value = row[key];
          if (value === undefined || value === null || value === "") {
            return null;
          }
          usedKeys.add(key);
          return { key, label, value } as { key: string; label: string; value: unknown };
        })
        .filter((item): item is { key: string; label: string; value: unknown } => item !== null);
      return { title, items };
    });

    return sections.filter((section) => section.items.length > 0);
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          maxWidth: "1200px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "24px",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            padding: "8px 16px",
            backgroundColor: "#f0f0f0",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
          title="모달 닫기"
        >
          ✕
        </button>

        <h2 style={{ marginBottom: "24px", fontSize: "24px", fontWeight: "600" }}>
          {item.HOUSE_NM || "상세 정보"}
        </h2>

        {detailLoading && (
          <div style={{ padding: "40px", textAlign: "center" }}>조회 중...</div>
        )}

        {detailError && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: "6px",
            marginBottom: "20px",
            color: "#991b1b",
          }}>
            <strong>오류:</strong> {detailError}
          </div>
        )}

        {Object.entries(datasetErrors).map(([key, error]) => (
          <div key={key} style={{
            marginBottom: "16px",
            padding: "14px",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "10px",
            color: "#92400e",
            fontSize: "14px"
          }}>
            {key} 조회 오류: {error}
          </div>
        ))}

        {detailRows.map((row, index) => {
          const sections = buildSectionData(row);
          return (
            <article key={index} style={{ marginBottom: 32, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              <header style={{ padding: "16px 20px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>{String(row["HOUSE_NM"] ?? "모집공고")}</h3>
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  주택관리번호 {formatValue(row["HOUSE_MANAGE_NO"])}, 모집공고번호 {formatValue(row["PBLANC_NO"])}
                </p>
              </header>

              {sections.map((section) => (
                <section key={section.title} style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                  <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{section.title}</h4>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {section.items.map((item) => (
                        <tr key={item.key}>
                          <th style={{ width: "35%", textAlign: "left", padding: "8px 12px", background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600 }}>
                            {item.label}
                          </th>
                          <td style={{ padding: "8px 12px", border: "1px solid #e5e7eb", fontSize: 13, color: "#374151" }}>
                            {formatValue(item.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </article>
          );
        })}

        {/* 청약 접수 결과 테이블 */}
        {applicationRows.length > 0 && (
          <section style={{ marginTop: 24, marginBottom: 24, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
            <header style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>청약 접수 결과</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  API 제공 데이터 기준(대상·접수·경쟁률, 특별공급 실접수 포함)으로 구성했습니다.
                </p>
              </div>
            </header>

            <div className="table-responsive" style={{ overflowX: "auto" }}>
              <table className="table-results" style={{ minWidth: 1100 }}>
                <colgroup>
                  <col style={{ width: "100px" }} /> {/* 타입 */}
                  <col style={{ width: "90px" }} /> {/* 공급면적 */}
                  <col style={{ width: "90px" }} /> {/* 공급평형 */}
                  <col style={{ width: "70px" }} /> {/* 공급 일반 */}
                  <col style={{ width: "70px" }} /> {/* 공급 특별 */}
                  <col style={{ width: "70px" }} /> {/* 공급 합계 */}
                  <col style={{ width: "100px" }} /> {/* 최고 분양가 */}
                  <col style={{ width: "70px" }} /> {/* 특별공급 대상 */}
                  <col style={{ width: "120px" }} /> {/* 특별공급 접수 */}
                  <col style={{ width: "80px" }} /> {/* 특별공급 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 1순위 대상 */}
                  <col style={{ width: "100px" }} /> {/* 1순위 접수 */}
                  <col style={{ width: "80px" }} /> {/* 1순위 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 2순위 대상 */}
                  <col style={{ width: "100px" }} /> {/* 2순위 접수 */}
                  <col style={{ width: "80px" }} /> {/* 2순위 경쟁률 */}
                  <col style={{ width: "70px" }} /> {/* 합계 대상 */}
                  <col style={{ width: "80px" }} /> {/* 합계 접수 */}
                  <col style={{ width: "80px" }} /> {/* 합계 경쟁률 */}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} scope="col">타입</th>
                    <th rowSpan={2} scope="col" className="numeric">공급면적(㎡)</th>
                    <th rowSpan={2} scope="col" className="numeric">공급평형(평)</th>
                    <th colSpan={3} scope="colgroup">공급세대</th>
                    <th rowSpan={2} scope="col" className="numeric">최고 분양가(만원)</th>
                    <th colSpan={3} scope="colgroup">특별공급</th>
                    <th colSpan={3} scope="colgroup">1순위 접수</th>
                    <th colSpan={3} scope="colgroup">2순위 접수</th>
                    <th colSpan={3} scope="colgroup">합계</th>
                  </tr>
                  <tr>
                    <th scope="col" className="numeric">일반</th>
                    <th scope="col" className="numeric">특별</th>
                    <th scope="col" className="numeric">합계</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                    <th scope="col" className="numeric">대상</th>
                    <th scope="col" className="numeric">접수</th>
                    <th scope="col" className="numeric">경쟁률</th>
                  </tr>
                </thead>
                <tbody>
                  {applicationRows.map((row) => (
                    <tr key={row.modelNo}>
                      <td data-label="타입" style={{ fontWeight: 600 }}>{row.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric">{row.areaSqm ? `${row.areaSqm.toFixed(2)}` : "-"}</td>
                      <td data-label="공급평형(평)" className="numeric">{row.areaPyeong ? `${row.areaPyeong.toFixed(1)}` : "-"}</td>
                      <td data-label="공급 일반" className="numeric">{formatNumber(row.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric">{formatNumber(row.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric">{formatNumber(row.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric">{formatPriceTenThousand(row.priceThousand)}</td>
                      <td data-label="특별공급 대상" className="numeric">{formatNumber(row.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.special.request)}</div>
                        {row.specialRequests && formatSpecialRequestEntries(row.specialRequests).length > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            {formatSpecialRequestEntries(row.specialRequests).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td data-label="특별공급 경쟁률" className="numeric">{formatRate(row.stages.special.request, row.stages.special.target)}</td>
                      <td data-label="1순위 대상" className="numeric">{formatNumber(row.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank1.request)}</div>
                        {(row.stages.rank1.localRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank1.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank1.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="1순위 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.rank1.request, row.stages.rank1.target)}</div>
                        {formatDifference(row.stages.rank1.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.rank1.remaining)}</div>
                        )}
                      </td>
                      <td data-label="2순위 대상" className="numeric">{formatNumber(row.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="wrap">
                        <div style={{ textAlign: "right" }}>{formatNumber(row.stages.rank2.request)}</div>
                        {(row.stages.rank2.localRequest ?? 0) + (row.stages.rank2.etcRequest ?? 0) > 0 && (
                          <div className="special-details" style={{ textAlign: "right" }}>
                            해당 {formatNumber(row.stages.rank2.localRequest ?? 0)} / 기타 {formatNumber(row.stages.rank2.etcRequest ?? 0)}
                          </div>
                        )}
                      </td>
                      <td data-label="2순위 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.rank2.request, row.stages.rank2.target)}</div>
                        {formatDifference(row.stages.rank2.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.rank2.remaining)}</div>
                        )}
                      </td>
                      <td data-label="합계 대상" className="numeric">{formatNumber(row.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric">{formatNumber(row.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric">
                        <div>{formatRate(row.stages.total.request, row.stages.total.target)}</div>
                        {formatDifference(row.stages.total.remaining) && (
                          <div className="special-details">{formatDifference(row.stages.total.remaining)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {applicationTotals && (
                  <tfoot>
                    <tr style={{ background: "#f9fafb", fontWeight: 600 }}>
                      <td data-label="타입">{applicationTotals.houseType}</td>
                      <td data-label="공급면적(㎡)" className="numeric">-</td>
                      <td data-label="공급평형(평)" className="numeric">-</td>
                      <td data-label="공급 일반" className="numeric">{formatNumber(applicationTotals.supplyGeneral)}</td>
                      <td data-label="공급 특별" className="numeric">{formatNumber(applicationTotals.supplySpecial)}</td>
                      <td data-label="공급 합계" className="numeric">{formatNumber(applicationTotals.supplyTotal)}</td>
                      <td data-label="최고 분양가(만원)" className="numeric">-</td>
                      <td data-label="특별공급 대상" className="numeric">{formatNumber(applicationTotals.stages.special.target)}</td>
                      <td data-label="특별공급 접수" className="numeric">{formatNumber(applicationTotals.stages.special.request)}</td>
                      <td data-label="특별공급 경쟁률" className="numeric">{formatRate(applicationTotals.stages.special.request, applicationTotals.stages.special.target)}</td>
                      <td data-label="1순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank1.target)}</td>
                      <td data-label="1순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank1.request)}</td>
                      <td data-label="1순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank1.request, applicationTotals.stages.rank1.target)}</td>
                      <td data-label="2순위 대상" className="numeric">{formatNumber(applicationTotals.stages.rank2.target)}</td>
                      <td data-label="2순위 접수" className="numeric">{formatNumber(applicationTotals.stages.rank2.request)}</td>
                      <td data-label="2순위 경쟁률" className="numeric">{formatRate(applicationTotals.stages.rank2.request, applicationTotals.stages.rank2.target)}</td>
                      <td data-label="합계 대상" className="numeric">{formatNumber(applicationTotals.stages.total.target)}</td>
                      <td data-label="합계 접수" className="numeric">{formatNumber(applicationTotals.stages.total.request)}</td>
                      <td data-label="합계 경쟁률" className="numeric">{formatRate(applicationTotals.stages.total.request, applicationTotals.stages.total.target)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div style={{ padding: "12px 20px", fontSize: 12, color: "#6b7280", borderTop: "1px solid #e5e7eb" }}>
              <div>※ 경쟁률 = 접수 ÷ 대상, 금액 단위: 만원 기준</div>
              {missingSpecialRequestData && (
                <div>※ 특별공급 접수 인원은 현재 공개된 API에서 제공되지 않아 '-'로 표기됩니다.</div>
              )}
            </div>

            {/* 하단 닫기 버튼 */}
            <div style={{ padding: "20px", textAlign: "center", borderTop: "1px solid #e5e7eb", marginTop: "16px" }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 32px",
                  backgroundColor: "#0066cc",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: "500",
                  minWidth: "120px",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#0052a3";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "#0066cc";
                }}
              >
                닫기
              </button>
            </div>
          </section>
        )}

        {/* 모달 하단 닫기 버튼 (상세정보만 있고 청약 접수 결과가 없는 경우) */}
        {detailRows.length > 0 && applicationRows.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", borderTop: "1px solid #e5e7eb", marginTop: "24px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 32px",
                backgroundColor: "#0066cc",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "500",
                minWidth: "120px",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#0052a3";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#0066cc";
              }}
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedDetailContent({ data, item }: { data: any, item: AptInfo }) {
  const { rows, totals, missingSpecialRequests } = data;

  if (!rows || rows.length === 0) {
    return <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>상세 데이터가 없습니다.</div>;
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className={styles.mobileOnly}>
        {rows.map((row: any, idx: number) => (
          <div key={idx} className={styles.detailCard}>
            <div className={styles.detailHeader}>
              <span className={styles.detailType}>{row.houseType}</span>
              <span className={styles.detailPrice}>{formatPriceTenThousand(row.priceThousand)}</span>
            </div>

            <div className={styles.detailRow} style={{ marginBottom: "12px" }}>
              <span className={styles.detailLabel}>공급세대</span>
              <span className={styles.detailValue}>
                일반 {formatNumber(row.supplyGeneral)} / 특별 {formatNumber(row.supplySpecial)}
              </span>
            </div>

            {/* Special Supply */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>특별공급</div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>경쟁률</span>
                <span className={styles.detailValue} style={{ color: "#0066cc", fontWeight: "bold" }}>
                  {formatRate(row.stages.special.request, row.stages.special.target)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>접수/모집</span>
                <span className={styles.detailValue}>
                  {formatNumber(row.stages.special.request)} / {formatNumber(row.stages.special.target)}
                </span>
              </div>
            </div>

            {/* Rank 1 */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>1순위</div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>경쟁률</span>
                <span className={styles.detailValue} style={{ color: "#0066cc", fontWeight: "bold" }}>
                  {formatRate(row.stages.rank1.request, row.stages.rank1.target)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>접수/모집</span>
                <span className={styles.detailValue}>
                  {formatNumber(row.stages.rank1.request)} / {formatNumber(row.stages.rank1.target)}
                </span>
              </div>
            </div>

            {/* Rank 2 - Only show if relevant */}
            {(row.stages.rank2.target > 0 || row.stages.rank2.request > 0) && (
              <div className={styles.detailSection}>
                <div className={styles.detailSectionTitle}>2순위</div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>경쟁률</span>
                  <span className={styles.detailValue}>
                    {formatRate(row.stages.rank2.request, row.stages.rank2.target)}
                  </span>
                </div>
              </div>
            )}

            {/* Total */}
            <div className={styles.detailSection} style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #eee" }}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel} style={{ fontWeight: "bold", color: "#333" }}>총 경쟁률</span>
                <span className={styles.detailValue} style={{ color: "#0066cc", fontWeight: "bold", fontSize: "14px" }}>
                  {formatRate(row.stages.total.request, row.stages.total.target)}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div style={{ padding: "12px", fontSize: "11px", color: "#888", textAlign: "center" }}>
          ※ 금액 단위: 만원
        </div>
      </div>

      {/* Desktop Table View */}
      <div className={`${styles.tableWrapper} ${styles.desktopOnly}`}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1200px", fontSize: "12px", border: "1px solid #eee" }}>
          <thead>
            <tr style={{ backgroundColor: "#f8f9fa" }}>
              <th rowSpan={2} style={{ padding: "8px", border: "1px solid #eee", position: "sticky", left: 0, backgroundColor: "#f8f9fa", zIndex: 1, minWidth: "100px" }}>타입</th>
              <th colSpan={2} style={{ padding: "8px", border: "1px solid #eee" }}>공급세대</th>
              <th rowSpan={2} style={{ padding: "8px", border: "1px solid #eee" }}>최고분양가</th>
              <th colSpan={3} style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#fff5f5" }}>특별공급</th>
              <th colSpan={3} style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#f0f7ff" }}>1순위</th>
              <th colSpan={3} style={{ padding: "8px", border: "1px solid #eee" }}>2순위</th>
              <th colSpan={3} style={{ padding: "8px", border: "1px solid #eee", fontWeight: "bold" }}>합계</th>
            </tr>
            <tr style={{ backgroundColor: "#f8f9fa" }}>
              <th style={{ padding: "8px", border: "1px solid #eee" }}>일반</th>
              <th style={{ padding: "8px", border: "1px solid #eee" }}>특별</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#fff5f5" }}>대상</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#fff5f5" }}>접수</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#fff5f5" }}>경쟁률</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#f0f7ff" }}>대상</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#f0f7ff" }}>접수</th>
              <th style={{ padding: "8px", border: "1px solid #eee", backgroundColor: "#f0f7ff" }}>경쟁률</th>
              <th style={{ padding: "8px", border: "1px solid #eee" }}>대상</th>
              <th style={{ padding: "8px", border: "1px solid #eee" }}>접수</th>
              <th style={{ padding: "8px", border: "1px solid #eee" }}>경쟁률</th>
              <th style={{ padding: "8px", border: "1px solid #eee", fontWeight: "bold" }}>대상</th>
              <th style={{ padding: "8px", border: "1px solid #eee", fontWeight: "bold" }}>접수</th>
              <th style={{ padding: "8px", border: "1px solid #eee", fontWeight: "bold" }}>경쟁률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, idx: number) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? "#fafafa" : "white" }}>
                <td style={{ padding: "8px", border: "1px solid #eee", fontWeight: "600", position: "sticky", left: 0, backgroundColor: idx % 2 === 1 ? "#fafafa" : "white", zIndex: 1 }}>{row.houseType}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.supplyGeneral)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.supplySpecial)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", color: "#e44" }}>{formatPriceTenThousand(row.priceThousand)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.stages.special.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>
                  <div>{formatNumber(row.stages.special.request)}</div>
                  {row.specialRequests && formatSpecialRequestEntries(row.specialRequests).length > 0 && (
                    <div style={{ fontSize: "10px", color: "#888" }}>
                      {formatSpecialRequestEntries(row.specialRequests).join("·")}
                    </div>
                  )}
                </td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", fontWeight: "600" }}>{formatRate(row.stages.special.request, row.stages.special.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.stages.rank1.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>
                  <div>{formatNumber(row.stages.rank1.request)}</div>
                  {(row.stages.rank1.localRequest ?? 0) + (row.stages.rank1.etcRequest ?? 0) > 0 && (
                    <div style={{ fontSize: "10px", color: "#888" }}>
                      해당{formatNumber(row.stages.rank1.localRequest ?? 0)}/기타{formatNumber(row.stages.rank1.etcRequest ?? 0)}
                    </div>
                  )}
                </td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>
                  <div style={{ fontWeight: "600", color: "#0066cc" }}>{formatRate(row.stages.rank1.request, row.stages.rank1.target)}</div>
                  {row.stages.rank1.localRequest !== undefined && row.stages.rank1.target !== null && row.stages.rank1.target > 0 && (
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                      해당 {(row.stages.rank1.localRequest / row.stages.rank1.target).toFixed(2)}
                    </div>
                  )}
                </td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.stages.rank2.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(row.stages.rank2.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>
                  <div style={{ fontWeight: "normal" }}>{formatRate(row.stages.rank2.request, row.stages.rank2.target)}</div>
                  {row.stages.rank2.localRequest !== undefined && row.stages.rank2.target !== null && row.stages.rank2.target > 0 && (
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                      해당 {(row.stages.rank2.localRequest / row.stages.rank2.target).toFixed(2)}
                    </div>
                  )}
                </td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", fontWeight: "bold" }}>{formatNumber(row.stages.total.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", fontWeight: "bold" }}>{formatNumber(row.stages.total.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", fontWeight: "bold", color: "#0066cc" }}>{formatRate(row.stages.total.request, row.stages.total.target)}</td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr style={{ backgroundColor: "#f1f3f5", fontWeight: "bold" }}>
                <td style={{ padding: "8px", border: "1px solid #eee", position: "sticky", left: 0, backgroundColor: "#f1f3f5", zIndex: 1 }}>합계</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.supplyGeneral)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.supplySpecial)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>-</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.special.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.special.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatRate(totals.stages.special.request, totals.stages.special.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.rank1.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.rank1.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatRate(totals.stages.rank1.request, totals.stages.rank1.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.rank2.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.rank2.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatRate(totals.stages.rank2.request, totals.stages.rank2.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.total.target)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right" }}>{formatNumber(totals.stages.total.request)}</td>
                <td style={{ padding: "8px", border: "1px solid #eee", textAlign: "right", color: "#0066cc" }}>{formatRate(totals.stages.total.request, totals.stages.total.target)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <div style={{ padding: "12px", fontSize: "11px", color: "#888", textAlign: "left" }}>
          ※ 경쟁률 = 접수 ÷ 대상, 금액 단위: 만원 기준. 주택명을 다시 클릭하면 상세 정보가 닫힙니다.
        </div>
      </div>
    </>
  );
}
