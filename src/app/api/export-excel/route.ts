import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
    console.log('[export-excel] API 호출 시작');
    try {
        const body = await request.json();
        console.log('[export-excel] 요청 데이터 수신:', {
            rowsCount: body.rows?.length,
            hasTotals: !!body.totals,
            houseName: body.houseName
        });

        const { rows, totals, houseName } = body;

        if (!rows || rows.length === 0) {
            console.log('[export-excel] 데이터 없음 오류');
            return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 });
        }

        // 데이터 변환
        const excelRows = rows.map((row: any) => {
            const specialDetails: string[] = [];
            if (row.specialRequests) {
                const checkKeys = (labels: string[]) => {
                    for (const label of labels) {
                        const val = row.specialRequests[label];
                        if (val !== null && val !== undefined && val > 0) return { label, val };
                    }
                    return null;
                };

                const mapping = [
                    { id: '기관추천', keys: ['기관추천'] },
                    { id: '신혼부부', keys: ['신혼부부'] },
                    { id: '생애최초', keys: ['생애최초'] },
                    { id: '다자녀', keys: ['다자녀', '다자녀가구'] },
                    { id: '노부모부양', keys: ['노부모부양'] },
                    { id: '기타/이전', keys: ['기타', '이전기관', '영구임대'] },
                ];

                mapping.forEach(m => {
                    const result = checkKeys(m.keys);
                    if (result) specialDetails.push(`${m.id} ${result.val.toLocaleString()}`);
                });
            }

            const calcRate = (request: number | null, target: number | null): string => {
                if (!target || target === 0) return '-';
                const r = request ?? 0;
                return `${(r / target).toFixed(2)}:1`;
            };

            return {
                '타입': row.houseType,
                '공급면적(㎡)': row.areaSqm ?? null,
                '공급평형(평)': row.areaPyeong ?? null,
                '공급세대_일반': row.supplyGeneral,
                '공급세대_특별': row.supplySpecial,
                '공급세대_합계': row.supplyTotal,
                '최고분양가(만원)': row.priceThousand ?? null,
                '특별공급_대상': row.stages?.special?.target ?? null,
                '특별공급_접수': row.stages?.special?.request ?? null,
                '특별공급_상세': specialDetails.join(' · ') || '-',
                '특별공급_경쟁률': calcRate(row.stages?.special?.request, row.stages?.special?.target),
                '1순위_대상': row.stages?.rank1?.target ?? null,
                '1순위_접수': row.stages?.rank1?.request ?? null,
                '1순위_해당': row.stages?.rank1?.localRequest ?? null,
                '1순위_기타': row.stages?.rank1?.etcRequest ?? null,
                '1순위_경쟁률': calcRate(row.stages?.rank1?.request, row.stages?.rank1?.target),
                '2순위_대상': row.stages?.rank2?.target ?? null,
                '2순위_접수': row.stages?.rank2?.request ?? null,
                '2순위_해당': row.stages?.rank2?.localRequest ?? null,
                '2순위_기타': row.stages?.rank2?.etcRequest ?? null,
                '2순위_경쟁률': calcRate(row.stages?.rank2?.request, row.stages?.rank2?.target),
                '합계_대상': row.stages?.total?.target ?? null,
                '합계_접수': row.stages?.total?.request ?? null,
                '합계_경쟁률': calcRate(row.stages?.total?.request, row.stages?.total?.target),
            };
        });

        // 합계 행 추가
        if (totals) {
            const calcRate = (request: number | null, target: number | null): string => {
                if (!target || target === 0) return '-';
                const r = request ?? 0;
                return `${(r / target).toFixed(2)}:1`;
            };

            excelRows.push({
                '타입': '합계',
                '공급면적(㎡)': null,
                '공급평형(평)': null,
                '공급세대_일반': totals.supplyGeneral,
                '공급세대_특별': totals.supplySpecial,
                '공급세대_합계': totals.supplyTotal,
                '최고분양가(만원)': null,
                '특별공급_대상': totals.stages?.special?.target ?? null,
                '특별공급_접수': totals.stages?.special?.request ?? null,
                '특별공급_상세': '-',
                '특별공급_경쟁률': calcRate(totals.stages?.special?.request, totals.stages?.special?.target),
                '1순위_대상': totals.stages?.rank1?.target ?? null,
                '1순위_접수': totals.stages?.rank1?.request ?? null,
                '1순위_해당': totals.stages?.rank1?.localRequest ?? null,
                '1순위_기타': totals.stages?.rank1?.etcRequest ?? null,
                '1순위_경쟁률': calcRate(totals.stages?.rank1?.request, totals.stages?.rank1?.target),
                '2순위_대상': totals.stages?.rank2?.target ?? null,
                '2순위_접수': totals.stages?.rank2?.request ?? null,
                '2순위_해당': totals.stages?.rank2?.localRequest ?? null,
                '2순위_기타': totals.stages?.rank2?.etcRequest ?? null,
                '2순위_경쟁률': calcRate(totals.stages?.rank2?.request, totals.stages?.rank2?.target),
                '합계_대상': totals.stages?.total?.target ?? null,
                '합계_접수': totals.stages?.total?.request ?? null,
                '합계_경쟁률': calcRate(totals.stages?.total?.request, totals.stages?.total?.target),
            });
        }

        // 워크시트 및 워크북 생성
        const ws = XLSX.utils.json_to_sheet(excelRows);
        ws['!cols'] = [
            { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '청약접수결과');

        // 엑셀 파일 바이너리 생성 (base64로 생성 후 Buffer로 변환)
        const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const excelBuffer = Buffer.from(excelBase64, 'base64');

        // 안전한 파일명 생성
        const safeHouseName = (houseName || '청약결과')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50);

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `청약접수결과_${safeHouseName}_${dateStr}.xlsx`;

        // RFC 5987 인코딩으로 파일명 전달 (한글 지원)
        const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');

        // Buffer를 Uint8Array로 올바르게 변환
        const uint8Array = Uint8Array.from(excelBuffer);

        console.log('[export-excel] 파일 생성 완료, 크기:', uint8Array.length, 'bytes');

        return new NextResponse(uint8Array, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('[export-excel] 오류 발생:', err.message);
        console.error('[export-excel] 스택:', err.stack);
        return NextResponse.json({ error: `Excel 파일 생성 실패: ${err.message}` }, { status: 500 });
    }
}
