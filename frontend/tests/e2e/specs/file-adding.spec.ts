/**
 * File Adding Tests - Refactored Version
 * 使用 POM 和 TestData 简化文件上传测试
 */

import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { PageViewerPage } from '../pages/PageViewerPage';
import { TestData } from '../data/TestData';
import { getPdfPageCount } from '../utils/pdf-utils';

test.describe('File Adding - Refactored', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let pageViewer: PageViewerPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    pageViewer = new PageViewerPage(page);
    
    await app.goto();
    await app.waitForAppReady();
  });

  test('should process uploaded PDF and generate thumbnail', async () => {
    const filePath = TestData.files.samplePDF();
    const expectedPageCount = await getPdfPageCount(filePath);

    // 上传并等待处理完成
    await pageList.uploadAndWaitReady([filePath]);

    // 验证页面数量
    expect(await pageList.getPageCount()).toBe(expectedPageCount);

    // 验证第一个页面可见
    expect(await pageList.isPageVisible(0)).toBe(true);
  });

  test('should process multiple files uploaded simultaneously', async () => {
    const filePaths = [
      TestData.files.samplePDF(),
      TestData.files.samplePNG(),
      TestData.files.sampleJPG()
    ];

    // 计算预期总页数
    const pdfPageCount = await getPdfPageCount(filePaths[0]);
    const expectedTotalCount = pdfPageCount + 2; // PDF页数 + 2张图片

    // 上传并等待
    await pageList.uploadAndWaitReady(filePaths);

    // 验证页面数量
    expect(await pageList.getPageCount()).toBe(expectedTotalCount);

    // 验证所有缩略图可见
    expect(await pageList.areAllThumbnailsVisible()).toBe(true);

    // 验证前3个页面都可见
    for (let i = 0; i < 3; i++) {
      expect(await pageList.isPageVisible(i)).toBe(true);
    }
  });

  test('should handle repeated upload of the same file', async () => {
    const filePath = TestData.files.samplePDF();
    const singleFilePageCount = await getPdfPageCount(filePath);

    // 第一次上传
    await pageList.uploadAndWaitReady([filePath]);
    expect(await pageList.getPageCount()).toBe(singleFilePageCount);

    // 第二次上传（相同文件）
    await pageList.uploadAndWaitReady([filePath]);

    // 应该有两倍的页面
    const expectedTotalCount = singleFilePageCount * 2;
    expect(await pageList.getPageCount()).toBe(expectedTotalCount);

    // 确保所有项都已处理
    expect(await pageList.areAllThumbnailsVisible()).toBe(true);
  });

  test('should sync selection when adding two images sequentially', async ({ page }) => {
    const pngPath = TestData.files.samplePNG();
    const jpgPath = TestData.files.sampleJPG();

    // 1. 添加第一张图片（PNG）
    await pageList.uploadAndWaitReady([pngPath]);

    // 等待选择状态更新
    await expect.poll(async () => await pageList.isPageSelected(0), {
      timeout: 3000
    }).toBe(true);

    // 验证 PNG 被选中
    expect(await pageList.isPageSelected(0)).toBe(true);

    // 验证页面查看器显示 PNG（141.8 KB）
    await pageViewer.waitForImageLoaded();
    const viewerText = await page.locator('.page-viewer').textContent();
    expect(viewerText).toContain('141.8 KB');

    // 2. 添加第二张图片（JPG）
    await pageList.uploadAndWaitReady([jpgPath]);

    // 等待两个页面都可见
    expect(await pageList.getPageCount()).toBe(2);

    // 等待选择状态更新（第二张图片被选中）
    await expect.poll(async () => await pageList.isPageSelected(1), {
      timeout: 3000
    }).toBe(true);

    // 验证第二张图片（JPG）现在被选中（自动切换）
    expect(await pageList.isPageSelected(1)).toBe(true);
    expect(await pageList.isPageSelected(0)).toBe(false);

    // 验证页面查看器显示新图片（9.1 KB）
    await pageViewer.waitForImageLoaded();
    const newViewerText = await page.locator('.page-viewer').textContent();
    expect(newViewerText).toContain('9.1 KB');
    expect(newViewerText).not.toContain('No image available');

    // 3. 点击返回第一张图片
    await pageList.clickPage(0);

    // 验证选择返回到第一张图片
    expect(await pageList.isPageSelected(0)).toBe(true);
    expect(await pageList.isPageSelected(1)).toBe(false);

    // 验证页面查看器再次更新到 PNG 大小
    await pageViewer.waitForImageLoaded();
    const backViewerText = await page.locator('.page-viewer').textContent();
    expect(backViewerText).toContain('141.8 KB');
  });

  test('should handle canceling file selection', async ({ page }) => {
    const initialCount = await pageList.getPageCount();

    // 触发文件选择器但不选择任何文件
    // 在 Playwright 中，这可以通过等待事件但不设置文件来模拟
    // 或者简单地点击按钮并检查没有新页面添加
    await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('.app-header button:has-text("Import Files")')
    ]);
    
    // 模拟取消：在 Playwright 中，如果不调用 setFiles，就相当于取消了对话框
    // 等待一段时间后验证页面数量没有变化
    await page.waitForLoadState('networkidle');
    
    expect(await pageList.getPageCount()).toBe(initialCount);
  });
});
