"use client";

import React from "react";
import styles from "../app/apt/page.module.css";

interface SearchFormProps {
  searchParams: {
    houseNm: string;
    sidoCode: string;
    sigungu: string;        // 신규 추가
    houseDtlSecd: string;
    startMonth: string;
    endMonth: string;
    saleType: string;
  };
  setSearchParams: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  sigunguOptions: string[];  // 신규 추가
}

export default function SearchForm({
  searchParams,
  setSearchParams,
  onSubmit,
  loading,
  sigunguOptions,  // 신규 추가
}: SearchFormProps) {
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
            onChange={(e) => setSearchParams({
              ...searchParams,
              sidoCode: e.target.value,
              sigungu: ""  // 시/도 변경 시 시/군/구 초기화
            })}
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

        {/* 시/군/구 선택 - 시/도 선택 및 옵션 존재 시에만 표시 */}
        {searchParams.sidoCode && sigunguOptions.length > 0 && (
          <div className={styles.formRow}>
            <label className={styles.label}>
              시/군/구:
            </label>
            <select
              value={searchParams.sigungu}
              onChange={(e) => setSearchParams({ ...searchParams, sigungu: e.target.value })}
              className={`${styles.select} ${styles.flex1}`}
            >
              <option value="">전체</option>
              {sigunguOptions.map(sg => (
                <option key={sg} value={sg}>{sg}</option>
              ))}
            </select>
          </div>
        )}

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
