/**
 * Page Reordering Tests - Refactored Version
 * 使用 POM 简化页面重排序测试
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';
import { getPdfPageCount } from '../utils/pdf-utils';

test.describe('Page Reordering - Refactored', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
    await app.waitForAppReady();
  });

  /**
   * 上传测试文件
   */
  async function uploadTestFiles(waitForAll = false): Promise<number> {
    const pdfPath = TestData.files.sample3PDF();
    const pngPath = TestData.files.samplePNG();
    
    const pdfPageCount = await getPdfPageCount(pdfPath);
    const expectedCount = pdfPageCount + 1; // PDF页数 + 1张PNG

    await pageList.uploadAndWaitReady([pdfPath, pngPath]);

    if (waitForAll) {
      // 等待所有缩略图加载
      await pageList.waitForThumbnailsReady(60000);
    }

    return expectedCount;
  }

  /**
   * 验证重排序后的持久化
   */
  async function verifyPersistence(
    page: Page,
    totalPages: number,
    targetIndex: number,
    expectedPageName: string
  ) {
    // 重载页面
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 等待页面加载
    await pageList.waitForPagesLoaded({ count: totalPages, timeout: 30000 });

    // 等待所有缩略图加载
    await expect(async () => {
      const readyCount = await page.getByTestId('page-thumbnail').count();
      expect(readyCount).toBe(totalPages);
    }).toPass({ timeout: 60000 });

    // 验证顺序持久化
    const persistedOrder = await pageList.getPageOrder();
    expect(persistedOrder[targetIndex]).toBe(expectedPageName);
  }

  test('should reorder pages after all pages are ready and persist after reload', async ({ page, browserName }) => {
    // 跳过 webkit（blob URL 限制）
    test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');
    test.setTimeout(120000);

    // 1. 上传文件并等待所有页面就绪
    const totalPages = await uploadTestFiles(true);

    // 2. 记录初始顺序
    const initialOrder = await pageList.getPageOrder();
    expect(initialOrder.length).toBe(totalPages);

    // 3. 拖拽第一个页面到第三个位置
    await pageList.dragAndDrop(0, 2);
    
    // 等待拖拽操作完成（通过验证顺序改变）
    await expect.poll(async () => {
      const order = await pageList.getPageOrder();
      return order[0] !== initialOrder[0];
    }, { timeout: 5000 }).toBe(true);

    // 4. 验证顺序改变
    const newOrder = await pageList.getPageOrder();
    expect(newOrder).not.toEqual(initialOrder);
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[2]);
    expect(newOrder[2]).toBe(initialOrder[0]);

    // 5. 验证持久化
    await verifyPersistence(page, totalPages, 2, initialOrder[0]);
  });

  test('should reorder pages when some pages are ready (drag ready page) and persist after reload', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');
    test.skip(browserName === 'firefox', 'Firefox has inconsistent drag behavior during concurrent PDF processing');
    test.setTimeout(120000);

    // 1. 上传文件但不等待所有页面就绪
    const totalPages = await uploadTestFiles(false);

    // 2. 等待至少2个页面就绪
    await page.waitForFunction(() => {
      const readyCount = document.querySelectorAll('[data-testid="page-thumbnail"]').length;
      return readyCount >= 2;
    }, { timeout: 60000 });

    // 3. 找到一个就绪的页面
    const pageItems = page.locator('.page-item');
    let readyPageIndex = -1;
    for (let i = 0; i < totalPages; i++) {
      const thumbnail = pageItems.nth(i).getByTestId('page-thumbnail');
      if (await thumbnail.isVisible()) {
        readyPageIndex = i;
        break;
      }
    }

    if (readyPageIndex === -1) {
      test.skip(true, 'No ready page found for testing');
      return;
    }

    // 4. 记录初始顺序
    const initialOrder = await pageList.getPageOrder();
    const draggedPageName = initialOrder[readyPageIndex];

    // 5. 拖拽页面
    const targetIndex = readyPageIndex === 0 ? 2 : 0;
    await pageList.dragAndDrop(readyPageIndex, targetIndex);
    
    // 等待拖拽操作完成
    await expect.poll(async () => {
      const order = await pageList.getPageOrder();
      return order[targetIndex] === draggedPageName;
    }, { timeout: 5000 }).toBe(true);

    // 6. 验证顺序改变
    const newOrder = await pageList.getPageOrder();
    expect(newOrder).not.toEqual(initialOrder);
    expect(newOrder[targetIndex]).toBe(draggedPageName);

    // 7. 验证持久化
    await verifyPersistence(page, totalPages, targetIndex, draggedPageName);
  });

  test('should reorder pages when some pages are ready (drag non-ready page) and persist after reload', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');
    test.skip(browserName === 'firefox', 'Firefox has inconsistent drag behavior during concurrent PDF processing');
    test.setTimeout(120000);

    // 1. 上传文件但不等待所有页面就绪
    const totalPages = await uploadTestFiles(false);

    // 2. 等待至少2个页面就绪
    await page.waitForFunction(() => {
      const readyCount = document.querySelectorAll('[data-testid="page-thumbnail"]').length;
      return readyCount >= 2;
    }, { timeout: 60000 });

    // 3. 找到一个未就绪的页面
    const pageItems = page.locator('.page-item');
    let nonReadyPageIndex = -1;
    for (let i = 0; i < totalPages; i++) {
      const thumbnail = pageItems.nth(i).getByTestId('page-thumbnail');
      if (!(await thumbnail.isVisible())) {
        nonReadyPageIndex = i;
        break;
      }
    }

    if (nonReadyPageIndex === -1) {
      test.skip(true, 'All pages completed too quickly, no non-ready page found for testing');
      return;
    }

    // 4. 记录初始顺序
    const initialOrder = await pageList.getPageOrder();
    const draggedPageName = initialOrder[nonReadyPageIndex];

    // 5. 拖拽页面
    const targetIndex = nonReadyPageIndex === 0 ? 2 : 0;
    await pageList.dragAndDrop(nonReadyPageIndex, targetIndex);
    
    // 等待拖拽操作完成
    await expect.poll(async () => {
      const order = await pageList.getPageOrder();
      return order[targetIndex] === draggedPageName;
    }, { timeout: 5000 }).toBe(true);

    // 6. 验证顺序改变
    const newOrder = await pageList.getPageOrder();
    expect(newOrder).not.toEqual(initialOrder);
    expect(newOrder[targetIndex]).toBe(draggedPageName);

    // 7. 验证持久化
    await verifyPersistence(page, totalPages, targetIndex, draggedPageName);
  });
});
