@echo off
title 청약경쟁률 대시보드 실행기
echo ===================================================
echo   청약경쟁률 대시보드를 실행합니다...
echo ===================================================

cd /d "%~dp0"

:: node_modules 확인
if not exist "node_modules\" (
    echo node_modules 폴더가 없습니다. 의존성을 설치합니다...
    call npm install --legacy-peer-deps
)

:: 브라우저 자동 실행 (약간의 지연 후)
start "" "http://localhost:3000/apt"

:: Next.js 개발 서버 실행
echo.
echo 서버가 시작될 때까지 잠시만 기다려주세요...
echo 실행 후 브라우저가 자동으로 열리지 않으면 http://localhost:3000/apt 에 접속하세요.
echo.
npm run dev

pause
