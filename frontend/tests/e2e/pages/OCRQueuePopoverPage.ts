import type { Page } from '@playwright/test';

export class OCRQueuePopoverPage {
    constructor(private page: Page) { }

    // ====== 私有 Getter（封装选择器） ======

    // ✅ 使用 data-testid（⭐⭐⭐⭐⭐ 最高优先级）
    private get container() {
        return this.page.getByTestId('ocr-queue-popover');
    }

    private get toolbar() {
        return this.page.getByTestId('ocr-queue-toolbar');
    }

    private get toolbarCheckbox() {
        return this.page.getByTestId('ocr-queue-select-all');
    }

    private get batchCancelButton() {
        return this.page.getByTestId('ocr-queue-batch-cancel-btn');
    }

    private get taskItems() {
        // 任务项使用动态 testid，这里用属性选择器
        return this.page.locator('[data-testid^="ocr-queue-item-"]');
    }

    private get closeButton() {
        return this.page.getByTestId('ocr-queue-close-btn');
    }

    // ❌ emptyState 保持使用类名（Naive UI组件，无法添加testid）
    private get emptyState() {
        return this.container.locator('.n-empty');
    }

    // ====== 动作方法 ======

    /**
     * 关闭 OCR Queue Popover
     */
    async close(): Promise<void> {
        await this.closeButton.click();
        await this.container.waitFor({ state: 'hidden' });
    }

    /**
     * 在队列中勾选指定任务
     * @param index 任务索引（0开始）
     */
    async selectTask(index: number): Promise<void> {
        const taskItem = this.taskItems.nth(index);
        // ✅ 使用 testid 定位 checkbox
        await taskItem.getByTestId('ocr-queue-task-checkbox').click();
    }

    /**
     * 全选队列中的所有任务
     */
    async selectAllTasks(): Promise<void> {
        await this.toolbarCheckbox.click();
    }

    /**
     * 等待指定数量的任务被选中
     */
    async waitForSelectedCount(expectedCount: number): Promise<void> {
        await this.page.waitForFunction(
            (expected) => {
                // Check aria-checked of all item checkboxes
                const checkboxes = document.querySelectorAll('[data-testid="ocr-queue-task-checkbox"]');
                const checked = Array.from(checkboxes).filter(cb => cb.getAttribute('aria-checked') === 'true');
                return checked.length === expected;
            },
            expectedCount
        );
    }

    async toggleSelectAll(): Promise<void> {
        await this.toolbarCheckbox.click();
    }

    async isAllSelected(): Promise<boolean> {
        // NCheckbox uses aria-checked
        return await this.toolbarCheckbox.getAttribute('aria-checked') === 'true';
    }

    /**
     * 点击 toolbar 的批量取消按钮
     */
    async clickBatchCancel(): Promise<void> {
        await this.batchCancelButton.click();
    }

    /**
     * 点击单个任务的取消按钮
     * @param index 任务索引（0开始）
     */
    async clickTaskCancel(index: number): Promise<void> {
        const taskItem = this.taskItems.nth(index);
        await taskItem.hover();
        // ✅ 使用 testid 定位取消按钮
        await taskItem.getByTestId('ocr-queue-task-cancel-btn').click();
    }

    // ====== 查询方法 ======

    /**
     * 获取队列中任务的总数
     */
    async getTaskCount(): Promise<number> {
        return await this.taskItems.count();
    }

    /**
     * 获取指定状态的任务数量
     * @param status 'processing' 或 'queued'
     */
    async getTaskCountByStatus(status: 'processing' | 'queued'): Promise<number> {
        // ✅ 使用 data-status 属性，而非 CSS 类
        return await this.page.locator(`[data-testid^="ocr-queue-item-"][data-status="${status}"]`).count();
    }

    /**
     * 验证队列是否为空状态
     */
    async isEmpty(): Promise<boolean> {
        return await this.emptyState.isVisible();
    }

    /**
     * 验证 toolbar 是否显示（有任务时才显示）
     */
    async isToolbarVisible(): Promise<boolean> {
        return await this.toolbar.isVisible();
    }

    /**
     * 验证批量取消按钮是否可见（有选中项时才显示）
     */
    async isBatchCancelVisible(): Promise<boolean> {
        return await this.batchCancelButton.isVisible();
    }

    // ====== 等待方法 ======

    /**
     * 等待 Popover 可见
     */
    async waitForVisible(timeout = 5000): Promise<void> {
        await this.container.waitFor({ state: 'visible', timeout });
    }

    /**
     * 等待任务数量变化到指定值
     * @param expectedCount 期望的任务数量
     */
    async waitForTaskCount(expectedCount: number, timeout = 5000): Promise<void> {
        await this.page.waitForFunction(
            (expected) => {
                // ✅ 使用 testid 属性选择器
                const items = document.querySelectorAll('[data-testid^="ocr-queue-item-"]');
                return items.length === expected;
            },
            expectedCount,
            { timeout }
        );
    }

    /**
     * 等待队列变为空状态
     */
    async waitForEmpty(timeout = 5000): Promise<void> {
        await this.emptyState.waitFor({ state: 'visible', timeout });
    }
}
