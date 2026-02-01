import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { ExportPage } from '../pages/ExportPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Error Handling', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let ocrPage: OCRPage;
  let exportPage: ExportPage;
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    ocrPage = new OCRPage(page);
    exportPage = new ExportPage(page);
    apiMocks = new APIMocks(page);

    await app.goto();
    await app.waitForAppReady();
  });

  test('should handle OCR 500 error', async ({ page }) => {
    // Mock OCR 失败
    await apiMocks.mockOCR({ shouldFail: true, statusCode: 500 });

    // 上传并触发 OCR
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await ocrPage.triggerOCR(0);

    // 验证状态变为失败 (Store updates this)
    await page.waitForFunction(() => {
      const pages = window.pagesStore?.pages || [];
      return pages[0]?.status === 'error';
    }, { timeout: 15000 });

    // 验证 OCR 按钮重新变为可用 (即"重试"机制)
    // 在 error 状态下，isScanning 为 false，按钮恢复可用
    const pageItem = page.locator('[data-testid^="page-item-"]').first();
    const ocrBtn = pageItem.getByTestId('scan-page-btn');
    await expect(ocrBtn).toBeEnabled();

    // 验证错误消息出现
    // 注意: Naive UI 的 message API 不支持 class 选项，通过通用的 .n-message 验证
    // 我们已经通过按钮状态和页面状态验证了错误处理逻辑，消息出现作为额外验证
    await expect(page.locator('.n-message').first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle network timeout during OCR', async () => {
    // Mock 较大的延迟以测试前端处理
    await apiMocks.mockOCR({ delay: 15000 });

    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await ocrPage.triggerOCR(0);

    // 验证系统在长时间处理时仍然稳定 (处于 recognizing 状态)
    await expect.poll(async () => await ocrPage.getPageStatus(0), {
      timeout: 5000
    }).toBe('recognizing');
  });

  test('should handle export failure gracefully', async ({ page }) => {
    // 上传文件并完成 OCR
    await apiMocks.mockOCR();
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await ocrPage.triggerOCR(0);
    await ocrPage.waitForOCRSuccess(0);

    // 选中页面
    await pageList.selectAll();

    // 模拟导出失败
    await apiMocks.mockExport({ shouldFail: true, statusCode: 500 });

    // 尝试导出
    await exportPage.clickExportButton();
    await exportPage.selectExportFormat('Markdown');

    // 验证错误消息出现
    // 注意: Naive UI 的 message API 不支持 class 选项，通过通用的 .n-message 验证
    await expect(page.locator('.n-message').first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle offline status during export', async ({ page, context }) => {
    // 上传文件并完成 OCR
    await apiMocks.mockOCR();
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await ocrPage.triggerOCR(0);
    await ocrPage.waitForOCRSuccess(0);

    await pageList.selectAll();

    // 模拟断网
    await context.setOffline(true);

    // 尝试导出
    await exportPage.clickExportButton();
    await exportPage.selectExportFormat('Markdown');

    // 验证错误消息出现（网络错误也会触发导出错误）
    // 注意: Naive UI 的 message API 不支持 class 选项，通过通用的 .n-message 验证
    await expect(page.locator('.n-message').first()).toBeVisible({ timeout: 10000 });

    // 恢复网络
    await context.setOffline(false);
  });
});
