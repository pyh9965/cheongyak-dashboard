'use client';

import React from 'react';

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
  const [isLoading, setIsLoading] = React.useState(false);

  const handleExport = React.useCallback(async () => {
    if (!rows || rows.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    setIsLoading(true);

    try {
      // 서버 API 호출로 엑셀 파일 생성
      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows, totals, houseName }),
      });

      if (!response.ok) {
        throw new Error('서버 응답 오류');
      }

      // 파일명 추출 (Content-Disposition 헤더에서)
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'download.xlsx';
      if (contentDisposition) {
        // filename*= 형식 우선 (UTF-8 인코딩)
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''(.+?)(?:;|$)/i);
        if (utf8Match) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          // 일반 filename= 형식
          const simpleMatch = contentDisposition.match(/filename="?([^";\n]+)"?/i);
          if (simpleMatch) {
            filename = simpleMatch[1];
          }
        }
      }

      // Blob으로 변환 후 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // 정리
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

    } catch (err) {
      console.error('Excel export failed:', err);
      alert(`엑셀 파일 생성 중 오류가 발생했습니다: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [rows, totals, houseName]);

  return (
    <button
      onClick={handleExport}
      disabled={isLoading}
      style={{
        padding: "8px 16px",
        backgroundColor: isLoading ? "#9ca3af" : "#10b981",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: isLoading ? "not-allowed" : "pointer",
        fontSize: "14px",
        fontWeight: "500",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.2s ease",
        opacity: isLoading ? 0.7 : 1,
      }}
      onMouseOver={(e) => {
        if (!isLoading) {
          e.currentTarget.style.backgroundColor = "#059669";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
        }
      }}
      onMouseOut={(e) => {
        if (!isLoading) {
          e.currentTarget.style.backgroundColor = "#10b981";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
      title="엑셀 파일로 다운로드"
    >
      <span style={{ fontSize: "16px" }}>{isLoading ? "⏳" : "📥"}</span>
      <span>{isLoading ? "생성 중..." : "엑셀 다운로드"}</span>
    </button>
  );
}
