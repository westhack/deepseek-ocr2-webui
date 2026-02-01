/**
 * Locator Helper Functions
 * 
 * 这些辅助函数提供了更可靠和可维护的方式来定位和操作页面元素。
 * 遵循 i18n 兼容的 data-testid 优先策略。
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * 安全地选择页面并等待上下文更新
 * 
 * @param page - Playwright Page 对象
 * @param pageIndex - 页面索引（从 0 开始）
 * @returns 页面 ID
 */
export async function selectPageAndWait(
  page: Page,
  pageIndex: number
): Promise<string> {
  const pageItem = page.locator('[data-testid^="page-item-"]').nth(pageIndex);
  const pageId = await pageItem.getAttribute('data-page-id');
  
  if (!pageId) {
    throw new Error(`无法获取页面 ${pageIndex} 的 ID`);
  }
  
  await pageItem.click();
  await expect(pageItem).toHaveClass(/active/);
  
  // 等待 PageViewer 上下文切换
  await page.waitForFunction((id) => {
    const viewer = document.querySelector('[data-testid="page-viewer"]');
    return viewer?.dataset?.currentPageId === id;
  }, pageId, { timeout: 5000 });
  
  return pageId;
}

/**
 * 触发 OCR 并等待完成
 * 
 * @param page - Playwright Page 对象
 * @param pageId - 页面 ID
 * @param timeout - 超时时间（毫秒）
 */
export async function triggerOCRAndWait(
  page: Page,
  pageId: string,
  timeout: number = 30000
): Promise<void> {
  const ocrBtn = page.getByTestId('ocr-trigger-btn');
  await expect(ocrBtn).toBeEnabled();
  await ocrBtn.click();
  
  await page.waitForFunction((id) => {
    const pages = window.pagesStore?.pages || [];
    const targetPage = pages.find(p => p.id === id);
    return targetPage?.status === 'ocr_success';
  }, pageId, { timeout });
}

/**
 * 等待通知出现
 * 使用 role="alert" 验证（i18n 友好）
 * 
 * @param page - Playwright Page 对象
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForNotification(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await expect(page.getByRole('alert').first()).toBeVisible({ timeout });
}

/**
 * 等待错误通知出现
 * 使用 role="alert" 验证（i18n 友好）
 * 
 * @param page - Playwright Page 对象
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForErrorNotification(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await expect(page.getByRole('alert').first()).toBeVisible({ timeout });
}

/**
 * 获取页面项元素
 * 
 * @param page - Playwright Page 对象
 * @param pageIndex - 页面索引（从 0 开始）
 * @returns Locator
 */
export function getPageItem(page: Page, pageIndex: number) {
  return page.locator('[data-testid^="page-item-"]').nth(pageIndex);
}

/**
 * 获取所有页面项元素
 * 
 * @param page - Playwright Page 对象
 * @returns Locator
 */
export function getAllPageItems(page: Page) {
  return page.locator('[data-testid^="page-item-"]');
}

/**
 * 点击页面项的删除按钮
 * 
 * @param page - Playwright Page 对象
 * @param pageIndex - 页面索引（从 0 开始）
 */
export async function clickPageDeleteButton(
  page: Page,
  pageIndex: number
): Promise<void> {
  const pageItem = getPageItem(page, pageIndex);
  await pageItem.hover();
  const deleteBtn = pageItem.getByTestId('delete-page-btn');
  await deleteBtn.click();
}

/**
 * 确认删除对话框
 * 
 * @param page - Playwright Page 对象
 */
export async function confirmDeleteDialog(page: Page): Promise<void> {
  const dialog = page.locator('.n-dialog.n-modal');
  await expect(dialog).toBeVisible();
  
  await dialog.locator('button:has-text("Confirm")').click();
}

/**
 * 等待 PageViewer 上下文切换完成
 * 
 * @param page - Playwright Page 对象
 * @param pageId - 目标页面 ID
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForPageViewerContext(
  page: Page,
  pageId: string,
  timeout: number = 5000
): Promise<void> {
  await page.waitForFunction((id) => {
    const viewer = document.querySelector('[data-testid="page-viewer"]');
    return viewer?.dataset?.currentPageId === id;
  }, pageId, { timeout });
}

/**
 * 检查页面项是否被选中
 * 
 * @param page - Playwright Page 对象
 * @param pageIndex - 页面索引（从 0 开始）
 * @returns 是否被选中
 */
export async function isPageSelected(
  page: Page,
  pageIndex: number
): Promise<boolean> {
  const pageItem = getPageItem(page, pageIndex);
  const classList = await pageItem.getAttribute('class');
  return classList?.includes('selected') || false;
}

/**
 * 获取选中的页面数量
 * 
 * @param page - Playwright Page 对象
 * @returns 选中的页面数量
 */
export async function getSelectedPageCount(page: Page): Promise<number> {
  return await page.locator('[data-testid^="page-item-"].selected').count();
}
