import type { Page } from '@playwright/test';

export class PageListPage {
  constructor(private page: Page) { }

  /**
   * 获取页面列表容器
   */
  private get container() {
    return this.page.locator('.page-list-container');
  }

  /**
   * 获取所有页面项
   */
  private get pageItems() {
    return this.page.locator('[data-testid^="page-item-"]');
  }

  /**
   * 全选所有页面
   */
  async selectAll() {
    await this.page.getByTestId('select-all-checkbox').check();
    // 等待至少一个页面被选中
    await this.page.locator('[data-testid^="page-item-"].selected').first().waitFor({
      state: 'visible',
      timeout: 3000
    }).catch(() => {
      // 如果没有 .selected 类，可能使用其他选中标记，继续执行
    });
  }

  /**
   * 取消全选
   */
  async unselectAll() {
    await this.page.getByTestId('select-all-checkbox').uncheck();
    // 等待所有选中状态清除
    await this.page.waitForFunction(() => {
      const selectedItems = document.querySelectorAll('[data-testid^="page-item-"].selected');
      return selectedItems.length === 0;
    }, { timeout: 3000 }).catch(() => {
      // 如果没有选中项，继续执行
    });
  }

  /**
   * 点击批量 OCR 按钮
   */
  async clickBatchOCR() {
    await this.page.getByTestId('batch-ocr-btn').click();
  }

  /**
   * 删除选中的页面(完整流程)
   */
  async deleteSelected() {
    const initialCount = await this.getPageCount();

    // 点击删除按钮
    await this.page.getByTestId('delete-selected-btn').click();

    // 确认弹窗
    const dialog = this.page.locator('.n-dialog.n-modal');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('button:has-text("Confirm")').click();

    // 等待成功提示
    await this.page.locator('.n-message:has-text("deleted")').waitFor({
      state: 'visible',
      timeout: 5000
    });

    // 等待列表更新
    await this.page.waitForFunction(
      (expected) => {
        const items = document.querySelectorAll('[data-testid^="page-item-"]');
        return items.length < expected;
      },
      initialCount,
      { timeout: 5000 }
    );
  }

  /**
   * 精准拖拽 - 使用 mouse API
   */
  async dragAndDrop(fromIndex: number, toIndex: number) {
    const sourceItem = this.pageItems.nth(fromIndex);
    const targetItem = this.pageItems.nth(toIndex);

    // 确保元素可见
    await sourceItem.scrollIntoViewIfNeeded();
    await targetItem.scrollIntoViewIfNeeded();

    // 获取拖拽手柄
    const sourceHandle = sourceItem.locator('.drag-handle');
    const targetHandle = targetItem.locator('.drag-handle');

    // 使用 Playwright 的 dragTo API
    await sourceHandle.dragTo(targetHandle);

    // 等待数据库更新
    await this.waitForDatabaseUpdate();
  }

  /**
   * 等待数据库更新完成
   */
  private async waitForDatabaseUpdate() {
    // 等待 store 中的 order 更新完成
    await this.page.waitForFunction(() => {
      return window.pagesStore?.pages.every((p: Record<string, unknown>) => p.order !== undefined);
    }, { timeout: 5000 });

    // 等待网络空闲，确保数据库写入完成
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 验证 IndexedDB 中的顺序
   */
  async verifyOrderInDatabase(expectedOrder: string[]): Promise<boolean> {
    return await this.page.evaluate(async (expected) => {
      const { db } = await import('/src/db/index.ts');
      const pages = await db.pages.orderBy('order').toArray();
      const actualNames = pages.map(p => p.name);
      return JSON.stringify(actualNames) === JSON.stringify(expected);
    }, expectedOrder);
  }

  /**
   * 获取页面数量
   */
  async getPageCount(): Promise<number> {
    return await this.pageItems.count();
  }

  /**
   * 获取当前页面顺序
   */
  async getPageOrder(): Promise<string[]> {
    const count = await this.getPageCount();
    const order: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = await this.pageItems.nth(i).locator('.page-name').textContent();
      order.push(name || '');
    }

    return order;
  }

