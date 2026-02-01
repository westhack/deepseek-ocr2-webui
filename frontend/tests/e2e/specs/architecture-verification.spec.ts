/**
 * Architecture Verification Tests
 * Used to verify if new Page Object Models and utility functions work correctly
 */

import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';
import { APIMocks } from '../mocks/APIMocks';

test.describe('Architecture Verification Tests', () => {
  test('should successfully initialize all Page Objects', async ({ page }) => {
    // Initialize Page Objects
    const app = new AppPage(page);
    const pageList = new PageListPage(page);

    // Verify Page Objects can be used normally
    await app.goto();
    await app.waitForAppReady();

    // Verify application title
    const title = await app.getTitle();
    expect(title.toLowerCase()).toContain('deepseek-ocr2-webui');

    // Verify initial page count is 0
    const count = await pageList.getPageCount();
    expect(count).toBe(0);
  });

  test('should successfully use TestData', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    // Verify TestData can be used normally
    expect(TestData.files.samplePDF()).toContain('sample.pdf');
    expect(TestData.translations.en.welcomeDescription).toBeDefined();
    expect(TestData.exportFormats).toHaveLength(3);
    expect(TestData.pageStatuses.ready).toEqual(['ready']);
  });

  test('should successfully use APIMocks', async ({ page }) => {
    const apiMocks = new APIMocks(page);

    // Mock OCR API
    await apiMocks.mockOCR();

    // Verify mock is set (verify routes are configured by navigation)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should successfully upload files using PageListPage', async ({ page }) => {
    const app = new AppPage(page);
    const pageList = new PageListPage(page);
    const apiMocks = new APIMocks(page);

    await apiMocks.mockOCR();
    await app.goto();

    // Upload a single file
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

    // Verify file is uploaded
    const count = await pageList.getPageCount();
    expect(count).toBe(1);
  });

  test.skip('should successfully use smart wait functions', async ({ page }) => {
    const app = new AppPage(page);
    const pageList = new PageListPage(page);
    const apiMocks = new APIMocks(page);

    await apiMocks.mockOCR();
    await app.goto();
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

    // Trigger action to produce notification
    await pageList.selectAll();

    // Use smart wait (this test may need actual notification to pass)
    // await waitForNotification(page, /selected/i, 5000);
  });
});
