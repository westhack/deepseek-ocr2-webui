# 🏗️ 架构设计详解

## Page Object Model (POM) 设计原则

### 1. 职责分离

每个 Page Object 应该只负责一个特定的 UI 区域或功能模块：

```typescript
// ✅ 好的例子 - 职责明确
export class PageListPage {
  constructor(private page: Page) {}
  
  async getPageCount(): Promise<number> {
    return await this.page.locator('.page-item').count();
  }
}

// ❌ 坏的例子 - 职责混乱
export class PageListPage {
  async getPageCount(): Promise<number> { /* ... */ }
  async triggerOCR(index: number) { /* OCR 应该在 OCRPage */ }
  async exportFile() { /* Export 应该在 ExportPage */ }
}
```

### 2. 封装选择器

使用私有 getter 封装选择器，避免在多处重复：

```typescript
export class PageListPage {
  constructor(private page: Page) {}
  
  // ✅ 私有 getter
  private get pageItems() {
    return this.page.locator('.page-item');
  }
  
  private get selectAllCheckbox() {
    return this.page.getByTestId('select-all-checkbox');
  }
  
  // 公共方法使用 getter
  async selectAll() {
    await this.selectAllCheckbox.check();
  }
}
```

### 3. 命名约定

**类名**: `XxxPage` (如 `PageListPage`)  
**文件名**: `XxxPage.ts`  
**放置位置**: `tests/e2e/pages/`

**方法命名**:
- 动作方法: 使用动词开头 (`click`, `select`, `upload`)
- 查询方法: 使用 `get` 或 `is` 开头 (`getPageCount`, `isVisible`)
- 等待方法: 使用 `waitFor` 开头 (`waitForPagesLoaded`)

```typescript
// ✅ 好的命名
async clickPage(index: number) { }
async getPageCount(): Promise<number> { }
async isPageSelected(index: number): Promise<boolean> { }
async waitForPagesLoaded() { }

// ❌ 坏的命名
async page(index: number) { }  // 不明确
async count() { }  // 不明确
async check(index: number) { }  // 不明确
```

### 4. 返回值类型

- **动作方法**: 返回 `Promise<void>` 或不返回
- **查询方法**: 返回具体类型 (`Promise<number>`, `Promise<boolean>`)
- **等待方法**: 返回 `Promise<void>`

```typescript
// 动作方法
async selectAll(): Promise<void> {
  await this.selectAllCheckbox.check();
}

// 查询方法
async getPageCount(): Promise<number> {
  return await this.pageItems.count();
}

// 等待方法
async waitForPagesLoaded(): Promise<void> {
  await this.pageItems.first().waitFor({ state: 'visible' });
}
```

## Helper 函数开发

### 何时创建 Helper

- 跨多个 Page Object 使用的逻辑
- 复杂的等待逻辑
- 通用的验证逻辑
- 数据转换和处理

### Helper 函数示例

```typescript
// tests/e2e/helpers/wait-helpers.ts
import type { Page } from '@playwright/test';

/**
 * 等待页面达到指定状态
 * @param page Playwright Page 对象
 * @param pageIndex 页面索引
 * @param status 期望的状态（支持单个或多个）
 * @param timeout 超时时间（毫秒）
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
```

### Helper 命名约定

- **文件名**: `xxx-helpers.ts` (如 `wait-helpers.ts`)
- **函数名**: 描述性动词短语 (如 `waitForPageStatus`)
- **放置位置**: `tests/e2e/helpers/`

## Mock 数据管理

### APIMocks 使用指南

#### 基本用法

```typescript
import { APIMocks } from '../mocks/APIMocks';

test('should mock OCR API', async ({ page }) => {
  const apiMocks = new APIMocks(page);
  
  // 模拟成功响应
  await apiMocks.mockOCR();
  
  // 模拟延迟
  await apiMocks.mockOCR({ delay: 2000 });
  
  // 模拟失败
  await apiMocks.mockOCR({ shouldFail: true, statusCode: 500 });
});
```

#### 高级用法

```typescript
// 使用控制标志进行精确控制
test('should handle concurrent OCR', async ({ page }) => {
  const completeFlag = { value: false };
  
  await apiMocks.mockOCRWithControl(completeFlag);
  
  // ... 执行一些操作 ...
  
  // 允许 OCR 完成
  completeFlag.value = true;
});
```

### TestData 管理

#### 文件路径

```typescript
import { TestData } from '../data/TestData';

// 单个文件
TestData.files.samplePDF()
TestData.files.samplePNG()

// 多个文件
TestData.files.multipleImages()
TestData.files.pdfAndImages()
```

#### 翻译文本

```typescript
// 英文
TestData.translations.en.emptyState
TestData.translations.en.importButton

// 中文
TestData.translations['zh-CN'].emptyState
TestData.translations['zh-CN'].importButton
```

#### 页面状态

```typescript
// 就绪状态
TestData.pageStatuses.ready

// OCR 完成状态
TestData.pageStatuses.ocrComplete

// 处理中状态
TestData.pageStatuses.processing
```

## 测试结构规范

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';

test.describe('Feature Name', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    // 初始化 Page Objects
    app = new AppPage(page);
    pageList = new PageListPage(page);
    
    // 设置初始状态
    await app.goto();
    await app.waitForAppReady();
  });

  test('should do something specific', async ({ page }) => {
    // Arrange - 准备测试数据
    const filePath = TestData.files.samplePDF();
    
    // Act - 执行操作
    await pageList.uploadAndWaitReady([filePath]);
    
    // Assert - 验证结果
    expect(await pageList.getPageCount()).toBe(6);
  });
});
```

## 测试命名约定

- **使用 `should` 开头**: 描述期望行为
- **清晰简洁**: 一眼就能看出测试目的
- **包含关键信息**: 输入、操作、预期结果

```typescript
// ✅ 好的命名
test('should export Markdown when all pages ready', async ({ page }) => { })
test('should handle OCR failure gracefully', async ({ page }) => { })
test('should persist page order after reload', async ({ page }) => { })

// ❌ 坏的命名
test('test export markdown', async ({ page }) => { })
test('ocr', async ({ page }) => { })
test('page order', async ({ page }) => { })
```

## 测试独立性原则

每个测试应该完全独立，不依赖其他测试的状态：

```typescript
// ✅ 好的例子 - 每个测试自己准备数据
test.beforeEach(async ({ page }) => {
  app = new AppPage(page);
  await app.goto();
  await app.clearDatabase();  // 清理状态
});

test('test 1', async ({ page }) => {
  await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
  // ...
});

test('test 2', async ({ page }) => {
  await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
  // ...
});
```
