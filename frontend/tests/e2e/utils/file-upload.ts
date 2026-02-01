import type { Page } from '@playwright/test';

/**
 * 上传文件到应用
 * @param page - Playwright Page 对象
 * @param filePaths - 要上传的文件路径数组
 */
export async function uploadFiles(page: Page, filePaths: string | string[]) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.app-header button:has-text("Import Files")')
  ]);

  await fileChooser.setFiles(paths);
}

/**
 * 通过拖放上传文件
 * @param page - Playwright Page 对象
 * @param filePaths - 要上传的文件路径数组
 */
export async function uploadFilesByDragDrop(page: Page, _filePaths: string | string[]) {
  // 获取拖放区域
  const dropZone = page.locator('.drop-zone, .empty-state');

  // 创建 DataTransfer 对象并设置文件
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    // 注意: 在浏览器中无法直接从文件系统创建 File 对象
    // 这里只是一个示例结构,实际使用时可能需要其他方式
    return dt;
  });

  // 触发 drop 事件
  await dropZone.dispatchEvent('drop', { dataTransfer });
}
