import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Page Deleting', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should delete a single page and persist after reload', async ({ page }) => {
    // 1. Upload files
    await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);
    // Explicitly wait for 2 pages to be sure (fixes race condition where second file may not be added yet)
    await pageList.waitForPagesLoaded({ count: 2 });
    const initialCount = await pageList.getPageCount();
    expect(initialCount).toBe(2);

    // 2. Delete the first page
    const pageItem = page.locator('[data-testid^="page-item-"]').first();
    await pageItem.hover();
    await pageItem.getByTestId('delete-page-btn').click();

    // Confirm deletion
    const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
    await expect(dialog).toBeVisible();
    // 使用 positiveText 匹配按钮（i18n 友好）
    await dialog.locator('button:has-text("Confirm")').click();

    // Verify page count decreased
    await pageList.waitForPagesLoaded({ count: initialCount - 1 });

    // Verify success message appears
    // 注意: Naive UI 的 message API 不支持 class 选项，通过通用的 .n-message 验证
    await expect(page.locator('.n-message').first()).toBeVisible({ timeout: 5000 });

    // 3. Reload page to verify persistence
    await page.reload();
    await app.waitForAppReady();
    await pageList.waitForPagesLoaded({ count: initialCount - 1 });
    await pageList.waitForThumbnailsReady();
  });

  test('should delete multiple pages and persist after reload', async ({ page }) => {
    // 1. Upload multiple files
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(), 
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ]);
    
    // Explicitly wait for 3 pages to be sure
    await pageList.waitForPagesLoaded({ count: 3 });
    
    const totalCount = await pageList.getPageCount();
    expect(totalCount).toBe(3);

    // 2. Select 2 pages
    await pageList.selectPage(0);
    await pageList.selectPage(1);
    
    // 3. Delete selected
    await pageList.deleteSelected();

    // 4. Verify page count
    const remainingCount = totalCount - 2;
    await pageList.waitForPagesLoaded({ count: remainingCount });

    // 5. Reload to verify persistence
    await page.reload();
    await app.waitForAppReady();
    await pageList.waitForPagesLoaded({ count: remainingCount });
  });

  test('should delete all pages and show empty state', async ({ page }) => {
    // 1. Upload files
    await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);
    // Explicitly wait for 2 pages to be sure (fixes race condition where second file may not be added yet)
    await pageList.waitForPagesLoaded({ count: 2 });
    
    // 2. Select all
    await pageList.selectAll();
    
    // 3. Delete all
    await pageList.deleteSelected();

    // 4. Verify empty state
    await pageList.waitForPagesLoaded({ count: 0 });
    expect(await app.isEmptyState()).toBeTruthy();

    // 5. Reload to verify empty state persists
    await page.reload();
    await app.waitForAppReady();
    expect(await app.isEmptyState()).toBeTruthy();
  });
});
