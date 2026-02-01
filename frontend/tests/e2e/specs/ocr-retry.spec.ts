import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('OCR Retry Logic', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // Default to busy status (so UI allows submission, but we can fail backend)
        await apiMocks.mockHealth({ status: 'busy' });
        await app.goto();
        await app.waitForAppReady();
    });

    test('should automatically retry on 429 Queue Full error from API', async ({ page }) => {
        // 1. Setup Mock sequence: 429 (fail) -> 429 (fail) -> 200 (success)
        let callCount = 0;
        await page.route('**/ocr', async (route) => {
            callCount++;
            if (callCount <= 2) {
                // Return 429 Queue Full error
                await route.fulfill({
                    status: 429,
                    contentType: 'application/json',
                    body: JSON.stringify({ detail: 'queue full' })
                });
            } else {
                // Return Success
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(TestData.ocrResponse.default())
                });
            }
        });

        // 2. Upload file
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // 3. Trigger OCR
        await ocrPage.triggerOCR(0);

        // 4. Verify status stays in processing/recognizing (NOT error)
        // We use expect.poll to ensure it eventually succeeds without ever hitting 'error' state
        // However, proving negative (never hit error) is hard. 
        // We check that it transitions to success eventually.

        // Wait for retry loop (5s interval * 2 retries = ~10s + processing time)
        // We set timeout to accommodate this
        // Check status - allow both ocr_success and completed (if auto-export/gen happened fast)
        await expect.poll(async () => {
            const status = await ocrPage.getPageStatus(0);
            return status === 'ocr_success' || status === 'completed' || status === 'markdown_success';
        }, {
            timeout: 30000,
            intervals: [1000]
        }).toBe(true);

        // 5. Verify API was called 3 times
        expect(callCount).toBe(3);

        // 6. Verify no error message was shown to user
        await expect(page.locator('.n-message')).not.toBeVisible();
        await expect(page.locator('.n-dialog')).not.toBeVisible();
    });
});
