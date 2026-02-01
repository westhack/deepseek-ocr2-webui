import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('OCR Health Check & Queue Recovery', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // 默认设置为健康状态，避免干扰初始加载
        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
        await app.waitForAppReady();
    });

    test('should reflect health status in UI indicator', async ({ page: _page }) => {
        // 1. 验证初始状态为健康 (success)
        expect(await app.getHealthStatusType()).toBe('success');

        // 2. Mock 服务不可用 (网络错误或 HTTP 错误，导致 isHealthy = false)
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 3. 等待轮询周期 (5s) 并验证 UI 变化
        // 我们在页面上等待指示器变为 error  类型
        await expect.poll(async () => await app.getHealthStatusType(), {
            timeout: 10000,
            intervals: [1000]
        }).toBe('error');

        // 4. 验证 Tooltip 文本
        const statusText = await app.getHealthStatusText();
        expect(statusText).toContain('Unavailable');
    });

    test('should block OCR requests when service is unavailable', async ({ page }) => {
        // 1. 设置服务不可用
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 等待轮询生效，使 Store 更新
        await expect.poll(async () => await app.getHealthStatusType(), { timeout: 10000 }).toBe('error');

        // 2. 上传文件
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // 3. 尝试触发 OCR
        await ocrPage.triggerOCR(0);

        // 4. 验证错误消息提示 (OCRService 会抛出错误，UI 会弹出对话框)
        await expect(page.getByText(/unavailable/i).first()).toBeVisible({ timeout: 10000 });

        // 验证没有成功提示显示 (Added to Queue)
        // Naive UI 的 notification 容器通常是 .n-notification-container
        await expect(page.locator('.n-notification')).not.toBeVisible();

        // 5. 验证页面状态保持为 ready (因为被 UI 拦截，未真正提交)
        expect(await ocrPage.getPageStatus(0)).toBe('ready');
    });

    test('should auto-resume queued tasks when service recovers', async ({ page: _page }) => {
        // 1. 初始健康
        await apiMocks.mockHealth({ status: 'healthy' });
        await apiMocks.mockOCR({ delay: 5000 }); // 让 OCR 慢一点

        // 2. 上传两个文件
        await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);

        // 3. 触发第一个任务 (开始执行)
        await ocrPage.triggerOCR(0);
        // 等待状态变为 Recognizing 或 Scanning
        await expect.poll(async () => await ocrPage.getPageStatus(0)).toMatch(/recognizing|pending_ocr/);

        // 4. 触发第二个任务 (加入队列, Pending)
        // 此时服务健康，可以正常加入队列
        await ocrPage.triggerOCR(1);
        await expect.poll(async () => await ocrPage.getPageStatus(1)).toBe('pending_ocr');

        // 5. 在任务执行期间，服务变为不可用
        // 这将模拟"已在队列中的任务遇到 429 或服务不可用"的情况 (由后端重试逻辑或 processQueue 处理)
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 6. 验证第二个页面保持 pending 状态 (或变为 waiting_retry，取决于具体实现，这里假设 pending_ocr)
        // 验证它不会失败进入 error
        await expect.poll(async () => await ocrPage.getPageStatus(1), { timeout: 5000 }).toBe('pending_ocr');

        // 7. 恢复服务健康
        await apiMocks.mockHealth({ status: 'healthy' });

        // 8. 验证任务最终成功
        await ocrPage.waitForOCRSuccess(0, 20000);
        await ocrPage.waitForOCRSuccess(1, 20000);

        expect(await ocrPage.isOCRCompleted(0)).toBeTruthy();
        expect(await ocrPage.isOCRCompleted(1)).toBeTruthy();
    });
});
