import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const customMatchers = {
  /**
   * 检查页面状态
   */
  async toHavePageStatus(
    page: Page,
    pageIndex: number,
    expectedStatus: string
  ) {
    const actual = await page.evaluate((idx) => {
      return window.pagesStore?.pages[idx]?.status;
    }, pageIndex);

    return {
      pass: actual === expectedStatus,
      message: () => 
        `Expected page ${pageIndex} to have status "${expectedStatus}", but got "${actual}"`
    };
  },

  /**
   * 检查页面顺序
   */
  async toHaveConsistentOrder(page: Page, expectedNames: string[]) {
    const names = await page.locator('.page-name').allTextContents();
    const pass = JSON.stringify(names) === JSON.stringify(expectedNames);
    
    return {
      pass,
      message: () => pass 
        ? 'Order matches' 
        : `Order mismatch.\nExpected: ${JSON.stringify(expectedNames)}\nGot: ${JSON.stringify(names)}`
    };
  },

  /**
   * 检查数据库中的顺序
   */
  async toHaveDatabaseOrder(page: Page, expectedOrder: string[]) {
    const actualOrder = await page.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const pages = await db.pages.orderBy('order').toArray();
      return pages.map(p => p.name);
    });

    const pass = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);

    return {
      pass,
      message: () => pass
        ? 'Database order matches'
        : `Database order mismatch.\nExpected: ${JSON.stringify(expectedOrder)}\nGot: ${JSON.stringify(actualOrder)}`
    };
  },

  /**
   * 检查所有缩略图是否加载
   */
  async toHaveAllThumbnails(page: Page) {
    const pageCount = await page.locator('.page-item').count();
    const thumbnailCount = await page.locator('.page-item .thumbnail-img').count();
    const pass = pageCount === thumbnailCount && pageCount > 0;

    return {
      pass,
      message: () => pass
        ? 'All thumbnails are loaded'
        : `Expected ${pageCount} thumbnails, but found ${thumbnailCount}`
    };
  }
};

// 注册自定义 matchers
expect.extend(customMatchers);

// 导出类型声明
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PlaywrightTest {
    interface Matchers<R> {
      toHavePageStatus(page: Page, pageIndex: number, expectedStatus: string): Promise<R>;
      toHaveConsistentOrder(page: Page, expectedNames: string[]): Promise<R>;
      toHaveDatabaseOrder(page: Page, expectedOrder: string[]): Promise<R>;
      toHaveAllThumbnails(page: Page): Promise<R>;
    }
  }
}
