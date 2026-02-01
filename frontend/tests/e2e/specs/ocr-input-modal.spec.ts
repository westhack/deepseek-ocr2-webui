import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { PageViewerPage } from '../pages/PageViewerPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

type OCRPromptType = 'find' | 'freeform';

test.describe('OCR Input Modal - Input Modes', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let pageViewer: PageViewerPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        pageViewer = new PageViewerPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // Default to healthy status
        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
        await app.waitForAppReady();
    });

    // Test Case 5 & 6: Find Mode and Freeform Mode (Healthy State)
    test('should work correctly for Find mode (Locate Object)', async ({ browserName }) => {
        // Skip on Firefox and Webkit due to modal compatibility issues
        test.skip(browserName !== 'chromium', 'Modal opening only reliable on Chromium');

        // Upload and select a page
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        await pageList.clickPage(0);
        await pageViewer.waitForReady();

        // Select Find mode from dropdown
        await pageViewer.selectOCRMode('find');

        // Verify OCRInputModal opens
        await expect.poll(async () => await pageViewer.isInputModalVisible(), {
            timeout: 3000
        }).toBe(true);

        // Verify modal title
        const title = await pageViewer.getInputModalTitle();
        expect(title).toContain('Locate Object');

        // Verify submit button is initially disabled
        const initiallyEnabled = await pageViewer.isInputModalSubmitEnabled();
        expect(initiallyEnabled).toBe(false);

        // Type input
        await pageViewer.typeInInputModal('apple');

        // Verify submit button becomes enabled
        const enabledAfterInput = await pageViewer.isInputModalSubmitEnabled();
        expect(enabledAfterInput).toBe(true);

        // Verify submit button text
        const submitText = await pageViewer.getInputModalSubmitButtonText();
        expect(submitText).toContain('Locate');

        // Mock OCR API
        await apiMocks.mockOCR({ delay: 1500 });

        // Submit the modal
        await pageViewer.clickInputModalSubmit();

        // Verify modal closes
        await pageViewer.waitForInputModalClose();

        // Verify OCR is triggered
        await expect.poll(async () => await ocrPage.getPageStatus(0), {
            timeout: 5000
        }).toBe('recognizing');

        // Wait for OCR to complete
        await ocrPage.waitForOCRSuccess(0);
    });

    test('should work correctly for Freeform mode (Custom Prompt)', async ({ browserName }) => {
        // Skip on Firefox and Webkit due to modal compatibility issues
        test.skip(browserName !== 'chromium', 'Modal opening only reliable on Chromium');

        // Upload and select a page
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        await pageList.clickPage(0);
        await pageViewer.waitForReady();

        // Select Freeform mode from dropdown
        await pageViewer.selectOCRMode('freeform');

        // Verify OCRInputModal opens
        await expect.poll(async () => await pageViewer.isInputModalVisible(), {
            timeout: 3000
        }).toBe(true);

        // Verify modal title
        const title = await pageViewer.getInputModalTitle();
        expect(title).toContain('Custom Prompt');

        // Verify submit button text
        const submitText = await pageViewer.getInputModalSubmitButtonText();
        expect(submitText).toContain('Run OCR');

        // Type custom prompt
        await pageViewer.typeInInputModal('Extract all prices');

        // Mock OCR API
        await apiMocks.mockOCR({ delay: 1500 });

        // Submit the modal
        await pageViewer.clickInputModalSubmit();

        // Verify modal closes
        await pageViewer.waitForInputModalClose();

        // Verify OCR is triggered
        await expect.poll(async () => await ocrPage.getPageStatus(0), {
            timeout: 5000
        }).toBe('recognizing');

        // Wait for OCR to complete
        await ocrPage.waitForOCRSuccess(0);
    });

    // Test Case 7: Submit Button Disabled When Empty (Both Input Modes)
    const inputModes: { mode: OCRPromptType; title: string }[] = [
        { mode: 'find', title: 'Locate Object' },
        { mode: 'freeform', title: 'Custom Prompt' }
    ];

    for (const { mode } of inputModes) {
        test(`should disable submit button when input is empty for ${mode} mode`, async () => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);
            await pageViewer.waitForReady();

            // Select mode from dropdown
            await pageViewer.selectOCRMode(mode);

            // Verify modal opens
            await expect.poll(async () => await pageViewer.isInputModalVisible(), {
                timeout: 3000
            }).toBe(true);

            // Verify submit button is initially disabled
            expect(await pageViewer.isInputModalSubmitEnabled()).toBe(false);

            // Type some text
            await pageViewer.typeInInputModal('test text');

            // Verify submit button becomes enabled
            expect(await pageViewer.isInputModalSubmitEnabled()).toBe(true);

            // Clear input
            await pageViewer.typeInInputModal('');

            // Verify submit button is disabled again
            expect(await pageViewer.isInputModalSubmitEnabled()).toBe(false);

            // Type only spaces
            await pageViewer.typeInInputModal('   ');

            // Verify button remains disabled (trim logic)
            expect(await pageViewer.isInputModalSubmitEnabled()).toBe(false);
        });
    }

    // Test Case 8: Queue Full Error for Both Input Modes (Second Layer Defense)
    for (const { mode } of inputModes) {
        test(`should preserve input and keep modal open when queue is full for ${mode} mode`, async ({ page }) => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);
            await pageViewer.waitForReady();

            // Mock health as healthy initially
            await apiMocks.mockHealth({ status: 'healthy' });

            // Select mode from dropdown
            await pageViewer.selectOCRMode(mode);

            // Verify modal opens
            await expect.poll(async () => await pageViewer.isInputModalVisible(), {
                timeout: 3000
            }).toBe(true);

            // Type test input
            const testInput = mode === 'find' ? 'test object' : 'test prompt';
            await pageViewer.typeInInputModal(testInput);

            // Switch health to full BEFORE submitting
            await apiMocks.mockHealth({
                status: 'full',
                queueInfo: { depth: 10, max_size: 10, is_full: true }
            });

            // Wait longer for health status to update
            await page.waitForTimeout(7000);

            // Click submit button
            await pageViewer.clickInputModalSubmit();

            // Verify error dialog appears
            await expect(page.getByText('Queue Full', { exact: true })).toBeVisible({ timeout: 3000 });
            await expect(page.getByText('OCR queue is full')).toBeVisible();

            // CRITICAL: Verify OCRInputModal is STILL open
            expect(await pageViewer.isInputModalVisible()).toBe(true);

            // Verify input is preserved
            const preservedValue = await pageViewer.getInputModalValue();
            expect(preservedValue).toBe(testInput);

            // Close the error dialog
            await page.getByRole('button', { name: 'OK', exact: true }).click();

            // Verify OCRInputModal is still open after error dialog is closed
            expect(await pageViewer.isInputModalVisible()).toBe(true);

            // Verify input is still preserved
            const stillPreserved = await pageViewer.getInputModalValue();
            expect(stillPreserved).toBe(testInput);

            // Verify page status is still ready (task not submitted)
            const status = await ocrPage.getPageStatus(0);
            expect(status).toBe('ready');
        });
    }

    // Test Case 10: Success Closes Modal for Both Input Modes
    for (const { mode } of inputModes) {
        test(`should close modal on success for ${mode} mode`, async () => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);
            await pageViewer.waitForReady();

            // Select mode from dropdown
            await pageViewer.selectOCRMode(mode);

            // Verify modal opens
            await expect.poll(async () => await pageViewer.isInputModalVisible(), {
                timeout: 3000
            }).toBe(true);

            // Type test input
            const testInput = mode === 'find' ? 'apple' : 'extract data';
            await pageViewer.typeInInputModal(testInput);

            // Mock OCR API
            await apiMocks.mockOCR({ delay: 1500 });

            // Submit the modal
            await pageViewer.clickInputModalSubmit();

            // Verify modal closes
            await pageViewer.waitForInputModalClose();

            // Verify OCR is triggered
            await expect.poll(async () => await ocrPage.getPageStatus(0), {
                timeout: 5000
            }).toBe('recognizing');

            // Wait for OCR to complete
            await ocrPage.waitForOCRSuccess(0);
        });
    }

    // Test Case 11: Reset Input on Reopen for Both Input Modes
    for (const { mode } of inputModes) {
        test(`should reset input on reopen for ${mode} mode`, async () => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);
            await pageViewer.waitForReady();

            // Select mode from dropdown
            await pageViewer.selectOCRMode(mode);

            // Verify modal opens
            await expect.poll(async () => await pageViewer.isInputModalVisible(), {
                timeout: 3000
            }).toBe(true);

            // Type test input
            await pageViewer.typeInInputModal('test input');

            // Close modal without submitting (click mask)
            await pageViewer.clickInputModalCancel();

            // Wait for modal to close
            await pageViewer.waitForInputModalClose();

            // Reopen the same mode
            await pageViewer.selectOCRMode(mode);

            // Verify modal opens again
            await expect.poll(async () => await pageViewer.isInputModalVisible(), {
                timeout: 3000
            }).toBe(true);

            // Verify input is empty
            const value = await pageViewer.getInputModalValue();
            expect(value).toBe('');
        });
    }
});
