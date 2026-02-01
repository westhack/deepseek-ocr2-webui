import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRQueuePopoverPage } from '../pages/OCRQueuePopoverPage';
import { TestData } from '../data/TestData';
import { APIMocks } from '../mocks/APIMocks';

test.describe('OCR Queue Cancellation via Toolbar', () => {
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
    // Ensure we start with a clean state
    await app.clearDatabase();
    await app.goto();
  });

  test.afterEach(async () => {
    await apiMocks.unmockOCR();
  });

  /**
   * Test Case 1: Batch Cancellation of Recognizing Tasks
   */
  test('should batch cancel recognizing tasks from queue toolbar', async ({ page }) => {
    // Step 1: Upload files
    await test.step('Upload two images', async () => {
      await pageList.uploadAndWaitReady([
        TestData.files.samplePNG(),
        TestData.files.sampleJPG()
      ]);
      await pageList.waitForPagesLoaded({ count: 2 });
    });

    // Step 2: Start OCR with delay
    await test.step('Start OCR with simulated delay', async () => {
      await apiMocks.mockOCR({ delay: 5000 });
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Give it a moment to show up in the queue
      await page.waitForTimeout(1000);
    });

    // Step 3: Open Queue and Cancel
    await test.step('Cancel acknowledging tasks in queue', async () => {
      await pageList.openOCRQueue();
      await queuePopover.waitForVisible();

      expect(await queuePopover.getTaskCount()).toBe(2);
      expect(await queuePopover.getTaskCountByStatus('processing')).toBe(1);
      expect(await queuePopover.getTaskCountByStatus('queued')).toBe(1);

      // Select all tasks in queue
      await queuePopover.selectAllTasks();
      await queuePopover.waitForSelectedCount(2);

      // Click batch cancel
      await queuePopover.clickBatchCancel();

      // Verify tasks are removed
      await queuePopover.waitForEmpty();
      expect(await queuePopover.isEmpty()).toBeTruthy();
    });

    // Step 4: Verify toast message
    await test.step('Verify success message', async () => {
      const message = page.locator('.n-message.n-message--success-type');
      await expect(message).toBeVisible();
      // "2 tasks cancelled" (assuming i18n key works correctly)
      await expect(message).toContainText('2');
    });
  });

  /**
   * Test Case 2: Cancel Queued Tasks (Concurrency check)
   */
  test('should cancel queued (pending) tasks while others are processing', async ({ page }) => {
    // Concurrency is 2 in this app
    // Step 1: Upload 3 images
    await test.step('Upload three images', async () => {
      await pageList.uploadAndWaitReady([
        TestData.files.samplePNG(),
        TestData.files.sampleJPG(),
        TestData.files.samplePNG()
      ]);
      await pageList.waitForPagesLoaded({ count: 3 });
    });

    // Step 2: Start all OCR
    await test.step('Start all OCR tasks', async () => {
      await apiMocks.mockOCR({ delay: 5000 });
      await pageList.selectAll();
      await pageList.clickBatchOCR();
      await page.waitForTimeout(1000);
    });

    // Step 3: Open Queue and verify states
    await test.step('Verify mixed states in queue', async () => {
      await pageList.openOCRQueue();
      await queuePopover.waitForVisible();

      expect(await queuePopover.getTaskCount()).toBe(3);
      expect(await queuePopover.getTaskCountByStatus('processing')).toBe(1); // Max concurrency 1
      expect(await queuePopover.getTaskCountByStatus('queued')).toBe(2);
    });

    // Step 4: Cancel only the queued task
    await test.step('Cancel only pending task', async () => {
      // The queued task should be the 3rd item (index 2)
      await queuePopover.selectTask(2);
      await queuePopover.clickBatchCancel();

      // Verify count drops to 2
      await queuePopover.waitForTaskCount(2);
      expect(await queuePopover.getTaskCountByStatus('processing')).toBe(1);
      expect(await queuePopover.getTaskCountByStatus('queued')).toBe(1);
    });
  });

  /**
   * Test Case 3: Mixed State Cancellation
   */
  test('should cancel both processing and queued tasks simultaneously', async ({ page }) => {
    // Step 1: Setup 3 tasks
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ]);
    await apiMocks.mockOCR({ delay: 5000 });
    await pageList.selectAll();
    await pageList.clickBatchOCR();
    await page.waitForTimeout(1000);

    // Step 2: Open Queue
    await pageList.openOCRQueue();
    await queuePopover.waitForVisible();

    // Step 3: Select one of each
    await test.step('Select mixed statuses', async () => {
      await queuePopover.selectTask(0); // processing
      await queuePopover.selectTask(2); // queued
      await queuePopover.clickBatchCancel();
    });

    // Step 4: Verify remaining task
    await test.step('Verify state after mixed cancellation', async () => {
      await queuePopover.waitForTaskCount(1);
      expect(await queuePopover.getTaskCountByStatus('processing')).toBe(1);
      expect(await queuePopover.getTaskCountByStatus('queued')).toBe(0);
    });
  });

  /**
   * Test Case 4: Select All and Cancel
   */
  test('should cancel all tasks using select all checkbox', async ({ page }) => {
    await pageList.uploadAndWaitReady([
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ]);
    await apiMocks.mockOCR({ delay: 5000 });
    await pageList.selectAll();
    await pageList.clickBatchOCR();
    await page.waitForTimeout(1000);

    await pageList.openOCRQueue();
    await queuePopover.waitForVisible();

    // Select All
    await queuePopover.selectAllTasks();
    await queuePopover.clickBatchCancel();

    // Verify Empty
    await queuePopover.waitForEmpty();
    expect(await queuePopover.isEmpty()).toBeTruthy();

    // Verify toolbar is gone
    expect(await queuePopover.isToolbarVisible()).toBeFalsy();
  });
});