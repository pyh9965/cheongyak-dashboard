import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "청약홈 APT 분양정보/경쟁률",
  description: "청약홈 APT 분양정보 및 경쟁률 조회 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

