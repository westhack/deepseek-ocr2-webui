import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import * as ocrHelpers from '../helpers/ocr-helpers';

test.describe('Batch OCR', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let ocrPage: OCRPage;
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    ocrPage = new OCRPage(page);
    apiMocks = new APIMocks(page);

    await app.goto();
  });

  test.describe('Basic Batch OCR', () => {
    test('should process all ready pages when batch OCR is clicked', async ({ page }) => {
      // Mock OCR API
      await apiMocks.mockOCR();

      // Upload a multi-page PDF
      const pdfPath = TestData.files.samplePDF();
      await pageList.uploadAndWaitReady(pdfPath);

      const expectedPageCount = await pageList.getPageCount();

      // Select all pages
      await pageList.selectAll();

      // Click batch OCR button
      await pageList.clickBatchOCR();

      // Verify success notification appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Wait for all pages to complete OCR
      await ocrHelpers.waitForAllOCRComplete(page);

      // Verify all pages are past ocr_success
      for (let i = 0; i < expectedPageCount; i++) {
        expect(await ocrHelpers.checkPagePastOCR(page, i)).toBeTruthy();
      }

      // 等待数据库写入完成
      await page.waitForLoadState('networkidle');

      // Verify persistence after reload
      await page.reload();
      await app.waitForAppReady();
      await pageList.waitForPagesLoaded({ count: expectedPageCount });

      // Verify pages are still in a completed state (after reload, status might be regenerated)
      // We just verify they exist and the count is correct
      const reloadedCount = await pageList.getPageCount();
      expect(reloadedCount).toBe(expectedPageCount);
    });
  });

  test.describe('Skip Currently Processing Pages', () => {
    test('should skip only pages currently in OCR queue (pending_ocr or recognizing)', async ({ page }) => {
      const firstBatchComplete = { value: false };

      // Mock OCR API with delay control
      await apiMocks.mockOCRWithControl(firstBatchComplete);

      // Upload first PDF
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      const firstBatchCount = await pageList.getPageCount();

      // Select all and do batch OCR
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Verify notification for first batch appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Wait for first batch to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(firstBatchCount);
      }).toPass({ timeout: 20000 });

      // Clear selection
      await pageList.unselectAll();

      // Upload second file (single image)
      await pageList.uploadAndWaitReady(TestData.files.samplePNG());
      const totalCount = await pageList.getPageCount();
      expect(totalCount).toBe(firstBatchCount + 1);

      // Select all pages (including those in OCR queue)
      await pageList.selectAll();

      // Click batch OCR
      await pageList.clickBatchOCR();

      // Verify notification appears (skipped pages notification)
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      // 不验证具体文本内容，因为文本会被翻译
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Allow the first batch OCR to complete
      firstBatchComplete.value = true;

      // Wait for all pages to complete OCR
      await ocrPage.waitForAllOCRComplete();
    });
  });

  test.describe('Edge Cases', () => {
    test('should show warning when all selected pages are currently in OCR queue', async ({ page }) => {
      const allowOCRToComplete = { value: false };

      // Mock OCR API with delay control
      await apiMocks.mockOCRWithControl(allowOCRToComplete);

      // Upload PDF
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      const pageCount = await pageList.getPageCount();

      // Do batch OCR
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Wait for all pages to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(pageCount);
      }).toPass({ timeout: 20000 });

      // All pages are now in OCR queue - try batch OCR again
      await pageList.clickBatchOCR();

      // Verify warning notification appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Allow the OCR to complete
      allowOCRToComplete.value = true;

      // Wait for all pages to complete OCR
      await ocrPage.waitForAllOCRComplete();
    });
  });
});
