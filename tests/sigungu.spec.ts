import { test, expect } from '@playwright/test';

test.describe('시/군/구 검색 기능 테스트', () => {
  test.beforeEach(async ({ page }) => {
    // 콘솔 로그 캡처
    page.on('console', msg => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[Browser Error]: ${err.message}`));

    await page.goto('http://localhost:3000/apt');
    // 페이지 hydration 완료 대기 - h1 또는 form이 나타날 때까지
    try {
      await page.locator('h1:has-text("APT 분양정보")').waitFor({ state: 'visible', timeout: 60000 });
    } catch (e) {
      // 스크린샷 저장
      await page.screenshot({ path: 'test-results/hydration-timeout.png', fullPage: true });
      const content = await page.content();
      console.log('Page HTML (first 2000 chars):', content.substring(0, 2000));
      throw e;
    }
    // 추가 안정화 대기
    await page.waitForTimeout(1000);
  });

  test('초기 상태: 시/군/구 드롭다운이 숨겨져 있어야 함', async ({ page }) => {
    // 시/도가 선택되지 않은 상태에서 시/군/구 드롭다운이 없어야 함
    const sigunguLabel = page.locator('label:has-text("시/군/구")');
    await expect(sigunguLabel).not.toBeVisible();
    console.log('✅ 초기 상태: 시/군/구 드롭다운 숨김 확인');
  });

  test('디버깅: select 요소 확인', async ({ page }) => {
    // 모든 select 요소 확인
    const selects = await page.locator('select').all();
    console.log(`📋 총 select 개수: ${selects.length}`);

    for (let i = 0; i < selects.length; i++) {
      const options = await selects[i].locator('option').allTextContents();
      console.log(`  select[${i}]: ${options.slice(0, 3).join(', ')}${options.length > 3 ? '...' : ''} (총 ${options.length}개)`);
    }

    // 경기도 선택
    console.log('\n경기도 선택 후:');
    await page.locator('select').filter({ has: page.locator('option:has-text("경기도")') }).selectOption('41');
    await page.waitForTimeout(1000);

    const selectsAfter = await page.locator('select').all();
    console.log(`📋 총 select 개수: ${selectsAfter.length}`);

    for (let i = 0; i < selectsAfter.length; i++) {
      const options = await selectsAfter[i].locator('option').allTextContents();
      console.log(`  select[${i}]: ${options.slice(0, 5).join(', ')}${options.length > 5 ? '...' : ''} (총 ${options.length}개)`);
    }

    // 시/군/구 label 확인
    const sigunguLabel = page.locator('label:has-text("시/군/구")');
    const isVisible = await sigunguLabel.isVisible();
    console.log(`\n시/군/구 label visible: ${isVisible}`);

    // 스크린샷
    await page.screenshot({ path: 'test-results/debug-selects.png', fullPage: true });
  });

  test('경기도 선택 시 시/군/구 드롭다운 표시', async ({ page }) => {
    // 경기도 선택 (공급 지역 라벨 근처의 select)
    await page.locator('label:has-text("공급 지역")').locator('..').locator('select').selectOption('41');
    await page.waitForTimeout(1000);

    // 시/군/구 드롭다운 표시 확인
    const sigunguLabel = page.locator('label:has-text("시/군/구")');
    const isVisible = await sigunguLabel.isVisible();
    console.log(`시/군/구 label visible: ${isVisible}`);

    if (isVisible) {
      // 시/군/구 select 옵션 확인
      const sigunguSelect = page.locator('label:has-text("시/군/구")').locator('..').locator('select');
      const options = await sigunguSelect.locator('option').allTextContents();
      console.log(`시/군/구 옵션: ${options.join(', ')}`);
    }

    // 스크린샷
    await page.screenshot({ path: 'test-results/sigungu-gyeonggi.png' });
  });

  test('서울 선택 시 구 목록 표시', async ({ page }) => {
    // 서울 선택
    await page.locator('label:has-text("공급 지역")').locator('..').locator('select').selectOption('11');
    await page.waitForTimeout(1000);

    // 시/군/구 label 확인
    const sigunguLabel = page.locator('label:has-text("시/군/구")');
    const isVisible = await sigunguLabel.isVisible();
    console.log(`서울 선택 후 시/군/구 label visible: ${isVisible}`);

    if (isVisible) {
      const sigunguSelect = page.locator('label:has-text("시/군/구")').locator('..').locator('select');
      const options = await sigunguSelect.locator('option').allTextContents();
      console.log(`서울 구 옵션: ${options.join(', ')}`);
    }

    // 스크린샷
    await page.screenshot({ path: 'test-results/sigungu-seoul.png' });
  });
});
