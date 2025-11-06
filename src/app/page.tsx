import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1 style={{ marginBottom: "30px" }}>청약홈 APT 분양정보/경쟁률 조회</h1>
      <Link 
        href="/apt"
        style={{
          display: "inline-block",
          padding: "15px 30px",
          backgroundColor: "#0066cc",
          color: "white",
          textDecoration: "none",
          borderRadius: "4px",
          fontSize: "18px"
        }}
      >
        APT 분양정보 조회 시작하기
      </Link>
    </div>
  );
}

