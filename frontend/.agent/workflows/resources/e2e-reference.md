# 📊 快速参考

## 常用命令速查表

| 场景 | 命令 | 用途 |
|------|------|------|
| 环境准备 | `npm run dev` | 启动开发服务器 |
| 聚焦测试 | `npx playwright test <file> --headed` | 可视化运行单个文件 |
| 调试模式 | `npx playwright test --debug` | 断点调试 |
| UI 模式 | `npm run test:e2e -- --ui` | 交互式测试开发 |
| 代码生成 | `npx playwright codegen http://localhost:5173` | 录制生成测试代码 |
| 完整测试 | `npm run test:e2e` | 运行所有 E2E 测试 |
| 测试报告 | `npx playwright show-report` | 查看 HTML 报告 |
| Trace 查看 | `npx playwright show-trace trace.zip` | 查看测试录制 |
| 环境清理 | `npm run test:e2e:cleanup` | 清理测试环境 |

## 选择器优先级速查（i18n 环境）

| 优先级 | 选择器 | 示例 | 推荐指数 | i18n 兼容 |
|--------|--------|------|---------|----------|
| 1 | `getByTestId()` | `page.getByTestId('submit-btn')` | ⭐⭐⭐⭐⭐ | ✅ |
| 2 | 固定 `aria-label` + `getByRole()` | `page.getByRole('button', { name: 'delete-page-button' })` | ⭐⭐⭐⭐ | ✅ |
| 3 | `getByRole()` (不带 `name`) | `page.getByRole('button')` | ⭐⭐⭐⭐ | ✅ |
| 4 | `data-*` 自定义属性 | `page.locator('[data-action="delete"]')` | ⭐⭐⭐ | ✅ |
| 5 | CSS/XPath | `page.locator('.submit-button')` | ⭐ | ✅ |
| - | `getByRole()` (带 `name`) | `page.getByRole('button', { name: 'Submit' })` | ❌ | ❌ |
| - | `getByText()` | `page.getByText('Import Files')` | ❌ | ❌ |
| - | `getByLabel()` | `page.getByLabel('Username')` | ❌ | ❌ |
| - | `getByPlaceholder()` | `page.getByPlaceholder('Enter email')` | ❌ | ❌ |

**说明**: 
- ✅ 表示在 i18n 环境下可以安全使用
- ❌ 表示依赖文本内容，在多语言环境下会失效

## 等待方法速查

| 场景 | 方法 | 示例 |
|------|------|------|
| 等待元素可见 | `waitFor()` | `await locator.waitFor({ state: 'visible' })` |
| 等待条件 | `waitForFunction()` | `await page.waitForFunction(() => ...)` |
| 等待响应 | `waitForResponse()` | `await page.waitForResponse(url => ...)` |
| 等待请求 | `waitForRequest()` | `await page.waitForRequest(url => ...)` |
| 等待导航 | `waitForURL()` | `await page.waitForURL('/dashboard')` |
| 等待选择器 | `waitForSelector()` | `await page.waitForSelector('.item')` |
