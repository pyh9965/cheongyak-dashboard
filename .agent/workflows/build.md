---
description: 프로덕션 빌드 실행
---

// turbo-all

## 빌드 프로세스

1. 기존 빌드 삭제: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
2. 프로덕션 빌드: `npm run build`
