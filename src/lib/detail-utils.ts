// 상세정보 관련 유틸리티 함수들

type ApiValue = string | number | null | undefined;

// 숫자 변환 함수
export function toInt(value: ApiValue): number {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === "number" 
    ? value 
    : Number(String(value).replace(/[^0-9-]/g, ""));
  return Number.isFinite(raw) ? raw : 0;
}

export function toFloat(value: ApiValue): number {
  if (value === null || value === undefined) return 0;
  const raw = typeof value === "number" 
    ? value 
    : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(raw) ? raw : 0;
}

// 숫자 포맷팅 함수
export function formatNumber(value: number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  return value.toLocaleString();
}

export function formatPriceTenThousand(value: number | null): string {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value)) return "-";
  return `${value.toLocaleString()} 만원`;
}

export function formatRate(request: number | null, target: number | null): string {
  if (request === null || target === null || target <= 0) return "-";
  const ratio = request / target;
  if (!Number.isFinite(ratio)) return "-";
  const precision = ratio >= 10 ? 1 : 2;
  return `${ratio.toFixed(precision)} : 1`;
}

export function formatDifference(remaining: number | null): string | null {
  if (remaining === null) return null;
  if (remaining === 0) return "잔여 0";
  const label = remaining > 0 ? "잔여" : "초과";
  return `${label} ${Math.abs(remaining).toLocaleString()}`;
}

export function formatSpecialRequestEntries(requests: Record<string, number | null>): string[] {
  return Object.entries(requests)
    .filter(([, value]) => value !== null && value !== undefined && value !== 0)
    .map(([label, value]) => `${label} ${(value ?? 0).toLocaleString()}`);
}

// 주택형 파싱 함수
type HouseTypeKey = {
  numeric: number | null;
  base: number | null;
  suffix: string;
  raw: string;
};

export function parseHouseTypeKey(value: string): HouseTypeKey {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return { numeric: null, base: null, suffix: trimmed.toUpperCase(), raw: trimmed };
  }
  const numeric = Number.parseFloat(match[1]);
  const suffix = match[2]?.trim().toUpperCase() ?? "";
  return {
    numeric: Number.isFinite(numeric) ? numeric : null,
    base: Number.isFinite(numeric) ? Math.trunc(numeric) : null,
    suffix,
    raw: trimmed,
  };
}

// 값 포맷팅 함수
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

