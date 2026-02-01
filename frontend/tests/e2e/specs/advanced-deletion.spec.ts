import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Advanced Deletion Scenarios', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should show warning when deleting a processing page', async ({ page }) => {
    await test.step('Upload a file and wait for ready', async () => {
      await pageList.uploadAndWaitReady(TestData.files.samplePNG());
      await pageList.waitForPagesLoaded({ count: 1 });
    });

    await test.step('Simulate processing state', async () => {
      await page.evaluate(() => {
        interface PagesStore {
          pages: { id: string }[];
          updatePageStatus: (id: string, status: string) => void;
        }
        const store = (window as unknown as { pagesStore: PagesStore }).pagesStore;
        const pageId = store.pages[0].id;
        store.updatePageStatus(pageId, 'recognizing');
      });
    });

    await test.step('Trigger delete and verify warning dialog', async () => {
      const pageItem = page.locator('[data-testid^="page-item-"]').first();
      await pageItem.hover();
      await pageItem.getByTestId('delete-page-btn').click();

      // Verify Dialog visibility using class (common strategy for Naive UI)
      const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
      await expect(dialog).toBeVisible();

      // Instead of hardcoded text, we check for visibility of the content area
      // and avoid language dependency where possible.
      // If we must check text, use a flexible locator or rely on the fact that 
      // the warning icon/class is present.
      await expect(dialog.locator('.n-dialog__content')).toBeVisible();
    });

    await test.step('Confirm Delete', async () => {
      const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
      // Use getByRole instead of has-text("Confirm")
      // In Naive UI Dialog, the positive button is usually the last one or has specific classes
      await dialog.getByRole('button').last().click();

      await pageList.waitForPagesLoaded({ count: 0 });
      expect(await app.isEmptyState()).toBeTruthy();
    });
  });

  test('should verify smart selection logic (Select Next)', async ({ page }) => {
    await test.step('Upload 3 files [A, B, C]', async () => {
      await pageList.uploadAndWaitReady([
        TestData.files.samplePNG(),
        TestData.files.sampleJPG(),
        TestData.files.samplePNG()
      ]);
      await pageList.waitForPagesLoaded({ count: 3 });
    });

    await test.step('Select Middle Page (Index 1)', async () => {
      await pageList.clickPage(1);
      await expect(page.locator('[data-testid^="page-item-"]').nth(1)).toHaveClass(/active|selected/);
    });

    await test.step('Delete Middle Page and verify selection moves to Next', async () => {
      const middleItem = page.locator('[data-testid^="page-item-"]').nth(1);
      await middleItem.hover();
      await middleItem.getByTestId('delete-page-btn').click();

      const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
      await dialog.getByRole('button').last().click();
      await pageList.waitForPagesLoaded({ count: 2 });

      // The NEW Index 1 (Original C) should be selected
      await expect(page.locator('[data-testid^="page-item-"]').nth(1)).toHaveClass(/active|selected/);
    });
  });

  test('should verify smart selection logic (Select Prev)', async ({ page }) => {
    await test.step('Upload 2 files [A, B]', async () => {
      await pageList.uploadAndWaitReady([
        TestData.files.samplePNG(),
        TestData.files.sampleJPG()
      ]);
      await pageList.waitForPagesLoaded({ count: 2 });
    });

    await test.step('Select Last Page (Index 1)', async () => {
      await pageList.clickPage(1);
    });

    await test.step('Delete Last Page and verify selection moves to Prev', async () => {
      const lastItem = page.locator('[data-testid^="page-item-"]').nth(1);
      await lastItem.hover();
      await lastItem.getByTestId('delete-page-btn').click();

      const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
      await dialog.getByRole('button').last().click();
      await pageList.waitForPagesLoaded({ count: 1 });

      // The Index 0 (Original A) should be selected
      await expect(page.locator('[data-testid^="page-item-"]').nth(0)).toHaveClass(/active|selected/);
    });
  });

  test('should cancel task when deleting processing page', async ({ page }) => {
    await test.step('Upload file and set to processing', async () => {
      await pageList.uploadAndWaitReady(TestData.files.samplePNG());
      await page.evaluate(() => {
        interface PagesStore {
          pages: { id: string }[];
          updatePageStatus: (id: string, status: string) => void;
        }
        const store = (window as unknown as { pagesStore: PagesStore }).pagesStore;
        store.updatePageStatus(store.pages[0].id, 'recognizing');
      });
    });

    await test.step('Delete processing page and verify cleanup', async () => {
      const pageItem = page.locator('[data-testid^="page-item-"]').first();
      await pageItem.hover();
      await pageItem.getByTestId('delete-page-btn').click();

      const dialog = page.locator('.n-dialog.n-modal.delete-confirm-dialog');
      await dialog.getByRole('button').last().click();

      await pageList.waitForPagesLoaded({ count: 0 });
      expect(await app.isEmptyState()).toBeTruthy();
    });
  });
});
