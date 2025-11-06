'use client';

import React from 'react';
import * as XLSX from 'xlsx';

type ApplicationRow = {
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
    special: { target: number | null; request: number | null };
    rank1: { target: number | null; request: number | null; localRequest?: number | null; etcRequest?: number | null };
    rank2: { target: number | null; request: number | null; localRequest?: number | null; etcRequest?: number | null };
    total: { target: number | null; request: number | null };
  };
};

type ExportExcelButtonProps = {
  rows: ApplicationRow[];
  totals: ApplicationRow | null;
  houseName?: string;
};

export default function ExportExcelButton({ rows, totals, houseName }: ExportExcelButtonProps) {
  const handleExport = React.useCallback(() => {
    if (!rows || rows.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    // 데이터 정규화: 엑셀용으로 변환
    const excelRows = rows.map((row) => {
      // 특별공급 상세 내역 문자열 생성
      const specialDetails: string[] = [];
      if (row.specialRequests) {
        if (row.specialRequests['기관추천'] && row.specialRequests['기관추천'] > 0) {
          specialDetails.push(`기관추천 ${row.specialRequests['기관추천']}`);
        }
        if (row.specialRequests['신혼부부'] && row.specialRequests['신혼부부'] > 0) {
          specialDetails.push(`신혼부부 ${row.specialRequests['신혼부부']}`);
        }
        if (row.specialRequests['생애최초'] && row.specialRequests['생애최초'] > 0) {
          specialDetails.push(`생애최초 ${row.specialRequests['생애최초']}`);
        }
        if (row.specialRequests['다자녀가구'] && row.specialRequests['다자녀가구'] > 0) {
          specialDetails.push(`다자녀가구 ${row.specialRequests['다자녀가구']}`);
        }
        if (row.specialRequests['노부모부양'] && row.specialRequests['노부모부양'] > 0) {
          specialDetails.push(`노부모부양 ${row.specialRequests['노부모부양']}`);
        }
      }

      // 경쟁률 계산 함수
      const calcRate = (request: number | null, target: number | null): string => {
        if (!target || target === 0) return '-';
        if (!request) return '0.00:1';
        return `${(request / target).toFixed(2)}:1`;
      };

      return {
        타입: row.houseType,
        '공급면적(㎡)': row.areaSqm ?? null,
        '공급평형(평)': row.areaPyeong ?? null,
        '공급세대_일반': row.supplyGeneral,
        '공급세대_특별': row.supplySpecial,
        '공급세대_합계': row.supplyTotal,
        '최고분양가(만원)': row.priceThousand ?? null,
        '특별공급_대상': row.stages.special.target ?? null,
        '특별공급_접수': row.stages.special.request ?? null,
        '특별공급_상세': specialDetails.join(' · ') || '-',
        '특별공급_경쟁률': calcRate(row.stages.special.request, row.stages.special.target),
        '1순위_대상': row.stages.rank1.target ?? null,
        '1순위_접수': row.stages.rank1.request ?? null,
        '1순위_해당': row.stages.rank1.localRequest ?? null,
        '1순위_기타': row.stages.rank1.etcRequest ?? null,
        '1순위_경쟁률': calcRate(row.stages.rank1.request, row.stages.rank1.target),
        '2순위_대상': row.stages.rank2.target ?? null,
        '2순위_접수': row.stages.rank2.request ?? null,
        '2순위_해당': row.stages.rank2.localRequest ?? null,
        '2순위_기타': row.stages.rank2.etcRequest ?? null,
        '2순위_경쟁률': calcRate(row.stages.rank2.request, row.stages.rank2.target),
        '합계_대상': row.stages.total.target ?? null,
        '합계_접수': row.stages.total.request ?? null,
        '합계_경쟁률': calcRate(row.stages.total.request, row.stages.total.target),
      };
    });

    // 합계 행 추가
    if (totals) {
      const calcRate = (request: number | null, target: number | null): string => {
        if (!target || target === 0) return '-';
        if (!request) return '0.00:1';
        return `${(request / target).toFixed(2)}:1`;
      };

      excelRows.push({
        타입: '합계',
        '공급면적(㎡)': null,
        '공급평형(평)': null,
        '공급세대_일반': totals.supplyGeneral,
        '공급세대_특별': totals.supplySpecial,
        '공급세대_합계': totals.supplyTotal,
        '최고분양가(만원)': null,
        '특별공급_대상': totals.stages.special.target ?? null,
        '특별공급_접수': totals.stages.special.request ?? null,
        '특별공급_상세': '-',
        '특별공급_경쟁률': calcRate(totals.stages.special.request, totals.stages.special.target),
        '1순위_대상': totals.stages.rank1.target ?? null,
        '1순위_접수': totals.stages.rank1.request ?? null,
        '1순위_해당': null,
        '1순위_기타': null,
        '1순위_경쟁률': calcRate(totals.stages.rank1.request, totals.stages.rank1.target),
        '2순위_대상': totals.stages.rank2.target ?? null,
        '2순위_접수': totals.stages.rank2.request ?? null,
        '2순위_해당': null,
        '2순위_기타': null,
        '2순위_경쟁률': calcRate(totals.stages.rank2.request, totals.stages.rank2.target),
        '합계_대상': totals.stages.total.target ?? null,
        '합계_접수': totals.stages.total.request ?? null,
        '합계_경쟁률': calcRate(totals.stages.total.request, totals.stages.total.target),
      });
    }

    // 워크시트 생성
    const ws = XLSX.utils.json_to_sheet(excelRows);
    
    // 컬럼 너비 설정
    const colWidths = [
      { wch: 12 }, // 타입
      { wch: 12 }, // 공급면적
      { wch: 12 }, // 공급평형
      { wch: 12 }, // 공급세대_일반
      { wch: 12 }, // 공급세대_특별
      { wch: 12 }, // 공급세대_합계
      { wch: 15 }, // 최고분양가
      { wch: 12 }, // 특별공급_대상
      { wch: 12 }, // 특별공급_접수
      { wch: 30 }, // 특별공급_상세
      { wch: 12 }, // 특별공급_경쟁률
      { wch: 12 }, // 1순위_대상
      { wch: 12 }, // 1순위_접수
      { wch: 12 }, // 1순위_해당
      { wch: 12 }, // 1순위_기타
      { wch: 12 }, // 1순위_경쟁률
      { wch: 12 }, // 2순위_대상
      { wch: 12 }, // 2순위_접수
      { wch: 12 }, // 2순위_해당
      { wch: 12 }, // 2순위_기타
      { wch: 12 }, // 2순위_경쟁률
      { wch: 12 }, // 합계_대상
      { wch: 12 }, // 합계_접수
      { wch: 12 }, // 합계_경쟁률
    ];
    ws['!cols'] = colWidths;

    // 워크북 생성
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '청약접수결과');

    // 파일명 생성
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = houseName 
      ? `청약접수결과_${houseName}_${dateStr}.xlsx`
      : `청약접수결과_${dateStr}.xlsx`;

    // 파일 다운로드
    XLSX.writeFile(wb, filename);
  }, [rows, totals, houseName]);

  return (
    <button
      onClick={handleExport}
      style={{
        padding: "8px 16px",
        backgroundColor: "#10b981",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = "#059669";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = "#10b981";
      }}
      title="엑셀 파일로 다운로드"
    >
      <span>📥</span>
      <span>엑셀 다운로드</span>
    </button>
  );
}

