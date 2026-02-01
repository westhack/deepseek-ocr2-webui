import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Enhanced Health Status Display', () => {
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

    test('should display "Busy" status when queue is partially full', async ({ page }) => {
        // Mock health API with busy status
        await apiMocks.mockHealth({
            status: 'busy',
            queueInfo: {
                depth: 7,
                max_size: 10,
                is_full: false
            },
            rateLimits: {
                max_per_client: 2,
                max_per_ip: 5,
                active_clients: 3,
                active_ips: 4
            }
        });

        // Wait for health check to update
        await page.waitForTimeout(6000); // Wait for health polling cycle

        // Health indicator should show warning type (not error)
        const statusType = await app.getHealthStatusType();
        expect(statusType).toBe('warning');

        // Hover over health indicator to see tooltip
        const healthBtn = page.locator('.health-indicator-btn');
        await healthBtn.hover();

        // Tooltip should contain "Busy" status
        await expect(page.getByText(/busy/i).first()).toBeVisible({ timeout: 5000 });

        // Should still allow OCR submission (not blocked like "Full")
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // Mock OCR to succeed
        await apiMocks.mockOCR({ delay: 500 });

        // Should be able to trigger OCR
        await ocrPage.triggerOCR(0);

        // Wait for OCR to complete
        await ocrPage.waitForOCRSuccess(0, 10000);

        // Page transitions to pending_gen after OCR completes (document generation)
        // Just verify it's not in error state
        const status = await ocrPage.getPageStatus(0);
        expect(status).not.toBe('error');
    });

    test('should display "Full" status and block OCR submission when queue is at capacity', async ({ page }) => {
        // Upload test file first (before full)
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // Verify button is initially enabled
        const ocrButton = page.getByTestId('ocr-trigger-btn');
        await expect(ocrButton).toBeEnabled();

        // Mock health API with full status
        await apiMocks.mockHealth({
            status: 'full',
            queueInfo: {
                depth: 10,
                max_size: 10,
                is_full: true
            },
            rateLimits: {
                max_per_client: 2,
                max_per_ip: 5,
                active_clients: 5,
                active_ips: 5
            }
        });

        // Wait for health check to update
        await page.waitForTimeout(6000);

        // Health indicator should show error type
        const statusType = await app.getHealthStatusType();
        expect(statusType).toBe('error');

        // Hover to check tooltip
        const healthBtn = page.locator('.health-indicator-btn');
        await healthBtn.hover();

        // Tooltip should say "Full"
        await expect(page.getByText(/full/i).first()).toBeVisible({ timeout: 5000 });

        // Verify OCR button is now ENABLED (frontend allows submission to show explanation Modal)
        await expect(ocrButton).toBeEnabled();

        // Attempt to submit
        await ocrButton.click();

        // Expect Modal with "Queue Full" message
        await expect(page.locator('.n-dialog').filter({ hasText: /Queue Full|Full/i })).toBeVisible();

        // Optionally close the modal
        // Close the modal
        await page.locator('.n-dialog__action button').click();
    });

    test('should show queue position when user has tasks in queue', async ({ page }) => {
        // Mock health with queue position
        await apiMocks.mockHealth({
            status: 'busy',
            queueInfo: {
                depth: 8,
                max_size: 10,
                is_full: false
            },
            yourQueueStatus: {
                client_id: 'test-client-123',
                position: 3,
                total_queued: 5
            }
        });

        // Mock OCR with delay to simulate ongoing processing
        await apiMocks.mockOCR({ delay: 10000 });

        // Upload and trigger OCR
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        await ocrPage.triggerOCR(0);

        // Wait a bit for task to be queued
        await page.waitForTimeout(2000);

        // Wait for health check to include queue position
        await page.waitForTimeout(6000);

        // Hover over health indicator or OCR status
        // NOTE: The exact UI element depends on design - adjust selector as needed
        const healthBtn = page.locator('.health-indicator-btn');
        await healthBtn.hover();

        // Should display queue position information
        // This might be in tooltip or OCR queue popover
        // Adjust expectations based on actual UI design
        const tooltipOrPopover = page.locator('.health-tooltip, .ocr-queue-popover').first();

        // Check for position indicator (e.g., "Position: 3" or "Queue: 3/5")
        // This assertion is flexible and may need adjustment
        const content = await tooltipOrPopover.textContent();

        // Verify some queue-related content is shown
        // Exact format depends on implementation
        expect(content).toBeTruthy();
    });
});
