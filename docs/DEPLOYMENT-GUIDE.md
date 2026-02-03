# 청약경쟁률 대시보드 웹 배포 가이드

## 목차

1. [프로젝트 분석](#1-프로젝트-분석)
2. [배포 옵션 비교](#2-배포-옵션-비교)
3. [최선의 선택: Vercel](#3-최선의-선택-vercel)
4. [대안 1: Cloudflare Pages](#4-대안-1-cloudflare-pages)
5. [대안 2: 자체 서버 (VPS)](#5-대안-2-자체-서버-vps)
6. [배포 전 체크리스트](#6-배포-전-체크리스트)
7. [배포 후 최적화](#7-배포-후-최적화)
8. [비용 분석](#8-비용-분석)
9. [결론 및 권장사항](#9-결론-및-권장사항)

---

## 1. 프로젝트 분석

### 1.1 기술 스택

| 항목 | 기술 | 배포 고려사항 |
|------|------|---------------|
| 프레임워크 | Next.js 14.2 | SSR/SSG 지원 필요 |
| 지도 | Kakao Maps SDK, Leaflet | 클라이언트 사이드 전용 |
| 차트 | Chart.js | 클라이언트 사이드 전용 |
| 데이터 | 정적 JSON (17MB) | CDN 캐싱 필수 |

### 1.2 환경 변수

```bash
# 필수 환경 변수
NEXT_PUBLIC_KAKAO_API_KEY=xxx  # 클라이언트에서 사용 (지도)
REB_API_KEY=xxx                 # 서버에서만 사용 (API 호출)
```

### 1.3 특수 요구사항

- **SSR 비활성화**: 지도/차트 컴포넌트는 `dynamic import`로 CSR 처리됨
- **정적 데이터**: `public/data/cheongyak-archive.json` (17MB)
- **외부 API 의존**: 청약홈 API, 카카오 지도 API

---

## 2. 배포 옵션 비교

| 플랫폼 | 무료 티어 | 장점 | 단점 | 추천도 |
|--------|----------|------|------|--------|
| **Vercel** | 100GB/월 | Next.js 공식, 자동 최적화, 글로벌 CDN | 상업용 제한 | ⭐⭐⭐⭐⭐ |
| **Cloudflare Pages** | 무제한 | 빠른 CDN, 무제한 대역폭 | Edge Runtime 제약 | ⭐⭐⭐⭐ |
| **Netlify** | 100GB/월 | 쉬운 설정, 폼 처리 | Next.js 기능 제한 | ⭐⭐⭐ |
| **AWS Amplify** | 프리티어 | 확장성, AWS 통합 | 복잡한 설정 | ⭐⭐⭐ |
| **자체 VPS** | 월 $5~ | 완전 제어 | 관리 부담 | ⭐⭐⭐ |

---

## 3. 최선의 선택: Vercel

### 3.1 왜 Vercel인가?

1. **Next.js 개발사** - 최적화된 빌드 및 배포
2. **제로 설정** - Git 연결만으로 자동 배포
3. **글로벌 Edge Network** - 서울 리전 포함
4. **자동 HTTPS** - SSL 인증서 자동 발급
5. **Preview Deployments** - PR마다 미리보기 URL 생성

### 3.2 배포 절차

#### Step 1: Vercel 계정 생성

```
https://vercel.com/signup
```

GitHub, GitLab, Bitbucket 계정으로 가입 가능

#### Step 2: 프로젝트 업로드 (GitHub 사용)

```bash
# 1. GitHub 저장소 생성 후 푸시
git remote add origin https://github.com/YOUR_USERNAME/cheongyak-dashboard.git
git branch -M main
git push -u origin main
```

#### Step 3: Vercel에서 프로젝트 Import

1. Vercel 대시보드 → "Add New..." → "Project"
2. GitHub 저장소 선택
3. 프레임워크 프리셋: **Next.js** (자동 감지됨)

#### Step 4: 환경 변수 설정

Vercel 대시보드 → Settings → Environment Variables:

| 변수명 | 값 | 환경 |
|--------|-----|------|
| `NEXT_PUBLIC_KAKAO_API_KEY` | 카카오 API 키 | Production, Preview, Development |
| `REB_API_KEY` | 청약홈 API 키 | Production, Preview, Development |

#### Step 5: 빌드 설정 확인

```json
// vercel.json (선택적 - 프로젝트 루트에 생성)
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["icn1"],  // 서울 리전 우선
  "headers": [
    {
      "source": "/data/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=3600, s-maxage=86400"
        }
      ]
    }
  ]
}
```

#### Step 6: 배포

```bash
# 자동 배포 (main 브랜치 푸시 시)
git push origin main

# 또는 Vercel CLI 사용
npm i -g vercel
vercel --prod
```

### 3.3 커스텀 도메인 설정

1. Vercel 대시보드 → Settings → Domains
2. 도메인 추가 (예: `cheongyak.example.com`)
3. DNS 설정:
   ```
   CNAME  cheongyak  cname.vercel-dns.com
   ```

### 3.4 Vercel 무료 티어 제한

| 항목 | 제한 |
|------|------|
| 대역폭 | 100GB/월 |
| 빌드 시간 | 6000분/월 |
| 서버리스 함수 실행 | 100GB-시간/월 |
| 이미지 최적화 | 1000개/월 |
| 팀 멤버 | 1명 (Hobby) |

**예상 사용량**: 이 프로젝트는 대부분 정적 콘텐츠이므로 무료 티어로 충분합니다.

---

## 4. 대안 1: Cloudflare Pages

### 4.1 장점

- **무제한 대역폭** - 트래픽 제한 없음
- **글로벌 CDN** - 300+ 엣지 로케이션
- **무료 SSL** - 자동 HTTPS
- **빠른 빌드** - 캐시된 의존성

### 4.2 배포 절차

#### Step 1: Cloudflare 계정 생성

```
https://dash.cloudflare.com/sign-up
```

#### Step 2: Pages 프로젝트 생성

1. Cloudflare 대시보드 → Pages → "Create a project"
2. GitHub 연결 및 저장소 선택

#### Step 3: 빌드 설정

```yaml
# 빌드 설정
Framework preset: Next.js
Build command: npm run build
Build output directory: .next
Root directory: /
```

#### Step 4: 환경 변수 설정

Settings → Environment variables에서 추가

#### Step 5: next.config.js 수정 (필요 시)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],
  // Cloudflare Pages 호환성
  images: {
    unoptimized: true,  // Edge Runtime 제약
  },
}

module.exports = nextConfig
```

### 4.3 제한사항

- Edge Runtime에서 일부 Node.js API 미지원
- 이미지 최적화 비활성화 필요
- 서버리스 함수 1일 100,000 요청 제한

---

## 5. 대안 2: 자체 서버 (VPS)

### 5.1 추천 VPS 제공업체

| 제공업체 | 최소 사양 | 월 비용 | 서울 리전 |
|----------|----------|---------|----------|
| **Vultr** | 1 vCPU, 1GB RAM | $5 | O |
| **DigitalOcean** | 1 vCPU, 1GB RAM | $6 | X (싱가포르) |
| **Linode** | 1 vCPU, 1GB RAM | $5 | X (도쿄) |
| **카페24** | 1 vCPU, 1GB RAM | ₩5,500 | O |

### 5.2 배포 절차 (Ubuntu 22.04 기준)

#### Step 1: 서버 초기 설정

```bash
# 1. 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 2. Node.js 20 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. PM2 설치 (프로세스 매니저)
sudo npm install -g pm2

# 4. Nginx 설치 (리버스 프록시)
sudo apt install -y nginx

# 5. Certbot 설치 (SSL)
sudo apt install -y certbot python3-certbot-nginx
```

#### Step 2: 프로젝트 배포

```bash
# 1. 프로젝트 클론
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/cheongyak-dashboard.git
cd cheongyak-dashboard

# 2. 의존성 설치 및 빌드
sudo npm ci
sudo npm run build

# 3. 환경 변수 설정
sudo nano .env.local
# NEXT_PUBLIC_KAKAO_API_KEY=xxx
# REB_API_KEY=xxx

# 4. PM2로 실행
pm2 start npm --name "cheongyak" -- start
pm2 save
pm2 startup
```

#### Step 3: Nginx 설정

```nginx
# /etc/nginx/sites-available/cheongyak
server {
    listen 80;
    server_name cheongyak.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 정적 파일 캐싱
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable";
    }

    location /data/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 1h;
        add_header Cache-Control "public, max-age=3600";
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/cheongyak /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL 인증서 발급
sudo certbot --nginx -d cheongyak.example.com
```

#### Step 4: 자동 배포 스크립트

```bash
#!/bin/bash
# /var/www/cheongyak-dashboard/deploy.sh

cd /var/www/cheongyak-dashboard
git pull origin main
npm ci
npm run build
pm2 restart cheongyak
```

---

## 6. 배포 전 체크리스트

### 6.1 코드 준비

- [ ] `.env.local`이 `.gitignore`에 포함되어 있는지 확인
- [ ] `npm run build` 로컬에서 성공하는지 확인
- [ ] TypeScript 에러 없는지 확인 (`npm run lint`)
- [ ] 테스트 통과 여부 확인

### 6.2 환경 변수

- [ ] `NEXT_PUBLIC_KAKAO_API_KEY` - 카카오 개발자 콘솔에서 발급
  - 플랫폼 등록: 웹 → 사이트 도메인 추가
- [ ] `REB_API_KEY` - 청약홈 API 키 (필요 시)

### 6.3 카카오 API 도메인 등록

1. [카카오 개발자 콘솔](https://developers.kakao.com) 접속
2. 내 애플리케이션 → 앱 설정 → 플랫폼
3. Web 플랫폼 등록:
   - Vercel: `https://your-project.vercel.app`
   - 커스텀 도메인: `https://cheongyak.example.com`

### 6.4 빌드 최적화

```javascript
// next.config.js - 프로덕션 최적화
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],

  // 정적 내보내기 (필요 시)
  // output: 'export',

  // 압축 활성화
  compress: true,

  // 소스맵 비활성화 (프로덕션)
  productionBrowserSourceMaps: false,
}
```

---

## 7. 배포 후 최적화

### 7.1 성능 모니터링

#### Vercel Analytics (무료)

```bash
npm install @vercel/analytics
```

```javascript
// src/app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

#### Web Vitals 측정

```javascript
// src/app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### 7.2 캐싱 전략

```javascript
// vercel.json
{
  "headers": [
    {
      "source": "/data/(.*).json",
      "headers": [
        { "key": "Cache-Control", "value": "public, s-maxage=86400, stale-while-revalidate=604800" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

### 7.3 이미지 최적화

```javascript
// 현재 프로젝트는 이미지가 적으므로 기본 설정 유지
// 필요 시 next/image 사용
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={50}
  priority
/>
```

### 7.4 번들 크기 분석

```bash
# 번들 분석기 설치
npm install @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);

# 분석 실행
ANALYZE=true npm run build
```

---

## 8. 비용 분석

### 8.1 예상 트래픽 시나리오

| 시나리오 | 일일 방문자 | 월 대역폭 | 추천 플랫폼 |
|----------|------------|----------|-------------|
| 소규모 | ~100명 | ~3GB | Vercel 무료 |
| 중규모 | ~1,000명 | ~30GB | Vercel 무료 |
| 대규모 | ~10,000명 | ~300GB | Vercel Pro / Cloudflare |

### 8.2 플랫폼별 예상 비용

#### 무료 운영 가능 (월 1,000명 이하)

| 플랫폼 | 월 비용 | 포함 사항 |
|--------|--------|----------|
| Vercel Hobby | $0 | 100GB 대역폭, 자동 배포 |
| Cloudflare Pages | $0 | 무제한 대역폭 |

#### 유료 전환 시

| 플랫폼 | 월 비용 | 포함 사항 |
|--------|--------|----------|
| Vercel Pro | $20 | 1TB 대역폭, 팀 기능 |
| VPS (Vultr) | $5~10 | 완전 제어, 서울 리전 |

### 8.3 숨겨진 비용

- **도메인**: 연 $10~15 (선택)
- **카카오 API**: 무료 (일 300,000회 제한)
- **청약홈 API**: 무료 (공공 데이터)

---

## 9. 결론 및 권장사항

### 9.1 최종 권장: Vercel

**이유:**
1. Next.js 최적화 - 자동 빌드 최적화, Edge Functions 지원
2. 무료 티어 충분 - 대부분의 사용 사례 커버
3. 간편한 배포 - Git 푸시만으로 자동 배포
4. 서울 리전 - 한국 사용자 대상 서비스에 최적
5. Preview Deployments - PR별 미리보기로 QA 용이

### 9.2 빠른 시작 요약

```bash
# 1. GitHub에 푸시
git remote add origin https://github.com/YOUR_USERNAME/cheongyak-dashboard.git
git push -u origin main

# 2. Vercel 연결
# https://vercel.com/new → GitHub 저장소 선택

# 3. 환경 변수 설정
# NEXT_PUBLIC_KAKAO_API_KEY=your_key

# 4. 배포 완료! (자동)
# https://your-project.vercel.app
```

### 9.3 체크포인트

| 단계 | 예상 시간 |
|------|----------|
| Vercel 가입 | 2분 |
| GitHub 연결 | 3분 |
| 환경 변수 설정 | 2분 |
| 첫 배포 | 3분 |
| 커스텀 도메인 (선택) | 10분 |
| **총 소요 시간** | **~10분** |

### 9.4 문제 해결

| 문제 | 해결책 |
|------|--------|
| 빌드 실패 | `npm run build` 로컬 테스트, 로그 확인 |
| 지도 안 뜸 | 카카오 API 도메인 등록 확인 |
| 환경 변수 미적용 | Vercel 대시보드에서 재배포 |
| 404 에러 | `vercel.json` 라우팅 설정 확인 |

---

## 부록: 유용한 링크

- [Vercel 공식 문서](https://vercel.com/docs)
- [Next.js 배포 가이드](https://nextjs.org/docs/deployment)
- [카카오 개발자 콘솔](https://developers.kakao.com)
- [Cloudflare Pages 문서](https://developers.cloudflare.com/pages)

---

*문서 작성일: 2026-02-03*
*프로젝트 버전: 1.0.0*
