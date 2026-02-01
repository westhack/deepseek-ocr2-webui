/**
 * Batch Export Tests - Refactored Version
 * 使用 Page Object Models 和参数化测试减少代码重复
 */

import { test, expect } from '../fixtures/base-test';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import { uploadFiles } from '../utils/file-upload';
import { waitForOCRSuccessByPageId } from '../helpers/ocr-helpers';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

test.describe('Batch Export (Refactored)', () => {
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    // 初始化 Page Objects
    apiMocks = new APIMocks(page);

    // 设置 Mock（必须在 goto 之前）
    await apiMocks.mockOCR();
    // Explicitly set health to healthy to avoid "Queue Full" errors during batch operations
    await apiMocks.mockHealth({
      status: 'healthy',
      queueInfo: { depth: 0, max_size: 10, is_full: false }
    });

    // 导航到应用
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 清空数据库
    await page.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      await db.clearAllData();
      if (window.pagesStore) {
        window.pagesStore.pages = [];
        window.pagesStore.selectedPageIds = new Set();
      }
    });

    // 等待应用稳定
    await page.waitForLoadState('domcontentloaded');
  });

  /**
   * 参数化测试: 部分页面完成 OCR 的情况
   * 覆盖所有导出格式
   */
  for (const format of TestData.exportFormats) {
    test(`should export ${format.type} with some pages not ready`, async ({ page }) => {
      // 1. 上传 3 张图片
      await page.goto('/');
      await page.waitForSelector('.app-header button');

      await uploadFiles(page, TestData.files.multipleImages(), '.app-header button', true);

      // 等待页面项出现
      const pageItems = page.locator('[data-testid^="page-item-"]');
      await expect(pageItems).toHaveCount(3, { timeout: 30000 });

      // 2. 触发前 2 页的 OCR
      for (let i = 0; i < 2; i++) {
        const pageId = await pageItems.nth(i).getAttribute('data-page-id');
        await pageItems.nth(i).click();

        // 等待页面被选中（active 表示当前选中的页面）
        await expect(pageItems.nth(i)).toHaveClass(/active/);

        // 等待 PageViewer 上下文切换到正确的页面
        await page.waitForFunction((id) => {
          const viewer = document.querySelector('[data-testid="page-viewer"]');
          return viewer?.dataset?.currentPageId === id;
        }, pageId, { timeout: 5000 });

        // 安全点击 OCR 按钮
        const ocrButton = page.getByTestId('ocr-trigger-btn');
        await expect(ocrButton).toBeEnabled();
        await ocrButton.click();

        // 使用健壮的辅助函数等待 OCR 完成（包含错误处理）
        await waitForOCRSuccessByPageId(page, pageId, 45000); // 增加超时到 45 秒

        // 等待OCR结果保存
        await page.waitForLoadState('networkidle');
      }

      // 刷新 store
      await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
      await page.waitForLoadState('networkidle');

      // 3. 全选并导出
      await page.getByTestId('select-all-checkbox').click();
      // 等待所有页面被选中
      await expect(async () => {
        const selectedCount = await page.locator('[data-testid^="page-item-"].selected').count();
        expect(selectedCount).toBe(3);
      }).toPass({ timeout: 3000 });

      // 4. 触发导出
      const exportTrigger = page.getByTestId('export-selected-btn');
      await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
      await exportTrigger.click();

      // 选择格式（下拉菜单选项使用文本定位，i18n 需要注意）
      await page.locator(`.n-dropdown-option:has-text("Export as ${format.type}")`).click();

      // 5. 验证确认对话框
      const warningDialog = page.locator('.n-dialog.n-modal.export-warning-dialog');
      await expect(warningDialog).toBeVisible({ timeout: 10000 });

      // 6. 关键修复：在点击按钮之前设置下载监听，并确保监听器已准备好
      // 使用 Promise.all 确保下载监听和点击操作几乎同时发生，避免竞态条件
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });

      // 给 Playwright 一点时间确保下载监听器已完全准备好
      await page.waitForTimeout(100);

      // 使用 positiveText 匹配按钮（i18n 需要注意文本变化）
      await warningDialog.locator('.n-dialog__action button:has-text("Skip & Export")').click();

      // 直接等待下载，不要等待对话框关闭或其他操作
      // 因为 downloadBlob 在 performExport 完成后立即调用，可能在对话框关闭之前就触发了
      const download = await downloadPromise;

      // 7. 验证文件名
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`^document_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${format.extension}$`)
      );

      // 8. 验证内容
      const downloadPath = await download.path();
      await validateExportContent(downloadPath!, format, 2); // 只有 2 页完成 OCR

      // 清理
      await download.delete();
    });
  }

  /**
   * 参数化测试: 所有页面完成 OCR 的情况
   * 覆盖所有导出格式
   */
  for (const format of TestData.exportFormats) {
    test(`should export ${format.type} when all pages ready`, async ({ page }) => {
      // 1. 上传 2 张图片
      await page.goto('/');
      await page.waitForSelector('.app-header button');

      const filePaths = [TestData.files.samplePNG(), TestData.files.sampleJPG()];
      await uploadFiles(page, filePaths, '.app-header button', true);

      // 等待页面项出现
      const pageItems = page.locator('[data-testid^="page-item-"]');
      await expect(pageItems).toHaveCount(2, { timeout: 30000 });

      // 2. 触发所有页面的 OCR
      for (let i = 0; i < 2; i++) {
        const pageId = await pageItems.nth(i).getAttribute('data-page-id');
        await pageItems.nth(i).click();

        // 等待页面被选中（active 表示当前选中的页面）
        await expect(pageItems.nth(i)).toHaveClass(/active/);

        // 等待 PageViewer 上下文切换到正确的页面
        await page.waitForFunction((id) => {
          const viewer = document.querySelector('[data-testid="page-viewer"]');
          return viewer?.dataset?.currentPageId === id;
        }, pageId, { timeout: 5000 });

        // 安全点击 OCR 按钮
        const ocrButton = page.getByTestId('ocr-trigger-btn');
        await expect(ocrButton).toBeEnabled();
        await ocrButton.click();

        // 使用健壮的辅助函数等待 OCR 完成（包含错误处理）
        await waitForOCRSuccessByPageId(page, pageId, 45000); // 增加超时到 45 秒

        // 等待OCR结果保存
        await page.waitForLoadState('networkidle');
      }

      // 刷新 store
      await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
      await page.waitForLoadState('networkidle');

      // 3. 全选
      await page.getByTestId('select-all-checkbox').click();
      // 等待所有页面被选中
      await expect(async () => {
        const selectedCount = await page.locator('[data-testid^="page-item-"].selected').count();
        expect(selectedCount).toBe(2);
      }).toPass({ timeout: 3000 });

      // 4. 触发导出
      const exportTrigger = page.getByTestId('export-selected-btn');
      await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
      await exportTrigger.click();

      // 选择格式并直接下载（无需确认）
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
      // 下拉菜单选项使用文本定位（i18n 需要注意）
      await page.locator(`.n-dropdown-option:has-text("Export as ${format.type}")`).click();

      // 5. 验证下载
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`^document_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${format.extension}$`)
      );

      // 6. 验证内容
      const downloadPath = await download.path();
      await validateExportContent(downloadPath!, format, 2); // 所有 2 页都完成

      // 清理
      await download.delete();
    });
  }
});

/**
 * 提取的验证逻辑
 * 根据不同的导出格式验证内容
 */
async function validateExportContent(
  filePath: string,
  format: typeof TestData.exportFormats[number],
  expectedPageCount: number
) {
  if (format.type === 'Markdown') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(format.validation.contentPattern);
    expect(matches?.length || 0).toBe(format.validation.expectedMatches);

    // 验证分页符数量（页数 - 1）
    const sections = content.split('\n\n---\n\n');
    expect(sections.length).toBe(expectedPageCount);
  } else if (format.type === 'DOCX') {
    // eslint-disable-next-line sonarjs/no-unsafe-unzip
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const docXml = await zip.file(format.validation.xmlPath!)?.async('text');
    expect(docXml).toBeDefined();
    const matches = docXml!.match(format.validation.contentPattern!);
    expect(matches?.length || 0).toBe(format.validation.expectedMatches);
  } else if (format.type === 'PDF') {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(expectedPageCount);
  }
}
