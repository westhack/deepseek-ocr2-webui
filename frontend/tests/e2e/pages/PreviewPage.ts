import type { Page } from '@playwright/test';

export class PreviewPage {
  constructor(private page: Page) {}

  /**
   * 获取预览面板容器
   */
  private get container() {
    return this.page.locator('.preview-panel');
  }

  /**
   * 检查预览面板是否可见
   */
  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  /**
   * 点击折叠按钮
   */
  async toggleCollapse() {
    await this.page.click('[data-testid="collapse-preview-button"]');
  }

  /**
   * 检查是否已折叠
   */
  async isCollapsed(): Promise<boolean> {
    // 如果容器不可见或不存在，则认为是折叠状态
    const isVisible = await this.container.isVisible();
    if (!isVisible) return true;
    
    const classList = await this.container.getAttribute('class');
    return classList?.includes('collapsed') || false;
  }

  /**
   * 获取预览内容
   */
  async getPreviewContent(): Promise<string> {
    return await this.container.locator('.preview-content').textContent() || '';
  }

  /**
   * 等待预览内容加载
   */
  async waitForContentLoaded(timeout: number = 10000) {
    await this.container.locator('.preview-content').waitFor({ 
      state: 'visible', 
      timeout 
    });
  }

  /**
   * 检查预览内容是否为空
   */
  async isContentEmpty(): Promise<boolean> {
    const content = await this.getPreviewContent();
    return content.trim().length === 0;
  }

  /**
   * 获取预览标题
   */
  async getPreviewTitle(): Promise<string> {
    return await this.container.locator('.preview-title').textContent() || '';
  }

  /**
   * 点击下载按钮
   */
  async clickDownloadButton() {
    await this.container.locator('.download-button').click();
  }

  /**
   * 检查下载按钮是否可用
   */
  async isDownloadButtonEnabled(): Promise<boolean> {
    const button = this.container.locator('.download-button');
    return await button.isEnabled();
  }

  /**
   * 切换预览模式(如果有多种模式)
   */
  async switchPreviewMode(mode: 'markdown' | 'pdf' | 'docx') {
    await this.container.locator(`.mode-switch[data-mode="${mode}"]`).click();
  }

  /**
   * 获取当前预览模式
   */
  async getCurrentMode(): Promise<string> {
    const activeMode = await this.container.locator('.mode-switch.active');
    return await activeMode.getAttribute('data-mode') || '';
  }
}
