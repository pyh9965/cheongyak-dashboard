# 캐시 파일 안내

이 디렉토리에는 청약 데이터 캐시 파일이 저장됩니다.

## 파일 구조

- `cheongyak-archive.json`: 2025년 12월까지의 과거 데이터 (정적 캐시)
- `address-coordinates.json`: 지오코딩 좌표 캐시 (Phase 3에서 생성)

## 캐시 생성 방법

```bash
# 1. 개발 서버 실행 (다른 터미널에서)
npm run dev

# 2. 캐시 생성 스크립트 실행
npm run generate-cache
```

## .gitignore 설정

대용량 캐시 파일은 Git에 커밋하지 않도록 설정하세요:

```
# 캐시 파일 제외
/data/cheongyak-archive.json
/data/address-coordinates.json
```

작은 샘플 파일만 커밋하거나, 프로덕션 빌드 시 자동 생성하도록 구성하세요.
