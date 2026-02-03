import { test, expect } from '@playwright/test';

test.describe('청약경쟁률 대시보드 체크', () => {
  test.beforeEach(async ({ page }) => {
    // 콘솔 에러 및 경고 수집
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console Error:', msg.text());
      } else if (msg.type() === 'warning') {
        console.log('⚠️  Console Warning:', msg.text());
      }
    });

    // 페이지 에러 수집
    page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message);
    });

    // 네트워크 실패 수집
    page.on('requestfailed', request => {
      console.log('❌ Request Failed:', request.url(), request.failure()?.errorText);
    });
  });

  test('메인 페이지 로드 체크', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // 페이지 제목 확인
    await expect(page).toHaveTitle(/청약홈/);

    // 스크린샷 저장
    await page.screenshot({ path: 'test-results/main-page.png', fullPage: true });

    console.log('✅ 메인 페이지 로드 성공');
  });

  test('APT 페이지 로드 및 UI 요소 체크', async ({ page }) => {
    await page.goto('http://localhost:3000/apt');

    // 페이지 로드 대기
    await page.waitForLoadState('networkidle');

    // 주요 UI 요소 확인
    const checks = [
      { selector: 'h1', name: '페이지 제목' },
      { selector: 'table', name: '데이터 테이블' },
    ];

    for (const check of checks) {
      const element = page.locator(check.selector).first();
      const isVisible = await element.isVisible().catch(() => false);

      if (isVisible) {
        console.log(`✅ ${check.name} 발견`);
      } else {
        console.log(`❌ ${check.name} 없음`);
      }
    }

    // 전체 페이지 스크린샷
    await page.screenshot({ path: 'test-results/apt-page.png', fullPage: true });

    console.log('✅ APT 페이지 체크 완료');
  });

  test('데이터 로딩 및 표시 체크', async ({ page }) => {
    await page.goto('http://localhost:3000/apt');

    // API 응답 대기
    await page.waitForTimeout(3000);

    // 테이블 행 수 확인
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();

    console.log(`📊 테이블 행 수: ${rowCount}`);

    if (rowCount > 0) {
      console.log('✅ 데이터가 성공적으로 로드됨');
    } else {
      console.log('⚠️  테이블에 데이터가 없음');
    }
  });

  test('반응형 디자인 체크 - 모바일', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000/apt');
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'test-results/apt-mobile.png', fullPage: true });
    console.log('✅ 모바일 뷰 스크린샷 저장');
  });

  test('반응형 디자인 체크 - 태블릿', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('http://localhost:3000/apt');
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'test-results/apt-tablet.png', fullPage: true });
    console.log('✅ 태블릿 뷰 스크린샷 저장');
  });

  test('반응형 디자인 체크 - 데스크톱', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:3000/apt');
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: 'test-results/apt-desktop.png', fullPage: true });
    console.log('✅ 데스크톱 뷰 스크린샷 저장');
  });

  test('성능 체크', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('http://localhost:3000/apt');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    console.log(`⏱️  페이지 로드 시간: ${loadTime}ms`);

    if (loadTime < 3000) {
      console.log('✅ 페이지 로드 성능 양호');
    } else if (loadTime < 5000) {
      console.log('⚠️  페이지 로드 시간이 다소 느림');
    } else {
      console.log('❌ 페이지 로드 시간이 매우 느림');
    }
  });

  test('접근성 체크 - 키보드 네비게이션', async ({ page }) => {
    await page.goto('http://localhost:3000/apt');
    await page.waitForLoadState('networkidle');

    // Tab 키로 네비게이션 가능한지 확인
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName : 'NONE';
    });

    console.log(`⌨️  포커스된 요소: ${focusedElement}`);
    console.log('✅ 키보드 네비게이션 체크 완료');
  });

  test('지도 마커 표시 체크 (캐시된 좌표 사용)', async ({ page }) => {
    await page.goto('http://localhost:3000/apt');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click on the map tab (지도 탭 클릭)
    const mapTab = page.locator('button:has-text("지도")');
    if (await mapTab.isVisible()) {
      await mapTab.click();
      console.log('🗺️ 지도 탭 클릭');
    }

    // Wait for map container to load
    await page.waitForSelector('.leaflet-container', { timeout: 15000 });
    console.log('✅ 지도 컨테이너 로드됨');

    // Wait for markers to appear (give time for data loading and rendering)
    await page.waitForTimeout(5000);

    // Check for region markers (circle markers at zoom < 11)
    const markers = page.locator('.leaflet-marker-icon');
    const markerCount = await markers.count();

    console.log(`🗺️ 지도 마커 수: ${markerCount}`);

    // Should have at least some markers from cached coordinates
    expect(markerCount).toBeGreaterThan(0);

    // Take screenshot
    await page.screenshot({ path: 'test-results/map-markers.png' });
    console.log('✅ 지도 마커 스크린샷 저장');
  });
});
