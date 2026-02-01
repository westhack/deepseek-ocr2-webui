# 🔍 调试和优化

## 调试技巧

### 1. 使用 UI 模式（⭐⭐⭐⭐⭐ 推荐）

```bash
npm run test:e2e -- --ui
```

**优点**:
- 实时查看测试执行
- 可以暂停和单步执行
- 查看每一步的 DOM 状态
- 时间旅行调试

### 2. 使用 Debug 模式

```typescript
test('should debug this', async ({ page }) => {
  await page.pause();  // 暂停执行，打开调试器
  // ...
});
```

```bash
# 命令行调试
npx playwright test --debug
```

### 3. 添加调试日志

```typescript
test('should log for debugging', async ({ page }) => {
  const count = await pageList.getPageCount();
  console.log('Page count:', count);
  
  const status = await ocrPage.getPageStatus(0);
  console.log('Page status:', status);
});
```

### 4. 截图调试

```typescript
test('should take screenshots', async ({ page }) => {
  await page.screenshot({ path: 'debug-1.png' });
  
  // 执行操作
  await pageList.uploadAndWaitReady([filePath]);
  
  await page.screenshot({ path: 'debug-2.png' });
});
```

### 5. Trace 录制（10x 调试效率提升）

```typescript
test('should trace production issue', async ({ page, context }) => {
  // 开始录制 trace
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  
  try {
    // 执行测试步骤
    await page.goto('/');
    await page.click('.problematic-button');
  } finally {
    // 保存 trace
    await context.tracing.stop({
      path: 'trace.zip',
    });
  }
});

// 查看 trace: npx playwright show-trace trace.zip
```

## 性能优化

### 1. 并行执行

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
});
```

### 2. 合理使用 Mock

```typescript
// ✅ 使用 Mock 加速测试
await apiMocks.mockOCR();  // 立即返回结果

// ❌ 不必要的真实 API 调用
// 会导致测试变慢且不稳定
```

### 3. 复用浏览器上下文

```typescript
// 对于独立的测试，可以复用浏览器实例
// Playwright 默认已优化，无需手动配置
```

### 4. 优化文件上传

```typescript
// ✅ 使用小文件进行快速测试
TestData.files.samplePNG()  // 141 KB

// ❌ 避免在每个测试中都使用大文件
TestData.files.largePDF()  // 仅在必要时使用
```

## 常见问题和解决方案

### 问题 1: 测试间歇性失败

**原因**: 使用了固定延迟或等待条件不够精确

**解决方案**:
```typescript
// ❌ 问题代码
await page.waitForTimeout(1000);

// ✅ 解决方案
await page.waitForFunction(() => {
  return document.querySelector('.target-element') !== null;
});
```

### 问题 2: 拖拽操作不稳定

**原因**: 元素尚未完全渲染或动画未完成

**解决方案**:
```typescript
async dragAndDrop(fromIndex: number, toIndex: number) {
  const source = this.pageItems.nth(fromIndex);
  const target = this.pageItems.nth(toIndex);
  
  // 确保元素可见
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  
  // 执行拖拽
  await source.dragTo(target);
  
  // 等待数据库更新
  await this.waitForDatabaseUpdate();
}
```

### 问题 3: 文件上传后页面未显示

**原因**: 未等待异步处理完成

**解决方案**:
```typescript
async uploadAndWaitReady(filePaths: string[]) {
  const beforeCount = await this.getPageCount();
  
  // 上传文件
  const [fileChooser] = await Promise.all([
    this.page.waitForEvent('filechooser'),
    this.page.click('.upload-btn')
  ]);
  await fileChooser.setFiles(filePaths);
  
  // 等待页面增加
  await this.page.waitForFunction((expected) => {
    return document.querySelectorAll('.page-item').length >= expected;
  }, beforeCount + filePaths.length);
  
  // 等待缩略图渲染
  await this.waitForThumbnailsReady();
}
```
