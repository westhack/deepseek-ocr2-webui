import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Concurrent Operations', () => {
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

  test('should handle adding files during OCR', async ({ page }) => {
    // 设置 OCR 延迟，以便我们有时间在处理过程中添加文件
    await apiMocks.mockOCR({ delay: 5000 });

    // 上传第一批文件
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

    // 触发 OCR
    await ocrPage.triggerOCR(0);

    // 等待状态变为 recognizing
    await expect.poll(async () => await ocrPage.getPageStatus(0), {
      timeout: 20000,
      intervals: [500]
    }).toBe('recognizing');

    // 验证正在处理
    expect(await ocrPage.hasProcessingPages()).toBe(true);

    // 在 OCR 过程中添加新文件
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('.app-header button:has-text("Import Files")')
    ]);
    await fileChooser.setFiles([TestData.files.sampleJPG()]);

    // 等待第二个页面出现
    await pageList.waitForPagesLoaded({ count: 2 });

    // 验证两个文件都存在
    expect(await pageList.getPageCount()).toBe(2);

    // 触发第二个页面的 OCR
    await ocrPage.triggerOCR(1);

    // 等待所有 OCR 完成
    await ocrPage.waitForAllOCRComplete(60000);

    // 验证状态
    const statuses = await ocrPage.getAllPageStatuses();
    expect(TestData.pageStatuses.ocrComplete).toContain(statuses[0]);
    expect(TestData.pageStatuses.ocrComplete).toContain(statuses[1]);
  });

  test('should handle rapid multiple file uploads', async ({ page }) => {
    // 连续多次触发文件上传
    for (let i = 0; i < 3; i++) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('.app-header button:has-text("Import Files")')
      ]);
      await fileChooser.setFiles([TestData.files.samplePNG()]);
      await page.waitForTimeout(300);
    }

    // 等待所有文件加载并缩略图就绪
    await pageList.waitForPagesLoaded({ count: 3 });
    await pageList.waitForThumbnailsReady();

    expect(await pageList.getPageCount()).toBe(3);
  });

  test('should handle deletion during OCR', async ({ page: _page }) => {
    // 设置长时间 OCR
    await apiMocks.mockOCR({ delay: 5000 });

    await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);

    // 触发第一个页面的 OCR
    await ocrPage.triggerOCR(0);

    // 等待状态变为 recognizing
    await expect.poll(async () => await ocrPage.getPageStatus(0), {
      timeout: 20000,
      intervals: [500]
    }).toBe('recognizing');

    // 确保第一个页面正在处理
    expect(await ocrPage.getPageStatus(0)).toBe('recognizing');

    // 删除第二个页面 (处于 ready 状态)
    await pageList.selectPage(1);
    await pageList.deleteSelected();

    // 验证只剩下一个页面
    expect(await pageList.getPageCount()).toBe(1);

    // 等待 OCR 完成
    await ocrPage.waitForAllOCRComplete(60000);
    expect(TestData.pageStatuses.ocrComplete).toContain(await ocrPage.getPageStatus(0));
  });
});
