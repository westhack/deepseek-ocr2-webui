import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRQueuePopoverPage } from '../pages/OCRQueuePopoverPage';
import { TestData } from '../data/TestData';
import { APIMocks } from '../mocks/APIMocks';

test.describe('OCR Queue Selection State', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let queuePopover: OCRQueuePopoverPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        queuePopover = new OCRQueuePopoverPage(page);
        apiMocks = new APIMocks(page);

        await app.goto();
        await app.waitForAppReady();
        await app.clearDatabase();
        await app.goto();
    });

    test.afterEach(async () => {
        await apiMocks.unmockOCR();
    });

    test('should keep "Select All" checked when a selected task completes', async ({ page: _page }) => {
        // 1. Upload 3 files
        await pageList.uploadAndWaitReady([
            TestData.files.samplePNG(),
            TestData.files.sampleJPG(),
            TestData.files.samplePNG()
        ]);
        await pageList.waitForPagesLoaded({ count: 3 });

        // 2. Start Batch OCR with a delay long enough to interact
        // Mocking 1st task to finish quickly, others slower? 
        // Or just a general delay. Let's use 3000ms.
        await apiMocks.mockOCR({ delay: 3000 });
        await pageList.selectAll();
        await pageList.clickBatchOCR();

        // 3. Open Queue
        await pageList.openOCRQueue();
        await queuePopover.waitForVisible();
        await expect(await queuePopover.getTaskCount()).toBe(3);

        // 4. Select All in Queue Popover
        await queuePopover.selectAllTasks();
        expect(await queuePopover.isAllSelected()).toBeTruthy();

        // 5. Wait for the first task to complete (count drops to 2)
        // We need to wait for the UI to update.
        await queuePopover.waitForTaskCount(2);

        // 6. BUG ASSERTION: The "Select All" checkbox SHOULD still be checked
        // because the remaining 2 tasks are presumably still selected.
        // If the bug exists, this might fail or be false.
        const isAllSelected = await queuePopover.isAllSelected();
        expect(isAllSelected).toBeTruthy();

        // 7. Verify we can deselect
        await queuePopover.toggleSelectAll();
        expect(await queuePopover.isAllSelected()).toBeFalsy();
    });
});
