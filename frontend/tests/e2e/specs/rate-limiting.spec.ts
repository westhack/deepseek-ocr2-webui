import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Rate Limiting \u0026 429 Error Handling', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // Default to healthy status
        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
        await app.waitForAppReady();
    });

    test('should show modal and prevent submission when queue is full', async ({ page }) => {
        // Upload a test file first (before queue is full)
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // Verify OCR button is initially enabled
        const ocrButton = page.getByTestId('ocr-trigger-btn');
        await expect(ocrButton).toBeEnabled();

        // Now mock health API to show full status
        await apiMocks.mockHealth({
            status: 'full',
            queueInfo: { depth: 10, max_size: 10, is_full: true }
        });

        // Wait for health check to update
        await page.waitForTimeout(6000);

        // Verify health indicator shows error type (full = red)
        const statusType = await app.getHealthStatusType();
        expect(statusType).toBe('error');

        // Verify OCR button is STILL enabled (changed behavior)
        await expect(ocrButton).toBeEnabled();

        // Hover over health indicator to see full status tooltip
        // Do this BEFORE clicking the button, because the modal mask might intercept pointer events
        const healthBtn = page.locator('.health-indicator-btn');
        await healthBtn.hover();
        await expect(page.getByText(/full/i).first()).toBeVisible({ timeout: 5000 });

        // Move mouse away to close tooltip and ensure it doesn't block the button
        await page.mouse.move(0, 0);
        await expect(page.getByText(/full/i).first()).toBeHidden();

        // Click the button
        await ocrButton.click();

        // Verify Modal appears with "Queue Full" message
        // Since we are in English locale by default in tests
        await expect(page.getByText('Queue Full', { exact: true })).toBeVisible();
        await expect(page.getByText('OCR queue is full')).toBeVisible();
    });

    test('should handle Client Limit (429) error from API', async ({ page }) => {
        // Mock OCR to return client limit error
        await apiMocks.mockOCR({ rateLimitType: 'client_limit' });

        // Upload a test file
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // Trigger OCR task
        await ocrPage.triggerOCR(0);

        // Should display error dialog with "Client Limit" or "already have a task"
        await expect(page.getByText(/client.*limit|already.*task/i).first()).toBeVisible({ timeout: 10000 });

        // Page should be in error state
        expect(await ocrPage.getPageStatus(0)).toBe('error');
    });

    test('should handle IP Limit (429) error from API', async ({ page }) => {
        // Mock OCR to return IP limit error
        await apiMocks.mockOCR({ rateLimitType: 'ip_limit' });

        // Upload test file
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // Trigger OCR
        await ocrPage.triggerOCR(0);

        // Should display error with "IP Limit" or "network"
        await expect(page.getByText(/ip.*limit|too many.*network/i).first()).toBeVisible({ timeout: 10000 });

        // Page should be in error state
        expect(await ocrPage.getPageStatus(0)).toBe('error');
    });

    test('should send X-Client-ID header with OCR requests', async () => {
        let capturedClientId: string | null = null;

        // Mock OCR with client ID validation
        await apiMocks.mockOCRWithClientIdValidation((clientId) => {
            capturedClientId = clientId;
        });

        // Upload and trigger OCR
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        await ocrPage.triggerOCR(0);

        // Wait for OCR request to complete
        await ocrPage.waitForOCRSuccess(0, 10000);

        // Verify client ID was sent
        expect(capturedClientId).not.toBeNull();
        expect(capturedClientId).toBeTruthy();

        // Client ID should be a valid UUID format (basic check)
        expect(capturedClientId).toMatch(/^[0-9a-f-]+$/i);
    });
});
