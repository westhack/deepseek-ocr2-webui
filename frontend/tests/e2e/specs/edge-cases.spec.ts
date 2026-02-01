import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Edge Cases', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    
    await app.goto();
  });

  test('should handle empty page list operations', async ({ page }) => {
    // 验证初始状态下相关按钮不在页面上 (v-if="pages.length > 0")
    const batchOCRBtn = page.getByTestId('batch-ocr-btn');
    const exportBtn = page.getByTestId('export-selected-btn');
    const selectAllCheckbox = page.getByTestId('select-all-checkbox');
    const deleteBtn = page.getByTestId('delete-selected-btn');

    await expect(batchOCRBtn).not.toBeVisible();
    await expect(exportBtn).not.toBeVisible();
    await expect(selectAllCheckbox).not.toBeVisible();
    await expect(deleteBtn).not.toBeVisible();
  });

  test('should handle reordering back and forth rapidly', async ({ page }) => {
    const files = [
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ];
    await pageList.uploadAndWaitReady(files);
    
    // 显式等待所有页面加载完成
    await pageList.waitForPagesLoaded({ count: 3 });
    await pageList.waitForThumbnailsReady();

    const originalOrder = await pageList.getPageOrder();
    expect(originalOrder).toHaveLength(3);
    
    // 快速移动 0 -> 2
    await pageList.dragAndDrop(0, 2);
    // 等待顺序改变
    await expect.poll(async () => {
      const order = await pageList.getPageOrder();
      return JSON.stringify(order) !== JSON.stringify(originalOrder);
    }, { timeout: 3000 }).toBe(true);
    
    let currentOrder = await pageList.getPageOrder();
    expect(currentOrder).not.toEqual(originalOrder);

    // 快速移动回来 2 -> 0
    await pageList.dragAndDrop(2, 0);
    // 等待顺序恢复
    await expect.poll(async () => {
      const order = await pageList.getPageOrder();
      return JSON.stringify(order) === JSON.stringify(originalOrder);
    }, { timeout: 3000 }).toBe(true);

    // 验证顺序最终恢复
    const finalOrder = await pageList.getPageOrder();
    expect(finalOrder).toEqual(originalOrder);
    
    // 验证 store 中的数据也是一致的
    interface WindowWithStore extends Window {
      pagesStore?: { pages: Array<{ fileName: string }> };
    }
    
    const isStoreConsistent = await page.evaluate((expected) => {
        const actual = (window as WindowWithStore).pagesStore?.pages.map((p) => p.fileName); // fileName used in store
        return JSON.stringify(actual) === JSON.stringify(expected);
    }, originalOrder);
    expect(isStoreConsistent).toBe(true);
  });

  test('should handle multiple files with same name', async ({ page: _page }) => {
    // 上传两个相同的文件
    const files = [
      TestData.files.samplePNG(),
      TestData.files.samplePNG()
    ];
    await pageList.uploadAndWaitReady(files);
    
    // 显式等待加载完成
    await pageList.waitForPagesLoaded({ count: 2 });
    await pageList.waitForThumbnailsReady();
    
    expect(await pageList.getPageCount()).toBe(2);
    
    const names = await pageList.getPageOrder();
    expect(names[0]).toBe(names[1]);
    
    // 验证它们有不同的 ID（通过删除一个来验证）
    await pageList.selectPage(0);
    await pageList.deleteSelected();
    
    expect(await pageList.getPageCount()).toBe(1);
  });
});
