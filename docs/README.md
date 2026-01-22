# 청약홈 APT 분양정보/경쟁률 조회 프로그램

C 언어로 구현된 공공데이터포털 청약홈 API 클라이언트입니다.

## 기능

- APT 분양정보 조회
- 주택명, 지역별 검색
- 페이지네이션 지원
- 아스키 기반 콘솔 UI

## 요구사항

- GCC 컴파일러
- libcurl (HTTP 클라이언트)
- cJSON (JSON 파서)

## 빌드

### Windows

**방법 1: 배치 파일 사용 (MinGW-w64 설치 필요)**
```cmd
build.bat
```

**방법 2: 직접 컴파일**
```cmd
gcc -Wall -Wextra -std=c11 -g src\main.c src\config.c src\api_client.c src\json_parser.c src\ui.c -o build\cheongyak.exe -lcurl -lcjson -lm
```

### Linux/macOS

```bash
make
# 또는
make run
```

## 실행

### Windows
```cmd
build\cheongyak.exe
```

### Linux/macOS
```bash
./build/cheongyak
```

## 환경 설정

`.env` 파일에 API 키를 설정해야 합니다:

```
REB_API_KEY=your_api_key_here
```

## 의존성 설치

### Windows (MSYS2/MinGW-w64)

1. **MSYS2 설치**: https://www.msys2.org/
2. **MSYS2 터미널에서 실행**:
```bash
pacman -Syu
pacman -S mingw-w64-x86_64-gcc
pacman -S mingw-w64-x86_64-curl
pacman -S mingw-w64-x86_64-cjson
```

3. **환경 변수 설정** (PowerShell에서):
```powershell
$env:Path += ";C:\msys64\mingw64\bin"
```

**또는 Visual Studio Build Tools 사용**:
- Visual Studio 2022 설치 시 "C++ 빌드 도구" 선택
- vcpkg를 사용하여 라이브러리 설치

### Linux (Ubuntu/Debian)

```bash
sudo apt-get install libcurl4-openssl-dev libcjson-dev
```

### macOS

```bash
brew install curl cjson
```

## 프로젝트 구조

```
├── .env                    # API 키 설정
├── Makefile                # 빌드 설정
├── README.md               # 이 파일
├── src/
│   ├── main.c             # 메인 프로그램
│   ├── config.c/h          # 환경변수 관리
│   ├── api_client.c/h      # API 클라이언트
│   ├── json_parser.c/h     # JSON 파서
│   └── ui.c/h              # UI 렌더링
└── build/                  # 컴파일 결과물
```

