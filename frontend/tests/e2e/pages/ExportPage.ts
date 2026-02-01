import type { Page, Download } from '@playwright/test';

export type ExportFormat = 'Markdown' | 'DOCX' | 'PDF';

export class ExportPage {
  constructor(private page: Page) {}

  /**
   * 导出为指定格式
   */
  async exportAs(format: ExportFormat): Promise<Download> {
    // 点击导出按钮
    await this.page.locator('.export-selected-btn').click();

    // 等待下载
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

    // 选择格式
    await this.page.locator(`.n-dropdown-option:has-text("Export as ${format}")`).click();

    return await downloadPromise;
  }

  /**
   * 导出时处理确认对话框
   */
  async exportAsWithConfirmation(format: ExportFormat): Promise<Download> {
    // 点击导出按钮
    await this.page.locator('.export-selected-btn').click();

    // 选择格式
    await this.page.locator(`.n-dropdown-option:has-text("Export as ${format}")`).click();

    // 等待确认对话框
    const dialog = this.page.locator('.n-dialog.n-modal');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });

    // 等待下载
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

    // 点击跳过并导出
    await dialog.locator('button:has-text("Skip & Export")').click();

    return await downloadPromise;
  }

  /**
   * 验证导出文件名
   */
  verifyFileName(download: Download, extension: string): boolean {
    const filename = download.suggestedFilename();
    const pattern = new RegExp(`^document_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${extension}$`);
    return pattern.test(filename);
  }

  /**
   * 获取导出按钮状态
   */
  async isExportButtonEnabled(): Promise<boolean> {
    const button = this.page.locator('.export-selected-btn');
    return await button.isEnabled();
  }

  /**
   * 等待导出按钮可用
   */
  async waitForExportButtonEnabled(timeout: number = 5000) {
    await this.page.locator('.export-selected-btn:not([disabled])').waitFor({ 
      state: 'visible', 
      timeout 
    });
  }

  /**
   * 点击导出按钮
   */
  async clickExportButton() {
    await this.page.locator('.export-selected-btn').click();
  }

  /**
   * 选择导出格式
   */
  async selectExportFormat(format: ExportFormat) {
    await this.page.locator(`.n-dropdown-option:has-text("Export as ${format}")`).click();
  }

  /**
   * 检查导出菜单是否可见
   */
  async isExportMenuVisible(): Promise<boolean> {
    return await this.page.locator('.n-dropdown-menu').isVisible();
  }
}
