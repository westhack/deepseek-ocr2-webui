# 🎯 最佳实践大全

## Locator 策略优先级

### ⚠️ i18n 环境特别说明

**本项目支持国际化（i18n）**，因此定位器策略需要特别调整：

### i18n 环境下的优先级排序

1. ⭐⭐⭐⭐⭐ **`getByTestId()`** - **i18n 环境首选**，完全语言无关
2. ⭐⭐⭐⭐ **固定的 `aria-label` + `getByRole()`** - 适合图标按钮
3. ⭐⭐⭐⭐ **`getByRole()` (不带 `name`)** - 配合 testid 使用
4. ⭐⭐⭐ **`data-*` 自定义属性** - 备选方案
5. ⭐ **CSS/XPath** - 最后选择

### ❌ i18n 环境下不可用的方法

```typescript
// ❌ 这些方法在切换语言后会失败
page.getByRole('button', { name: 'Submit' })      // 'Submit' 会变成 '提交'
page.getByText('Import Files')                    // '导入文件'
page.getByLabel('Username')                       // '用户名'
page.getByPlaceholder('Enter email')              // '请输入邮箱'
page.locator('button:has-text("Confirm")')        // '确认'
```

### ✅ i18n 环境下的推荐方式

```typescript
// ✅ 方案 1: 使用 data-testid（最推荐）
await page.getByTestId('submit-btn').click();

// ✅ 方案 2: testid + role 组合（验证可访问性）
const submitBtn = page.getByTestId('submit-btn');
await expect(submitBtn).toHaveRole('button');
await submitBtn.click();

// ✅ 方案 3: 固定的 aria-label（适合图标按钮）
// 组件中:
<n-button 
  data-testid="delete-btn"
  aria-label="delete-page-button"  <!-- 固定不翻译 -->
  :title="$t('actions.delete')"    <!-- tooltip 翻译 -->
>
  <TrashIcon />
</n-button>

// 测试中:
await page.getByTestId('delete-btn').click();
// 或
await page.getByRole('button', { name: 'delete-page-button' }).click();

// ✅ 方案 4: role 不带 name（配合 testid 使用）
const pageItem = page.getByTestId('page-item-0');
const deleteBtn = pageItem.getByRole('button');  // 不指定 name
await deleteBtn.click();

// ❌ 避免: 依赖文本内容
// await page.getByRole('button', { name: 'Submit' }).click();
// await page.getByText('Import Files').click();
```

### 传统 Playwright 优先级（仅供参考）

在**不支持 i18n** 的项目中，Playwright 推荐的优先级是：

1. ⭐⭐⭐⭐⭐ `getByRole()` - 基于 ARIA 角色
2. ⭐⭐⭐⭐ `getByLabel()` - 表单元素
3. ⭐⭐⭐⭐ `getByPlaceholder()` - 输入框
4. ⭐⭐⭐ `getByText()` - 可见文本
5. ⭐⭐ `getByTestId()` - data-testid
6. ⭐ CSS/XPath - 最后选择

但在本项目中，由于 i18n 的需求，**`getByTestId()` 被提升为首选**。

### 为什么在 i18n 环境下优先使用 data-testid？

1. **语言无关**: 不受任何文本内容影响，在所有语言下都能正常工作
2. **明确的测试意图**: testid 专门为测试设计，不会因业务逻辑改变而失效
3. **易于搜索和重构**: 在代码库中可以轻松追踪所有使用点
4. **Playwright 官方认可**: 在复杂场景（如 i18n）下推荐使用
5. **可维护性**: 前端和测试团队可以协商统一的命名规范
6. **可访问性**: 结合 `role` 属性仍可保证可访问性验证

### 组件标注最佳实践

```vue
<template>
  <!-- 有文本的按钮 -->
  <n-button
    data-testid="import-files-btn"      <!-- ⭐ 主要：测试定位 -->
    role="button"                       <!-- ✅ 辅助：可访问性 -->
    @click="handleImport"
  >
    {{ $t('common.importFiles') }}      <!-- ✅ 用户文本（翻译） -->
  </n-button>

  <!-- 图标按钮 -->
  <n-button
    data-testid="delete-page-btn"       <!-- ⭐ 主要：测试定位 -->
    aria-label="delete-page-button"     <!-- ✅ 辅助：固定标识 -->
    :title="$t('actions.delete')"       <!-- ✅ Tooltip（翻译） -->
  >
    <TrashIcon />
  </n-button>
</template>
```


## 智能等待策略

