import type { Page } from '@playwright/test';

/**
 * 等待 Store 达到特定状态
 */
export async function waitForStoreState<T>(
  page: Page,
  predicate: (store: Record<string, unknown>) => T,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100 } = options;

  return await page.waitForFunction(
    (pred) => {
      if (!window.pagesStore) return null;
      return pred(window.pagesStore);
    },
    predicate,
    { timeout, polling: interval }
  );
}

/**
 * 等待页面达到指定状态
 */
export async function waitForPageStatus(
  page: Page,
  pageIndex: number,
  status: string | string[],
  timeout: number = 10000
): Promise<void> {
  const statuses = Array.isArray(status) ? status : [status];

  await page.waitForFunction(
    ([idx, expectedStatuses]) => {
      const pages = window.pagesStore?.pages || [];
      const currentStatus = pages[idx]?.status;
      return expectedStatuses.includes(currentStatus);
    },
    [pageIndex, statuses] as const,
    { timeout }
  );
}

/**
 * 等待通知出现
 */
export async function waitForNotification(
  page: Page,
  text: string | RegExp,
  timeout: number = 5000
): Promise<void> {
  const selector = typeof text === 'string'
    ? `.n-notification:has-text("${text}")`
    : '.n-notification';

  const notification = page.locator(selector);
  await notification.waitFor({ state: 'visible', timeout });

  if (typeof text !== 'string') {
    const content = await notification.textContent();
    if (!text.test(content || '')) {
      throw new Error(`Notification content "${content}" does not match pattern ${text}`);
    }
  }
}

/**
 * 等待数据库操作完成
 * 使用网络空闲状态作为数据库同步完成的指示
 */
export async function waitForDatabaseSync(
  page: Page,
  timeout = 5000
): Promise<void> {
  // 等待网络空闲，确保所有异步数据库操作完成
  await page.waitForLoadState('networkidle', { timeout });
  
  // 可选：等待 store 中的数据更新完成
  await page.waitForFunction(() => {
    return window.pagesStore !== undefined;
  }, { timeout: 3000 }).catch(() => {
    // Store 可能还未初始化，继续执行
  });
}

/**
 * 轮询检查条件(替代 waitForTimeout)
 */
export async function pollUntil<T>(
  condition: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100, errorMessage = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (_error) {
      // Continue polling if condition check fails
      console.debug('Polling condition failed, retrying...', _error);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage);
}
