/**
 * useAptData Hook
 *
 * 청약 데이터(목록, 상세, 통계)를 로드하고 캐시와 병합하는 로직을 관리합니다.
 * API 호출, 캐싱, 필터링 로직을 포함합니다.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from "next/navigation";
import { AptInfo, CacheData, DetailCacheData, loadArchiveCache, loadDetailCache, mergeCacheAndApiData, getStaticDetail } from '@/lib/cache-loader';
import { buildApplicationRows, NoticeModelApiRow, NoticeCompetitionApiRow, NoticeSpecialApiRow } from '@/lib/detail-data';
import { parseAddress, extractSigunguList } from '@/lib/address-parser';

// SIDO_CODE_MAP: Record<string, string> 은 현재 미사용되거나, 필터링 로직 내에서만 사용될 예정이면 컴포넌트나 유틸로 이동 가능.
// 여기서는 필터링 로직 내에서 직접 정의하거나 utils에서 가져오는 것이 좋음.
// 우선은 훅 내부에 상수로 둡니다.
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

export type ApiResponse = {
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

export function useAptData() {
  const urlSearchParams = useSearchParams();

  // 기본 날짜 설정
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const oneYearAgo = new Date(currentYear - 1, currentMonth - 1, 1);
  const defaultStartMonth = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}`;
  const defaultEndMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // 상태 관리
  const [searchParams, setSearchParams] = useState({
    houseNm: urlSearchParams.get("houseNm") || "",
    sidoCode: urlSearchParams.get("sidoCode") || "",
    sigungu: urlSearchParams.get("sigungu") || "",
    houseDtlSecd: urlSearchParams.get("houseDtlSecd") || "",
    startMonth: urlSearchParams.get("startMonth") || defaultStartMonth,
    endMonth: urlSearchParams.get("endMonth") || defaultEndMonth,
    saleType: urlSearchParams.get("saleType") || "all",
  });

  const [data, setData] = useState<AptInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(Number(urlSearchParams.get("page")) || 1);
  const [archiveCache, setArchiveCache] = useState<CacheData | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  
  // localStorage 캐싱 비활성화 - 정적 캐시 파일 사용
  // 기존 localStorage 캐시 정리 (용량 확보)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem("cheongyak_extraData_cache");
        console.log("🧹 [Cache] localStorage 정리 완료 - 정적 캐시 사용");
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const [extraData, setExtraData] = useState<Record<string, any>>({});

  const extraDataRef = useRef(extraData);
  useEffect(() => {
    extraDataRef.current = extraData;
  }, [extraData]);

  // 상세 데이터 fetch
  const fetchingPool = useRef<Set<string>>(new Set());

  const fetchSingleExtraData = useCallback(async (houseManageNo: string, pblancNo: string) => {
    const key = `${houseManageNo}_${pblancNo}`;
    if (fetchingPool.current.has(key)) return;

    fetchingPool.current.add(key);

    try {
      // 1. 항상 정적 캐시 파일을 먼저 확인 (가장 빠르고 신뢰성 높음)
      const staticData = await getStaticDetail(houseManageNo, pblancNo);
      if (staticData?.totals?.stages?.rank1?.request !== undefined &&
          staticData?.totals?.stages?.rank1?.request !== null &&
          staticData.totals.stages.rank1.request > 0) {
        console.log(`⚡ [Static Cache] Hit: ${key}, 1순위 접수: ${staticData.totals.stages.rank1.request}명`);
        setExtraData(prev => ({ ...prev, [key]: staticData }));
        return;
      }

      // 2. 메모리 캐시 확인 (정적 캐시가 없거나 불완전한 경우)
      const cached = extraDataRef.current[key];
      if (cached?.totals?.stages?.rank1?.request !== undefined &&
          cached?.totals?.stages?.rank1?.request !== null &&
          cached.totals.stages.rank1.request > 0) {
        console.log(`📦 [Memory Cache] Hit: ${key}`);
        return;
      }

      // 2. 정적 캐시가 없으면 API 호출
      const params = new URLSearchParams({
        dataset: "noticeModel,noticeCompetition,noticeSpecial",
        houseManageNo,
        pblancNo,
        perPage: "100"
      });
      const res = await fetch(`/api/cheongyak?${params.toString()}`);
      if (!res.ok) throw new Error("API failed");

      const json = await res.json();
      const result = buildApplicationRows(
        json.datasets?.noticeModel || [],
        json.datasets?.noticeCompetition || [],
        json.datasets?.noticeSpecial || []
      );

      // 3. API 결과가 유효하면 사용 (접수건수 기준으로 검증)
      if (result.totals?.stages?.rank1?.request !== undefined &&
          result.totals?.stages?.rank1?.request !== null &&
          result.totals.stages.rank1.request > 0) {
        console.log(`🌐 [API] Success: ${key}, 1순위 접수: ${result.totals.stages.rank1.request}명`);
        setExtraData(prev => ({ ...prev, [key]: result }));
      } else if (result.totals) {
        // API 결과가 불완전하면 불완전한 데이터라도 저장 (UI에서 "-" 표시)
        console.log(`⚠️ [API] Incomplete data: ${key}`);
        setExtraData(prev => ({ ...prev, [key]: result }));
      }
    } catch (err) {
      console.error(`❌ [API Error] ${key}:`, err);
    } finally {
      fetchingPool.current.delete(key);
    }
  }, []);

  // 캐시 로드 초기화
  useEffect(() => {
    const initCache = async () => {
      setCacheLoading(true);
      const [archive, detail] = await Promise.all([loadArchiveCache(), loadDetailCache()]);
      setArchiveCache(archive);
      
      if (detail?.details) {
        console.log(`📦 [Detail Cache] 병합 시작: ${Object.keys(detail.details).length}건`);
        setExtraData(prev => {
          const merged = { ...prev };
          let mergedCount = 0;
          for (const [key, value] of Object.entries(detail.details)) {
            const detailData = value as any;
            // 기존 데이터가 없거나 접수건수가 없으면 병합
            if (!merged[key] ||
                !merged[key]?.totals?.stages?.rank1?.request ||
                merged[key]?.totals?.stages?.rank1?.request === 0) {
              // 새 데이터에 유효한 접수건수가 있으면 병합
              if (detailData?.totals?.stages?.rank1?.request > 0) {
                merged[key] = detailData;
                mergedCount++;
              }
            }
          }
          console.log(`✅ [Detail Cache] 병합 완료: ${mergedCount}건 추가`);
          return merged;
        });
      }
      setCacheLoading(false);
    };
    initCache();
  }, []);

  // 검색 핸들러
  const handleSearch = async (page: number = 1, overrideParams?: typeof searchParams) => {
    setLoading(true);
    setError("");
    setCurrentPage(page);

    const paramsToUse = overrideParams || searchParams;

    // 검색 조건 로깅
    console.log(`📊 [useAptData] 검색 조건:`, {
      조회기간: `${paramsToUse.startMonth} ~ ${paramsToUse.endMonth}`,
      지역: paramsToUse.sidoCode || '전체',
      주택구분: paramsToUse.houseDtlSecd || '전체',
      분양임대: paramsToUse.saleType || '전체',
      검색어: paramsToUse.houseNm || '없음'
    });

    try {
      // 동적 perPage 계산 (조회 기간에 따라)
      const getOptimalPerPage = (startMonth: string, endMonth: string): number => {
        const start = new Date(startMonth + '-01');
        const [endYear, endMonthNum] = endMonth.split('-').map(Number);
        const end = new Date(endYear, endMonthNum - 1, 1); // 해당 월의 1일

        const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 +
                           (end.getMonth() - start.getMonth()) + 1; // +1: 시작월 포함

        // 1개월당 약 50건 예상, 최소 200건, 최대 500건
        return Math.min(Math.max(monthsDiff * 50, 200), 500);
      };

      const perPage = getOptimalPerPage(
        paramsToUse.startMonth || defaultStartMonth,
        paramsToUse.endMonth || defaultEndMonth
      );

      console.log(`📡 [useAptData] API 페이징:`, {
        조회기간: `${paramsToUse.startMonth} ~ ${paramsToUse.endMonth}`,
        perPage: perPage
      });

      const buildParams = (pageNumber: number) => {
        const params = new URLSearchParams();
        params.set("dataset", "noticeList");
        params.set("page", String(pageNumber));
        params.set("perPage", String(perPage));

        if (paramsToUse.houseNm) params.set("houseNm", paramsToUse.houseNm);
        if (paramsToUse.sidoCode) params.set("sidoCode", paramsToUse.sidoCode);
        if (paramsToUse.houseDtlSecd) params.set("houseDtlSecd", paramsToUse.houseDtlSecd);

        if (paramsToUse.startMonth) {
          const [y, m] = paramsToUse.startMonth.split('-');
          params.set("cond[RCRIT_PBLANC_DE::GTE]", `${y}${m}01`);
        }
        if (paramsToUse.endMonth) {
          const [y, m] = paramsToUse.endMonth.split('-');
          const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
          params.set("cond[RCRIT_PBLANC_DE::LTE]", `${y}${m}${String(lastDay).padStart(2, '0')}`);
        }

        return params;
      };

      const fetchPage = async (pageNumber: number): Promise<ApiResponse> => {
        const res = await fetch(`/api/cheongyak?${buildParams(pageNumber).toString()}`);
        const json: ApiResponse = await res.json();
        if (!res.ok) throw new Error(json.errors ? Object.values(json.errors)[0] : "API 요청 실패");
        if (json.errors && Object.keys(json.errors).length > 0) {
          throw new Error(Object.values(json.errors)[0]);
        }
        return json;
      };

      const firstJson = await fetchPage(1);
      let allRows = firstJson.datasets.noticeList || [];

      const totalCount = firstJson.metadata?.noticeList?.totalCount ?? allRows.length;
      const totalPages = Math.ceil(totalCount / perPage);

      if (totalPages > 1) {
        const pageNumbers = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 2);
        const results = await Promise.allSettled(pageNumbers.map(fetchPage));
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            const rows = result.value.datasets.noticeList || [];
            allRows = allRows.concat(rows);
          } else {
            console.warn("추가 페이지 로드 실패:", result.reason);
          }
        });
      }

      const uniqueMap = new Map<string, AptInfo>();
      allRows.forEach((item, index) => {
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;
        const uniqueKey = (!item.HOUSE_MANAGE_NO && !item.PBLANC_NO) ? `${index}` : key;
        if (!uniqueMap.has(uniqueKey)) uniqueMap.set(uniqueKey, item);
      });
      const json: ApiResponse = {
        datasets: { noticeList: Array.from(uniqueMap.values()) },
        metadata: firstJson.metadata,
        errors: firstJson.errors || {}
      };

      if (json.errors && Object.keys(json.errors).length > 0) {
        setError(Object.values(json.errors)[0]);
        setData([]);
      } else {
        let filteredData = json.datasets.noticeList || [];

        // 캐시 병합
        let mergedData = mergeCacheAndApiData(
          archiveCache,
          filteredData,
          paramsToUse.startMonth,
          paramsToUse.endMonth
        );

        console.log(`📦 [useAptData] 데이터 병합 결과:`, {
          API응답: filteredData.length,
          병합후: mergedData.length
        });

        // 통합 필터링 (순회 최소화 & 정규식 최적화)
        let searchPattern: RegExp | null = null;
        if (paramsToUse.houseNm && paramsToUse.houseNm.trim()) {
          const keyword = paramsToUse.houseNm.trim();
          // 특수문자 이스케이프 및 대소문자 무시
          searchPattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        mergedData = mergedData.filter((item: AptInfo) => {
          // 1. 공공/임대/국민임대 제외 (가장 많이 걸러지는 조건)
          const type = (item.HOUSE_DTL_SECD_NM || "").trim();
          const name = (item.HOUSE_NM || "").trim();
          
          if (type.includes("공공") || name.includes("공공") || 
              name.includes("국민임대") || type.includes("임대")) {
            return false;
          }

          // 2. 검색어 필터링 (RegExp 재사용)
          if (searchPattern) {
            if (!searchPattern.test(name) && 
                !searchPattern.test(item.BSNS_MBY_NM || "")) {
              return false;
            }
          }

          // 3. 지역 필터링 (시/도)
          if (paramsToUse.sidoCode && paramsToUse.sidoCode !== "all") {
             const targetCode = paramsToUse.sidoCode;
             const targetName = SIDO_CODE_MAP[targetCode];

             // 지역 코드 매칭 여부 확인
             const matchesSido =
               item.SUBSCRPT_AREA_CODE === targetCode ||
               // 예외 케이스: 세종(36->338), 제주(50->690)
               (targetCode === "36" && item.SUBSCRPT_AREA_CODE === "338") ||
               (targetCode === "50" && item.SUBSCRPT_AREA_CODE === "690") ||
               // 일반 지역 코드 확장 (예: 41 -> 410)
               (targetCode !== "36" && targetCode !== "50" && item.SUBSCRPT_AREA_CODE === targetCode + "0") ||
               // 지역명 일치
               (targetName && item.SUBSCRPT_AREA_CODE_NM === targetName);

             if (!matchesSido) return false;
          }

          // 3-1. 시/군/구 필터링
          if (paramsToUse.sigungu && paramsToUse.sigungu.trim()) {
            const parsed = parseAddress(item.HSSPLY_ADRES);
            if (!parsed || parsed.sigungu !== paramsToUse.sigungu) {
              return false;
            }
          }

          // 4. 주택 구분 필터링
          if (paramsToUse.houseDtlSecd && paramsToUse.houseDtlSecd !== "all") {
            if (item.HOUSE_DTL_SECD !== paramsToUse.houseDtlSecd) return false;
          }

          // 5. 분양/임대 구분 필터링
          if (paramsToUse.saleType && paramsToUse.saleType !== "all") {
             const rentSecd = item.RENT_SECD !== undefined ? String(item.RENT_SECD) : "0";
             if (paramsToUse.saleType === "sale" && rentSecd !== "0") return false;
             if (paramsToUse.saleType === "rent" && rentSecd !== "1") return false;
             if (paramsToUse.saleType === "rentNo" && rentSecd !== "2") return false;
          }

          return true;
        });

        console.log(`✅ [useAptData] 최종 결과:`, {
          필터링후: mergedData.length,
          조회기간: `${paramsToUse.startMonth} ~ ${paramsToUse.endMonth}`
        });

        setData(mergedData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 중 오류 발생");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const sigunguOptions = useMemo(() => {
    if (!searchParams.sidoCode || searchParams.sidoCode === "all") return [];
    const allData = [...(archiveCache?.lists || []), ...data] as Array<{ HSSPLY_ADRES?: string }>;
    const result = extractSigunguList(allData, searchParams.sidoCode);
    console.log(`🏘️ [sigunguOptions] sidoCode=${searchParams.sidoCode}, allData=${allData.length}건, 시군구 ${result.length}개:`, result.slice(0, 5));
    return result;
  }, [data, archiveCache?.lists, searchParams.sidoCode]);

  return {
    data,
    loading,
    error,
    searchParams,
    setSearchParams,
    currentPage,
    setCurrentPage,
    handleSearch,
    fetchSingleExtraData,
    extraData,
    archiveCache,
    cacheLoading,
    sigunguOptions,
  };
}