### 避免固定延迟

```typescript
// ❌ 不要使用固定延迟
await page.waitForTimeout(5000);

// ✅ 使用条件等待
await page.waitForFunction(() => {
  return window.pagesStore?.pages.length > 0;
});

// ✅ 使用 helper 函数
await waitForPageStatus(page, 0, 'ocr_success');

// ✅ 使用 Playwright 内置等待
await page.locator('.page-item').first().waitFor({ state: 'visible' });
```

### 常见等待场景

**1. 等待元素出现**

```typescript
// 等待单个元素
await page.locator('.page-item').waitFor({ state: 'visible' });

// 等待多个元素
await page.waitForFunction((count) => {
  return document.querySelectorAll('.page-item').length === count;
}, expectedCount);
```

**2. 等待状态变化**

```typescript
// 等待 Store 状态
await page.waitForFunction(() => {
  const pages = window.pagesStore?.pages || [];
  return pages[0]?.status === 'ocr_success';
});

// 使用 helper
await waitForPageStatus(page, 0, 'ocr_success');
```

**3. 等待网络请求**

```typescript
// 等待特定请求完成
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/ocr') && response.status() === 200
);
await page.click('.trigger-ocr-btn');
await responsePromise;
```

## 测试隔离与环境标准

- **测试独立性**: 每个测试应独立运行，不依赖其他测试的状态
- **状态清理**: 使用 `beforeEach` 清理或重置状态
- **使用自定义 fixture**: **必须使用 `../fixtures/base-test`** 替代直接从 `@playwright/test` 导入
- **串行测试**: 对于具有严格先后顺序依赖的测试组，可以使用 `test.describe.serial`

## 全局质量门禁 (Console Monitoring)

本项目强制要求所有 E2E 测试保持浏览器控制台"清洁"。任何未处理的 `Error` 或 `Warning` 都会导致测试失败。

- **实现方式**：自动通过 `fixtures/base-test.ts` 实现
- **标准**：测试结束时，控制台日志累积量必须为 0
- **排除**：如果某些第三方警告无法修复且不影响功能，可在 `base-test.ts` 中配置白名单过滤

## 使用 test.step() 组织测试步骤

使用 `test.step()` 可以将复杂测试分解为有意义的步骤，提高可读性和调试效率：

```typescript
test('should complete full workflow', async ({ page }) => {
  await test.step('Setup: Upload files', async () => {
    await pageList.uploadAndWaitReady([
      TestData.files.samplePDF(),
      TestData.files.samplePNG()
    ]);
    expect(await pageList.getPageCount()).toBe(7);
  });

  await test.step('Process: Trigger OCR', async () => {
    await pageList.selectAll();
    await pageList.clickBatchOCR();
    await ocrPage.waitForAllOCRComplete();
  });

  await test.step('Verify: Export results', async () => {
    const download = await exportPage.exportAs('Markdown');
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });
});
```

**优点**:
- 测试报告中显示每个步骤的执行状态
- 失败时能快速定位到具体步骤
- 提高测试代码的可读性

## Soft Assertions（软断言）

使用软断言允许测试在断言失败后继续执行，收集所有错误：

```typescript
test('should validate multiple properties', async ({ page }) => {
  // 使用 soft 断言
  await expect.soft(page.getByText('Title')).toBeVisible();
  await expect.soft(page.getByText('Description')).toBeVisible();
  await expect.soft(page.getByText('Author')).toBeVisible();
  
  // 即使前面的断言失败，这个也会执行
  await expect.soft(page.getByText('Date')).toBeVisible();
  
  // 最后统一报告所有失败
});
```

**使用场景**:
- 验证页面的多个元素
- UI 一致性检查
- 批量验证列表项

## Storage State（存储状态）

保存和复用认证状态，避免每个测试都重新登录，**可节省 50%+ 测试时间**：

