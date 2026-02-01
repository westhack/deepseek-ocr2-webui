import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { PreviewPage } from '../pages/PreviewPage';
import { TestData } from '../data/TestData';

test.describe('Panel Collapse States', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let preview: PreviewPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    preview = new PreviewPage(page);
    
    await app.goto();
    await pageList.uploadAndWaitReady(TestData.files.samplePNG());
  });

  const states = [
    { name: 'S1', collapseList: false, collapsePreview: false },
    { name: 'S2', collapseList: true, collapsePreview: false },
    { name: 'S3', collapseList: false, collapsePreview: true },
    { name: 'S4', collapseList: true, collapsePreview: true },
  ];

  for (const state of states) {
    test(`should match visual snapshot for ${state.name}`, async ({ page }) => {
      // 设置面板状态
      if (state.collapseList) {
        await page.click('[data-testid="collapse-list-button"]');
      }
      if (state.collapsePreview) {
        await preview.toggleCollapse();
      }

      // 等待动画完成
      await page.waitForTimeout(1000);

      // 视觉快照（mask 掉动态内容）
      // 使用 data-testid 定位动态元素
      await expect(page).toHaveScreenshot(`panel-state-${state.name}.png`, {
        mask: [page.getByTestId('page-image'), page.locator('.timestamp')],
        maxDiffPixelRatio: 0.02,
        threshold: 0.2
      });
    });
  }

  test('should toggle Page List state correctly', async ({ page }) => {
    const container = page.getByTestId('page-list-container');
    
    // S1 -> S2 (折叠)
    // 初始状态：侧边栏应该可见
    await expect(container).toBeVisible();
    await page.click('[data-testid="collapse-list-button"]');
    // 验证侧边栏被折叠（collapsed-width="0" 时会完全隐藏）
    await expect(container).not.toBeVisible({ timeout: 2000 });

    // S2 -> S1 (展开)
    await page.click('[data-testid="collapse-list-button"]');
    // 验证侧边栏展开
    await expect(container).toBeVisible({ timeout: 2000 });
  });

  test('should toggle Preview state correctly', async ({ page }) => {
    // S1 -> S3
    await preview.toggleCollapse();
    expect(await preview.isCollapsed()).toBeTruthy();

    // S3 -> S1
    await page.click('[data-testid="expand-preview-button"]');
    expect(await preview.isCollapsed()).toBeFalsy();
  });
});
