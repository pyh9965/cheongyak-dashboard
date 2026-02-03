"use client";

import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
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
