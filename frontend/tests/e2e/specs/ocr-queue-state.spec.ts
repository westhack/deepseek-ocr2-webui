import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';
import { APIMocks } from '../mocks/APIMocks';

test.describe('OCR Queue Popover State Persistence & Intelligent Dismissal', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        apiMocks = new APIMocks(page);

        await app.goto();
        await app.waitForAppReady();
        await app.clearDatabase();
        await app.goto();
    });

    test.afterEach(async () => {
        await apiMocks.unmockOCR();
    });

    test('should maintain open state when clicking "Related Actions" (Intelligent Keep-Open)', async ({ page: _page }) => {
        // 1. Mock OCR to be slow
        await apiMocks.mockOCR({ delay: 5000 });

        // 2. Upload 2 files
        await pageList.uploadAndWaitReady([
            TestData.files.samplePNG(),
            TestData.files.sampleJPG()
        ]);

        // 3. Start first OCR task -> Badge appears
        const item1 = _page.locator('[data-testid^="page-item-"]').nth(0);
        await item1.hover();
        await item1.getByTestId('scan-page-btn').click();
        await _page.getByTestId('ocr-queue-badge').waitFor({ state: 'visible' });

        // 4. Manually trigger popover OPEN
        await _page.getByTestId('ocr-queue-badge').click();
        await _page.getByTestId('ocr-queue-popover').waitFor({ state: 'visible' });

        // 5. Click the "Recognize" button of the SECOND item (Outside popover, but whitelisted)
        const item2 = _page.locator('[data-testid^="page-item-"]').nth(1);
        await item2.hover();
        // This button has .keep-queue-open class
        await item2.getByTestId('scan-page-btn').click();

        // 6. Assert: Popover should REMAIN VISIBLE
        await _page.waitForTimeout(500);
        expect(await _page.getByTestId('ocr-queue-popover').isVisible()).toBeTruthy();
    });

    test('should maintain open state when interacting with Page Viewer actions', async ({ page: _page }) => {
        // 1. Mock OCR
        await apiMocks.mockOCR({ delay: 5000 });

        // 2. Upload 2 files
        await pageList.uploadAndWaitReady([
            TestData.files.samplePNG(),
            TestData.files.sampleJPG()
        ]);

        // 3. Click first page to show in PageViewer
        await pageList.clickPage(0);

        // 4. Start OCR via List to show Queue Badge
        const item1 = _page.locator('[data-testid^="page-item-"]').nth(0);
        await item1.hover();
        await item1.getByTestId('scan-page-btn').click();
        await _page.getByTestId('ocr-queue-badge').waitFor({ state: 'visible' });

        // 5. Switch to second page in PageViewer
        // Note: clickPage triggers onClickOutside, which is expected.
        // The queue will close when navigating pages. We will reopen it.
        await pageList.clickPage(1);

        // 6. Reopen Queue (after page switch closed it)
        await _page.getByTestId('ocr-queue-badge').click();
        await _page.getByTestId('ocr-queue-popover').waitFor({ state: 'visible' });

        // 7. Click PageViewer's OCR trigger button (should NOT close queue)
        const viewerOCRBtn = _page.getByTestId('ocr-trigger-btn');
        await viewerOCRBtn.click();

        // 8. Assert: Popover should REMAIN VISIBLE
        await _page.waitForTimeout(300);
        expect(await _page.getByTestId('ocr-queue-popover').isVisible()).toBeTruthy();
    });

    test('should close when clicking outside on non-related elements', async ({ page: _page }) => {
        // 1. Mock OCR
        await apiMocks.mockOCR({ delay: 5000 });

        // 2. Upload file & Open Queue
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        const item1 = _page.locator('[data-testid^="page-item-"]').nth(0);
        await item1.hover();
        await item1.getByTestId('scan-page-btn').click();

        await _page.getByTestId('ocr-queue-badge').waitFor({ state: 'visible' });
        await _page.getByTestId('ocr-queue-badge').click();
        await _page.getByTestId('ocr-queue-popover').waitFor({ state: 'visible' });

        // 3. Click somewhere else (e.g., App Title)
        await _page.getByTestId('app-title').click();

        // 4. Assert: Popover should CLOSE
        await expect(_page.getByTestId('ocr-queue-popover')).toBeHidden();
    });
});