  /**
   * 等待页面加载完成
   */
  async waitForPagesLoaded(options: { count?: number; timeout?: number } = {}) {
    const { count, timeout = 30000 } = options;

    if (count !== undefined) {
      // 使用更健壮的等待策略：等待页面项数量达到预期，并且所有项都已渲染
      await this.page.waitForFunction(
        (expectedCount) => {
          const items = document.querySelectorAll('[data-testid^="page-item-"]');
          // 确保数量匹配，并且所有项都有内容（不是空元素）
          if (items.length !== expectedCount) {
            return false;
          }
          // 验证所有页面项都是可见的（至少有一个子元素）
          for (let i = 0; i < items.length; i++) {
            if (!items[i] || items[i].children.length === 0) {
              return false;
            }
          }
          return true;
        },
        count,
        { timeout }
      );
      // 额外等待一下，确保 DOM 完全稳定
      await this.page.waitForTimeout(100);
    } else {
      await this.pageItems.first().waitFor({ state: 'visible', timeout });
    }
  }

  /**
   * 等待所有缩略图就绪
   */
  async waitForThumbnailsReady(timeout: number = 30000) {
    const count = await this.getPageCount();

    for (let i = 0; i < count; i++) {
      await this.pageItems
        .nth(i)
        .getByTestId('page-thumbnail')
        .waitFor({ state: 'visible', timeout });
    }
  }

  /**
   * 检查所有缩略图是否可见
   */
  async areAllThumbnailsVisible(): Promise<boolean> {
    const count = await this.getPageCount();
    const thumbnails = this.page.getByTestId('page-thumbnail');
    const visibleCount = await thumbnails.count();
    return visibleCount === count;
  }

  /**
   * 点击指定页面（激活页面）
   */
  async clickPage(index: number) {
    await this.pageItems.nth(index).click();
    // 等待页面变为 active 状态
    await this.pageItems.nth(index).locator('.active').waitFor({
      state: 'attached',
      timeout: 3000
    }).catch(() => {
      // 页面可能使用不同的激活标记，继续执行
    });
  }

  /**
   * 勾选指定页面（用于批量操作）
   */
  async selectPage(index: number) {
    const checkbox = this.pageItems.nth(index).getByTestId('page-checkbox');
    await checkbox.click();
    // 等待 checkbox 状态改变
    await checkbox.waitFor({ state: 'visible', timeout: 3000 });
  }

  /**
   * 上传文件并等待处理完成
   */
  async uploadAndWaitReady(filePaths: string | string[]) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    // 记录上传前的页面数量
    const beforeCount = await this.getPageCount();

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.click('.app-header button:has-text("Import Files")')
    ]);

    await fileChooser.setFiles(paths);

    // 等待页面数量增加（至少增加1个）
    await this.page.waitForFunction(
      (expectedIncrease) => {
        const currentCount = document.querySelectorAll('[data-testid^="page-item-"]').length;
        return currentCount >= expectedIncrease;
      },
      beforeCount + 1,
      { timeout: 30000 }
    );

    // 如果是已知数量的上传，建议在测试中显式调用 waitForPagesLoaded
    await this.waitForThumbnailsReady();
  }

  /**
   * 获取选中的页面数量
   */
  async getSelectedCount(): Promise<number> {
    return await this.page.evaluate(() => {
      return window.pagesStore?.selectedPageIds?.size || 0;
    });
  }

  /**
   * 检查页面是否被选中
   */
  async isPageSelected(index: number): Promise<boolean> {
    const item = this.pageItems.nth(index);
    const classes = await item.getAttribute('class');
    return classes?.includes('selected') || classes?.includes('active') || false;
  }

  /**
   * 检查页面项是否可见
   */
  async isPageVisible(index: number): Promise<boolean> {
    const item = this.pageItems.nth(index);
    return await item.isVisible().catch(() => false);
  }

  /**
   * 打开 OCR Queue Popover
   * @returns 返回 OCRQueuePopoverPage 实例用于链式调用
   */
  async openOCRQueue(): Promise<void> {
    await this.page.getByTestId('ocr-queue-badge').click();
  }
}
