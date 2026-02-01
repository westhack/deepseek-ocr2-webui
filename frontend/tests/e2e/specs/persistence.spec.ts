import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Persistence', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should persist data after reload', async ({ page }) => {
    // 1. Upload sample.pdf (6 pages)
    const pdfPath = TestData.files.samplePDF();
    await pageList.uploadAndWaitReady(pdfPath);
    const expectedPageCount = await pageList.getPageCount();

    // 2. Reload Page
    await page.reload();
    await app.waitForAppReady();

    // 3. Verify exact data and state is restored
    await pageList.waitForPagesLoaded({ count: expectedPageCount });
    await pageList.waitForThumbnailsReady();
    
    expect(await pageList.getPageCount()).toBe(expectedPageCount);
  });

  test('should continue background processing after page reload with large PDF', async ({ page, browserName }) => {
    // Skip on Playwright webkit due to blob URL limitations (real Safari works fine)
    test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');

    // Extended timeout for large PDF processing and reload scenarios
    test.setTimeout(120000);

    // 1. Upload large PDF
    const pdfPath = TestData.files.largePDF();
    
    // We don't use uploadAndWaitReady here because we want to reload MID-processing
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('.app-header button:has-text("Import Files")')
    ]);
    await fileChooser.setFiles(pdfPath);

    // 2. Wait for page items to appear
    await expect(async () => {
      const count = await pageList.getPageCount();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    const expectedPageCount = await pageList.getPageCount();

    // 3. Wait until SOME pages are ready (but NOT all)
    await page.waitForFunction((totalPages) => {
      const readyCount = document.querySelectorAll('.page-item .thumbnail-img').length;
      return readyCount > 0 && readyCount < totalPages;
    }, expectedPageCount, { timeout: 60000 });

    // 4. Immediately reload the page
    await page.reload();
    await app.waitForAppReady();

    // 5. Verify page count is restored
    await pageList.waitForPagesLoaded({ count: expectedPageCount });

    // 6. Verify background processing continues and ALL pages eventually become ready
    await pageList.waitForThumbnailsReady(60000);
    
    expect(await pageList.getPageCount()).toBe(expectedPageCount);
    expect(await pageList.areAllThumbnailsVisible()).toBeTruthy();
  });
});
