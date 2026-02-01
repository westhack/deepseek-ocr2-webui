import { Page, expect } from '@playwright/test';
import { TestData } from '../data/TestData';

export type SupportedLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja-JP';

export class AppPage {
  constructor(private page: Page) { }

  /**
   * 访问根路径并等待网络空闲
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 清空数据库(用于测试隔离)
   */
  async clearDatabase() {
    await this.page.evaluate(async () => {
      // @ts-expect-error - Dynamic import path resolution in Playwright evaluate context
      const { db } = await import('/src/db/index.ts');
      await db.clearAllData();
    });

    // Clear Pinia store
    await this.page.evaluate(() => {
      interface WindowWithStore extends Window {
        pagesStore?: {
          pages: unknown[];
          selectedPageIds: Set<string>;
        };
      }
      const win = window as WindowWithStore;
      if (win.pagesStore) {
        win.pagesStore.pages = [];
        win.pagesStore.selectedPageIds = new Set();
      }
    });
  }

  /**
   * 等待应用初始化完成
   */
  async waitForAppReady() {
    await this.page.waitForSelector('.app-container', { state: 'visible' });
    await this.page.waitForFunction(() => {
      interface WindowWithStore extends Window {
        pagesStore?: unknown;
      }
      return (window as WindowWithStore).pagesStore !== undefined;
    }, { timeout: 10000 });
  }

  /**
   * 获取当前语言
   */
  async getCurrentLanguage(): Promise<SupportedLocale> {
    await this.page
      .locator('[data-testid="language-selector-button"]')
      .getAttribute('title'); // 可选检查，用于验证 UI 状态

    // 如果无法通过 title 获取，我们可以检查 dropdown 的状态或 store
    return await this.page.evaluate(() => window.localStorage.getItem('locale') as SupportedLocale || 'en');
  }

  /**
   * 切换语言
   */
  async switchLanguage(language: SupportedLocale) {
    // 检查当前语言，如果是目标语言则直接跳过
    const currentLang = await this.getCurrentLanguage();
    if (currentLang === language) {
      return;
    }

    const labelMap: Record<string, string> = {
      'en': 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'ja-JP': '日本語'
    };
    const expectedLabel = labelMap[language];
    const appTitleText = TestData.translations[language].welcomeTitle;
    const welcomeText = TestData.translations[language].welcomeDescription;

    // 点击语言切换按钮
    await this.page.locator('[data-testid="language-selector-button"]').click();

    // Naive UI 的 NDropdown 选项定位器
    const option = this.page.locator('.n-dropdown-option').filter({ hasText: expectedLabel });

    if (await option.isVisible()) {
      await option.click();
    } else {
      // 如果没弹出或已是该语言，按 Esc 尝试关闭菜单并继续
      await this.page.keyboard.press('Escape');
    }

    // 优先检查欢迎描述（空状态下），如果不可见则检查应用标题（Header 中持久存在）
    const welcomeDesc = this.page.getByTestId('welcome-description');
    if (await welcomeDesc.isVisible()) {
      await expect(welcomeDesc).toHaveText(welcomeText, { timeout: 10000 });
    } else {
      await expect(this.page.getByTestId('app-title')).toHaveText(appTitleText, { timeout: 10000 });
    }

    // 等待下拉菜单关闭
    await this.page.waitForSelector('.n-dropdown-menu', { state: 'hidden' }).catch(() => { });
  }

  /**
   * 获取空状态提示文本
   */
  async getEmptyStateText(): Promise<string> {
    const emptyState = this.page.getByTestId('welcome-description');
    return await emptyState.textContent() || '';
  }

  /**
   * 检查应用是否处于空状态
   */
  async isEmptyState(): Promise<boolean> {
    return await this.page.getByTestId('welcome-title').isVisible();
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * 获取 OCR 健康状态指示器的文本
   */
  async getHealthStatusText(): Promise<string> {
    const indicator = this.page.locator('.health-status');
    // 需要确保 tooltip 已经显示，或者直接从 DOM 获取 (如果已渲染)
    // 我们的实现中状态文本在 tooltip 内部。
    // 为了测试方便，我们可以临时 hover 或者直接检查指示器的颜色/图标
    await this.page.locator('.n-badge').filter({ hasText: 'OCR Service' }).hover();
    return await indicator.textContent() || '';
  }

  /**
   * 获取健康指示器的颜色类型 (success/warning/error)
   */
  async getHealthStatusType(): Promise<'success' | 'warning' | 'error'> {
    const button = this.page.locator('button').filter({ hasText: 'OCR Service' });
    const classList = await button.getAttribute('class') || '';
    if (classList.includes('n-button--success-type')) return 'success';
    if (classList.includes('n-button--warning-type')) return 'warning';
    if (classList.includes('n-button--error-type')) return 'error';
    return 'success'; // 默认
  }
}
