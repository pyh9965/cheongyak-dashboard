/**
 * 청약 데이터 캐시 생성 스크립트
 * 
 * 2025년 12월까지의 과거 데이터 + 당첨자 발표 완료 데이터를 캐싱합니다.
 * - 목록 데이터: 청약 공고 기본 정보
 * - 상세 데이터: 경쟁률, 모델별 공급 현황 등
 */

import * as fs from 'fs';
import * as path from 'path';

// 타입 정의
type AptInfo = {
    HOUSE_NM: string;
    HOUSE_MANAGE_NO?: string;
    PBLANC_NO?: string;
    RCRIT_PBLANC_DE?: string;
    PRZWNER_PRESNATN_DE?: string;
    RCEPT_ENDDE?: string;
    [key: string]: any;
};

type CacheData = {
    lists: AptInfo[];
    details: Record<string, {
        noticeModel: any[];
        noticeCompetition: any[];
        noticeSpecial: any[];
    }>;
    metadata: {
        generatedAt: string;
        totalCount: number;
        detailCount: number;
        dateRange: {
            start: string;
            end: string;
        };
    };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DATA_DIR = path.join(process.cwd(), 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'cheongyak-archive.json');

// 날짜 유틸리티
function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const clean = dateStr.replace(/-/g, '');
    if (clean.length !== 8) return null;
    return new Date(
        parseInt(clean.substring(0, 4)),
        parseInt(clean.substring(4, 6)) - 1,
        parseInt(clean.substring(6, 8))
    );
}

// 당첨자 발표가 완료되었는지 확인
function isResultAnnounced(przwnerPresnatnDe: string | undefined): boolean {
    if (!przwnerPresnatnDe) return false;
    const announceDate = parseDate(przwnerPresnatnDe);
    if (!announceDate) return false;
    return announceDate < new Date();
}

// 청약 목록 데이터 수집
async function fetchNoticeList(): Promise<AptInfo[]> {
    console.log('📋 청약 목록 데이터 수집 시작...');

    const allData: AptInfo[] = [];
    let page = 1;
    let hasMore = true;

    // 2025년 12월 31일까지 데이터 수집
    const endDate = '20251231';

    while (hasMore && page <= 100) {
        console.log(`  - 페이지 ${page} 조회 중...`);

        try {
            const params = new URLSearchParams({
                dataset: 'noticeList',
                page: String(page),
                perPage: '500',
                endDate: endDate,
                'cond[RCRIT_PBLANC_DE::LTE]': endDate,
            });

            const response = await fetch(`${API_BASE_URL}/api/cheongyak?${params.toString()}`);
            if (!response.ok) {
                console.error(`    ❌ API 오류: ${response.status}`);
                break;
            }

            const json = await response.json();
            const items = json.datasets?.noticeList || [];

            if (items.length === 0) {
                hasMore = false;
                break;
            }

            allData.push(...items);
            console.log(`    ✓ ${items.length}건 수집 (누적: ${allData.length}건)`);

            // 전체 개수 확인
            const totalCount = json.metadata?.noticeList?.totalCount || 0;
            if (allData.length >= totalCount) {
                hasMore = false;
            }

            page++;

            // API 부하 방지를 위한 딜레이
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`    ❌ 오류 발생:`, error);
            break;
        }
    }

    console.log(`✅ 총 ${allData.length}건의 목록 데이터 수집 완료\n`);
    return allData;
}

// 개별 청약 상세 데이터 수집
async function fetchNoticeDetail(houseManageNo: string, pblancNo: string): Promise<any> {
    try {
        const params = new URLSearchParams({
            dataset: 'noticeModel,noticeCompetition,noticeSpecial',
            houseManageNo,
            pblancNo,
            perPage: '100',
        });

        const response = await fetch(`${API_BASE_URL}/api/cheongyak?${params.toString()}`);
        if (!response.ok) return null;

        const json = await response.json();
        return {
            noticeModel: json.datasets?.noticeModel || [],
            noticeCompetition: json.datasets?.noticeCompetition || [],
            noticeSpecial: json.datasets?.noticeSpecial || [],
        };
    } catch (error) {
        console.error(`    ❌ 상세 정보 수집 실패: ${houseManageNo}_${pblancNo}`, error);
        return null;
    }
}

// 상세 데이터 배치 수집
async function fetchAllDetails(lists: AptInfo[]): Promise<Record<string, any>> {
    console.log('📊 상세 데이터 수집 시작...');

    // 당첨자 발표가 완료된 항목만 필터링
    const completedItems = lists.filter(item => {
        return isResultAnnounced(item.PRZWNER_PRESNATN_DE) &&
            item.HOUSE_MANAGE_NO &&
            item.PBLANC_NO;
    });

    console.log(`  - 당첨자 발표 완료: ${completedItems.length}건 (전체 ${lists.length}건 중)`);

    const details: Record<string, any> = {};
    let successCount = 0;

    for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const key = `${item.HOUSE_MANAGE_NO}_${item.PBLANC_NO}`;

        if (i % 10 === 0) {
            console.log(`  - 진행중: ${i + 1}/${completedItems.length} (${Math.round((i / completedItems.length) * 100)}%)`);
        }

        const detail = await fetchNoticeDetail(
            String(item.HOUSE_MANAGE_NO),
            String(item.PBLANC_NO)
        );

        if (detail) {
            details[key] = detail;
            successCount++;
        }

        // API 부하 방지
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ 총 ${successCount}건의 상세 데이터 수집 완료\n`);
    return details;
}

// 캐시 파일 저장
function saveCache(data: CacheData): void {
    console.log('💾 캐시 파일 저장 중...');

    // data 디렉토리 생성 (없으면)
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // JSON 파일 저장
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(data, null, 2), 'utf-8');

    const fileSizeMB = (fs.statSync(ARCHIVE_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`✅ 캐시 파일 저장 완료: ${ARCHIVE_FILE}`);
    console.log(`   파일 크기: ${fileSizeMB} MB\n`);
}

// 메인 실행
async function main() {
    console.log('🚀 청약 데이터 캐시 생성 시작\n');
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
        // 1. 목록 데이터 수집
        const lists = await fetchNoticeList();

        // 2. 상세 데이터 수집
        const details = await fetchAllDetails(lists);

        // 3. 캐시 데이터 구성
        const cacheData: CacheData = {
            lists,
            details,
            metadata: {
                generatedAt: new Date().toISOString(),
                totalCount: lists.length,
                detailCount: Object.keys(details).length,
                dateRange: {
                    start: '2020-01-01',
                    end: '2025-12-31',
                },
            },
        };

        // 4. 파일 저장
        saveCache(cacheData);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('='.repeat(60));
        console.log(`✅ 캐시 생성 완료! (소요 시간: ${duration}초)`);
        console.log(`   - 목록 데이터: ${lists.length}건`);
        console.log(`   - 상세 데이터: ${Object.keys(details).length}건`);
    } catch (error) {
        console.error('❌ 캐시 생성 실패:', error);
        process.exit(1);
    }
}

// 스크립트 실행
main();
