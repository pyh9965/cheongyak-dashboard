---
description: 전체 자동화 - 캐시 생성부터 서버 실행까지
---

// turbo-all

## 전체 자동화 프로세스

1. 의존성 확인: `npm install`
2. 캐시 업데이트: `node scripts/generate-cache.js`
3. 빌드 정리: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
4. 개발 서버 실행: `npm run dev`