```typescript
// auth.setup.ts - 设置认证
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // 等待登录完成
  await page.waitForURL('/dashboard');
  
  // 保存认证状态
  await page.context().storageState({ path: 'auth.json' });
});

// 在测试中使用保存的状态
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'auth.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

## 视觉回归测试

使用 `toHaveScreenshot()` 进行视觉对比测试：

```typescript
test('should match visual snapshot', async ({ page }) => {
  await page.goto('/dashboard');
  
  // 第一次运行会生成基准截图
  // 后续运行会与基准对比
  await expect(page).toHaveScreenshot('dashboard.png', {
    // 忽略动态内容
    mask: [page.locator('.timestamp'), page.locator('.loading-spinner')],
    
    // 允许的最大差异像素数
    maxDiffPixels: 100,
    
    // 允许的最大差异比例
    maxDiffPixelRatio: 0.02,
  });
});
```

**最佳实践**:
- Mask 掉动态内容（时间戳、加载动画等）
- 设置合理的差异阈值
- 在 CI 中使用 `--update-snapshots` 更新基准

## 网络拦截和模拟

### 修改请求

```typescript
test('should modify API request', async ({ page }) => {
  await page.route('**/api/ocr', async (route) => {
    const request = route.request();
    
    // 修改请求头
    await route.continue({
      headers: {
        ...request.headers(),
        'X-Custom-Header': 'test-value',
      },
    });
  });
  
  await page.goto('/');
});
```

### 模拟不同的响应

```typescript
test('should handle various API responses', async ({ page }) => {
  // 模拟成功响应
  await page.route('**/api/ocr', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: '...' }),
    });
  });
  
  // 模拟延迟
  await page.route('**/api/slow', async (route) => {
    await page.waitForTimeout(3000);
    await route.continue();
  });
  
  // 模拟网络错误
  await page.route('**/api/error', async (route) => {
    await route.abort('failed');
  });
});
```

### 等待特定请求

```typescript
test('should wait for API call', async ({ page }) => {
  // 方法 1: 等待响应
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/ocr') && response.status() === 200
  );
  await page.click('.trigger-ocr-btn');
  const response = await responsePromise;
  const data = await response.json();
  
  // 方法 2: 等待请求
  const requestPromise = page.waitForRequest(
    request => request.url().includes('/api/ocr')
  );
  await page.click('.trigger-ocr-btn');
  await requestPromise;
});
```

## Test Fixtures 高级用法

创建自定义 fixtures 来设置测试环境：

```typescript
// fixtures/custom-test.ts
import { test as base } from '@playwright/test';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';

type MyFixtures = {
  pageList: PageListPage;
  ocrPage: OCRPage;
  authenticatedPage: Page;
};

export const test = base.extend<MyFixtures>({
  // 自动初始化的 Page Object
  pageList: async ({ page }, use) => {
    const pageList = new PageListPage(page);
    await use(pageList);
  },
  
  ocrPage: async ({ page }, use) => {
    const ocrPage = new OCRPage(page);
    await use(ocrPage);
  },
  
  // 已认证的页面
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'auth.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

// 使用自定义 fixture
test('should use fixtures', async ({ pageList, ocrPage }) => {
  // pageList 和 ocrPage 已经初始化好了
  await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
  await ocrPage.triggerOCR(0);
});
```

## 并行和分片

### 配置并行度（可减少 50-70% CI 执行时间）

```typescript
// playwright.config.ts
export default defineConfig({
  // 在文件级别并行
  fullyParallel: true,
  
  // Worker 数量
  workers: process.env.CI ? 2 : '50%',
  
  // 每个 worker 的最大失败次数
  maxFailures: process.env.CI ? 1 : 0,
});
```

### 使用分片加速 CI

```typescript
// package.json
{
  "scripts": {
    "test:shard-1": "playwright test --shard=1/3",
    "test:shard-2": "playwright test --shard=2/3",
    "test:shard-3": "playwright test --shard=3/3"
  }
}
```

```yaml
# GitHub Actions
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/3
```

### 控制测试执行模式

```typescript
// 完全并行（默认）
test.describe.configure({ mode: 'parallel' });

// 串行执行
test.describe.configure({ mode: 'serial' });

test.describe('Serial tests', () => {
  test.describe.configure({ mode: 'serial' });
  
  test('runs first', async ({ page }) => { });
  test('runs second', async ({ page }) => { });
});
```

## 测试重试策略

```typescript
// playwright.config.ts - 全局配置
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});

// 单个测试配置
test('flaky test', async ({ page }) => {
  test.retries(3);  // 这个测试最多重试 3 次
  // ...
});

// 条件跳过
test('conditional test', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Not supported in WebKit');
  test.fixme(someCondition, 'Known issue, will fix later');
  test.slow(); // 将超时时间增加 3 倍
  // ...
});
```

## 测试标记和过滤

```typescript
// 添加标记
test('critical feature @smoke', async ({ page }) => { });
test('new feature @experimental', async ({ page }) => { });

// 运行特定标记的测试
// npm run test:e2e -- --grep @smoke
// npm run test:e2e -- --grep-invert @experimental  (排除)
```
