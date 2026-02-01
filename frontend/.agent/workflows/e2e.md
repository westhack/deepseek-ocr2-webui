---
description: E2E test development workflow using Playwright. Use this for creating or updating end-to-end tests.
---

这是 **E2E 测试开发**的专用流程。它遵循 TDD 风格，并在发现 Bug 时无缝切换到 `/dev` @.agent/workflows/dev.md 流程进行修复。

---

## 📖 快速导航

### 🚀 工作流程（按顺序执行）
- [前置条件](#前置条件)
- [关键规则](#关键规则-critical-rules)
- [阶段 0：飞行前检查](#阶段-0飞行前检查必须通过)
- [阶段 1：E2E 环境准备](#阶段-1e2e-环境准备)
- [阶段 2：E2E 测试开发（TDD）](#阶段-2e2e-测试开发tdd-风格)
- [阶段 3：验证](#阶段-3验证)
- [阶段 4：文档记录](#阶段-4文档记录)

### 📚 详细指南（资源文件）
- [🏗️ 架构设计详解](resources/e2e-architecture.md) - POM、Helper、Mock 数据管理
- [🎯 最佳实践大全](resources/e2e-best-practices.md) - Playwright 官方推荐 + 项目规范
- [🔍 调试和优化](resources/e2e-debugging.md) - 调试技巧、性能优化、常见问题
- [📊 快速参考](resources/e2e-reference.md) - 常用命令速查表

---

## 前置条件

- 已确定要测试的用户流程或功能
- 需求已清晰理解（新测试、Bug 复现、或测试更新）
- **依赖**：确保 Playwright 已安装并配置（`playwright.config.ts`）

---

## 关键规则 (Critical Rules)

**如果在执行本工作流的过程中 Skip (跳过) 或 Ignore (忽略) 了任何用例、Warning 或 Error，你必须明确告知用户并解释原因。**

这是一条硬性规定，旨在防止问题被静默处理。

---

## 阶段 0：飞行前检查（必须通过）

> 引用 `/dev` workflow @.agent/workflows/dev.md 的阶段 0，确保项目处于健康状态。

// turbo
1. **清理环境（防止进程残留）**
   ```bash
   npm run test:e2e:cleanup
   ```

// turbo
2. **运行所有单元测试**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
3. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
4. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - ❌ 如果阈值（针对每个文件）未达标，**报告用户并询问**：是否需要先修复？

✅ **只有所有检查通过（或用户选择继续）后才能进入阶段 1。**

### 阶段 0 问题修复流程

如果用户选择"修复"阶段 0 发现的问题：

1. **暂停当前 E2E 任务**：将其标记为待恢复状态。
2. **启动新的 `/dev` @.agent/workflows/dev.md 任务**：
   - 目标是修复阶段 0 中失败的特定项目（如修复测试、降低复杂度或补充覆盖率）。
   - 跳过该修复任务的阶段 0 检查，直接进入阶段 1-4。
   - 必须遵循完整的 TDD 循环。
3. **修复完成后**：
   - 返回 `/e2e` @.agent/workflows/e2e.md 任务。
   - 重新执行阶段 0 的全部检查以确保项目恢复健康。
   - 只有重新验证通过后，才允许进入阶段 1 进行环境准备。

---

## 阶段 1：E2E 环境准备

// turbo
1. **检查开发服务器**
   - 检查 `http://localhost:5173/` 是否已有服务器运行
   - **如果已运行** → 直接使用，记录为"复用模式"
   - **如果未运行** → 启动新服务器，记录为"新启动模式"
     ```bash
     npm run dev
     ```

2. **分析目标用户流程**
   - 明确要测试的用户旅程（User Journey）
   - 识别关键交互点（点击、输入、拖拽等）
   - 确定预期结果和断言点

3. **确定测试文件位置**
   - 测试文件放在 `tests/e2e/specs/` 目录下
   - 按功能模块命名（如 `file-processing.spec.ts`、`persistence.spec.ts`）

---

## 阶段 2：E2E 测试开发（TDD 风格）

### 红色阶段：先写失败的 E2E 测试

1. **创建或更新测试文件**
   - 沿用 Playwright 的 `test` 和 `expect` API 风格
   - **必须**使用从自定义 fixture 导出的版本：
     ```typescript
     import { test, expect } from '../fixtures/base-test';
     ```
   - 描述用户流程的每个步骤
   - 📖 **参考**：[测试结构规范](resources/e2e-architecture.md#测试结构规范) | [测试命名约定](resources/e2e-architecture.md#测试命名约定)

2. **使用聚焦模式开发**
   ```bash
   npx playwright test tests/e2e/specs/<file>.spec.ts --headed
   ```
   - 使用 `--headed` 可视化调试
   - 使用 `test.only(...)` 聚焦单个测试
   - 📖 **参考**：[调试技巧](resources/e2e-debugging.md#1-使用-ui-模式-推荐)

3. **遵循架构设计原则**
   - 使用 Page Object 封装页面操作
   - 使用 Helper 函数处理复杂等待逻辑
   - 使用 Mock 数据加速测试
   - 📖 **参考**：[架构设计详解](resources/e2e-architecture.md)

4. **应用最佳实践**
   - 优先使用面向用户的定位器（`getByRole`、`getByLabel`）
   - 使用智能等待，避免固定延迟
   - 确保测试独立性
   - 📖 **参考**：[最佳实践大全](resources/e2e-best-practices.md)

5. **确认测试因正确原因失败**
   - 如果是功能缺失 → 这是预期的红色状态
   - 如果是选择器问题 → 修复选择器

### 绿色阶段：让测试通过

**情况 A：测试通过（功能已存在）**
- 继续添加更多测试用例

**情况 B：需要修改应用代码**
- ⚠️ **切换到 `/dev` @.agent/workflows/dev.md 流程**：
  1. 暂停 E2E 测试开发
  2. 按照 `/dev` @.agent/workflows/dev.md 流程修复 Bug 或实现功能
  3. 确保单元测试覆盖
  4. 返回继续 E2E 测试
- 📖 **参考**：[与 /dev 流程的协作](#与-dev-流程的协作)

### 重构阶段：优化测试代码

1. **提取可复用的工具函数**
   - 常用操作封装到 `tests/e2e/utils/` 或 Page Object
   - 如：文件上传、页面导航
   - 📖 **参考**：[Helper 函数开发](resources/e2e-architecture.md#helper-函数开发)

2. **优化选择器**
   - 优先使用语义化定位器
   - 避免脆弱的 CSS 选择器
   - 📖 **参考**：[Locator 策略优先级](resources/e2e-best-practices.md#locator-策略优先级)

3. **添加适当的等待和重试**
   - 使用 Playwright 的自动等待机制
   - 对于复杂异步操作，使用 `waitFor` 系列方法
   - 📖 **参考**：[智能等待策略](resources/e2e-best-practices.md#智能等待策略)

---

## 阶段 3：验证

// turbo
1. **运行完整 E2E 测试套件**
   ```bash
   npm run test:e2e
   ```
   - ❌ 所有测试必须通过
   - 如果 E2E 测试失败 → 返回阶段 2 修复测试或切换到 `/dev` @.agent/workflows/dev.md 修复代码

// turbo
2. **运行所有单元测试（确保无回归）**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 所有测试必须通过
   - 如果单元测试失败 → 切换到 `/dev` @.agent/workflows/dev.md 流程修复

// turbo
3. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - 引用 `/dev` @.agent/workflows/dev.md 的质量门禁标准（针对每个文件）
   - ❌ 如果阈值未达标 → 切换到 `/dev` @.agent/workflows/dev.md 流程修复代码
   - ⚠️ **切记**：如果你在任何步骤中跳过了测试或忽略了警告，必须在最终报告中明确告知用户。

// turbo
4. **处理开发服务器**
   - **若为"复用模式"**（阶段 1 检测到已有服务器）→ 保持运行，不关闭
   - **若为"新启动模式"**（阶段 1 启动了新服务器）→ 关闭服务器

// turbo
5. **环境清理**
   ```bash
   npm run test:e2e:cleanup
   ```

✅ **只有阶段 3 所有检查通过后，任务才算完成。**

---

## 阶段 4：文档记录

1. 更新 `walkthrough.md`，包含：
   - 新增/修改的 E2E 测试摘要
   - 测试覆盖的用户流程
   - 执行的测试命令和结果
   - 如果修复了 Bug，记录修复内容

---

## 与 /dev 流程的协作

当 E2E 测试发现 Bug 或需要新功能时：

```
E2E 红色阶段 → 发现需要改代码
       ↓
 切换到 /dev @.agent/workflows/dev.md 流程
       ↓
 /dev @.agent/workflows/dev.md 阶段 1-4（完整 TDD 循环）
       ↓
 返回 E2E 流程
       ↓
 E2E 绿色阶段 → 测试通过
```

**关键原则**：
- E2E 测试不应直接修改应用代码
- 代码修改必须通过 `/dev` @.agent/workflows/dev.md 流程，确保单元测试覆盖
- 这保证了测试金字塔的完整性

---

## 📚 参考资源

- [Playwright 官方文档](https://playwright.dev)
- [Page Object Model 模式](https://playwright.dev/docs/pom)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
- [Locators 指南](https://playwright.dev/docs/locators)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [并行测试](https://playwright.dev/docs/test-parallel)

