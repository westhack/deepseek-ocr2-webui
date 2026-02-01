/**
 * OCR 相关的 Helper 函数
 */

import type { Page } from '@playwright/test';

/**
 * 检查页面是否已完成 OCR
 */
export async function checkPagePastOCR(page: Page, idx: number): Promise<boolean> {
  return await page.evaluate((index) => {
    const pages = window.pagesStore?.pages || [];
    const status = pages[index]?.status;
    return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
            'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status || '');
  }, idx);
}

/**
 * 检查有多少页面正在处理中
 */
export async function checkProcessingPagesCount(page: Page, expectedCount: number): Promise<boolean> {
  return await page.evaluate((count) => {
    const pages = window.pagesStore?.pages || [];
    const processingCount = pages.filter(p => 
      p.status === 'pending_ocr' || p.status === 'recognizing'
    ).length;
    return processingCount === count;
  }, expectedCount);
}

/**
 * 检查所有页面是否都完成了 OCR
 */
export async function checkAllPagesCompletedOCR(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  });
}

/**
 * 等待所有 OCR 完成
 */
export async function waitForAllOCRComplete(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForFunction(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  }, { timeout });
}

/**
 * 等待指定页面的 OCR 完成（使用 pageId）
 * 包含错误处理和状态验证
 */
export async function waitForOCRSuccessByPageId(
  page: Page,
  pageId: string,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  
  // 首先等待 OCR 开始（避免在 OCR 还没开始时就开始等待完成）
  try {
    await page.waitForFunction(
      (id) => {
        const pages = window.pagesStore?.pages || [];
        const targetPage = pages.find(p => p.id === id);
        if (!targetPage) return false;
        // 等待状态变成处理中或完成状态
        const status = targetPage.status;
        return ['pending_ocr', 'recognizing', 'ocr_success', 'pending_gen', 
                'generating_markdown', 'markdown_success', 'generating_pdf', 
                'pdf_success', 'generating_docx', 'completed', 'error'].includes(status);
      },
      pageId,
      { timeout: 10000 } // OCR 应该在 10 秒内开始
    );
  } catch {
    throw new Error(`OCR did not start for page ${pageId} within 10 seconds`);
  }

  // 然后等待 OCR 完成或失败
  const remainingTimeout = Math.max(timeout - (Date.now() - startTime), 5000);
  
  // 使用轮询方式检查状态，同时检查错误
  const pollInterval = 500; // 每 500ms 检查一次
  const maxPolls = Math.floor(remainingTimeout / pollInterval);
  
  for (let i = 0; i < maxPolls; i++) {
    const pageInfo = await page.evaluate((id) => {
      const pages = window.pagesStore?.pages || [];
      const targetPage = pages.find(p => p.id === id);
      if (!targetPage) {
        return { status: 'not_found', errorMessage: 'Page not found', fileName: '' };
      }
      
      const status = targetPage.status;
      const logs = targetPage.logs?.filter(l => l.level === 'error') || [];
      
      return {
        status,
        errorMessage: logs.length > 0 ? logs[0].message : '',
        fileName: targetPage.fileName
      };
    }, pageId);

    // 检查是否是成功状态
    if (['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
         'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(pageInfo.status)) {
      return; // 成功，退出
    }

    // 检查是否是错误状态
    if (pageInfo.status === 'error') {
      throw new Error(
        `OCR failed for page ${pageInfo.fileName} (${pageId}): ${pageInfo.errorMessage || 'Unknown error'}`
      );
    }

    // 如果还在处理中，等待一下继续检查
    await page.waitForTimeout(pollInterval);
  }

  // 超时了，获取当前状态并抛出错误
  const pageInfo = await page.evaluate((id) => {
    const pages = window.pagesStore?.pages || [];
    const targetPage = pages.find(p => p.id === id);
    return targetPage
      ? { status: targetPage.status, fileName: targetPage.fileName }
      : { status: 'not_found', fileName: '' };
  }, pageId);

  throw new Error(
    `OCR did not complete for page ${pageInfo.fileName} (${pageId}) within ${timeout}ms. Current status: ${pageInfo.status}`
  );
}
