---
description: TDD development workflow with pre-check and post-verification gates. Use this for all coding tasks.
---

这是所有编码任务的**主要开发流程**。它在开发前、开发中和开发后强制执行质量门禁。

## 前置条件
- 已确定要修改的目标文件
- 需求已清晰理解（功能、修复或重构）
- **依赖**：确保 `@vitest/coverage-v8` 或 `@vitest/coverage-istanbul` 已安装以运行覆盖率报告

---

## 关键规则 (Critical Rules)

**如果在执行本工作流的过程中 Skip (跳过) 或 Ignore (忽略) 了任何用例、Warning 或 Error，你必须明确告知用户并解释原因。**
这是一条硬性规定，旨在防止问题被静默处理。


## 阶段 0：飞行前检查（必须通过）

在编写任何代码之前，验证项目处于健康状态。

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
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复这些失败的测试？用户可以选择：
     - **修复**：先修复失败的测试，再继续新任务
     - **继续**：忽略现有问题，继续新任务（不推荐）

// turbo
2. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？
   > [!IMPORTANT]
   > 如果需要修复 E2E 测试用例，**必须**参考 `/e2e` @.agent/workflows/e2e.md 流程中的[最佳实践大全](./e2e.md#🎯-最佳实践大全)和[架构设计详解](./e2e.md#🏗️-架构设计详解)。

// turbo
3. **验证覆盖率阈值**
   ```bash
   npm run test:unit -- --run --coverage
   ```
   - **覆盖率阈值**（来自 `vitest.config.ts`，针对每个文件）：
     - 行覆盖率 (Lines)：>= 90%
     - 分支覆盖率 (Branches)：>= 70%
     - 函数覆盖率 (Functions)：>= 80%
     - 语句覆盖率 (Statements)：>= 80%
   - **强制目标**：尽可能达到 100% 逻辑覆盖率
   - ❌ 如果覆盖率未达标，**报告用户并询问**：是否需要先补充测试？

// turbo
4. **验证代码质量（复杂度 + Lint）**
   ```bash
   npm run lint:complexity
   ```
   - **复杂度阈值**（来自 ESLint）：
     - 圈复杂度：<= 10
     - 认知复杂度：<= 15
   - **Lint 检查**：还会报告其他 warning 和 error
   - ❌ 如果有复杂度超标、warning 或 error，**报告用户并询问**：是否需要先修复？

✅ **只有所有检查通过（或用户选择继续）后才能进入阶段 1。**

### 阶段 0 问题修复流程

如果用户选择"修复"阶段 0 发现的问题：

1. **暂停当前任务**，将其标记为"待恢复"
2. **启动新的 /dev @.agent/workflows/dev.md 任务**，专门修复发现的问题：
   - 跳过阶段 0（已知问题，无需重复检查）
   - 执行阶段 1-4 完整流程
   - 任务名称应明确标注为"修复阶段 0 发现的问题"
3. **修复完成后**，返回原任务：
   - 重新执行阶段 0 验证修复结果
   - 如果通过，继续原任务的阶段 1-4
   - 如果仍有问题，重复上述流程

---

## 阶段 1：上下文分析与规划

1. **分析目标文件**
   - 阅读源文件和现有测试文件
   - 识别所有函数、类和导出成员
   - 识别所有导入和外部依赖
   - 对于 Bug 修复：识别失败的逻辑路径
   - 对于新功能：确定新逻辑应该放在哪里
   - 梳理所有逻辑分支（if/else、switch、try/catch、三元运算符）

2. **确定 Mock 需求**
   - 外部 API、IndexedDB（使用 `fake-indexeddb`）、PDF.js、Web Workers
   - 使用 `vi.mock()` 进行模块级 mock
   - 如果代码与 DOM 交互，使用 `jsdom`

3. **规划测试结构**
   - 确定测试文件位置（如 `src/path/to/file.test.ts`）
   - 先实现 "Happy Path" 测试
   - 为每个导出的函数/方法规划测试

---

## 阶段 2：TDD 循环（红 → 绿 → 重构）

### 红色阶段：先写失败的测试
1. 添加一个新的测试用例（或更新现有的），使其因缺少功能或 Bug 而失败
2. 使用 `it.only(...)` 或 `describe.only(...)` 聚焦于特定测试
3. 确认它因预期原因失败：
   ```bash
   npm run test:unit -- --run <file-path>
   ```

### 绿色阶段：最小实现
1. 编写**最少的代码**使失败的测试通过
2. 遵循测试 SOP：
   - 优先保证逻辑完整性，而非仅仅覆盖代码行
   - 正确 mock 外部边界
3. 验证测试通过

### 重构阶段：清理代码
1. 清理代码和测试结构（命名、DRY、类型）
2. 如果复杂度过高，将函数拆分为**纯逻辑**和**非纯 I/O**
3. 运行本地覆盖率检查：
   ```bash
   npm run test:unit -- --run <file-path> --coverage
   ```

**重复 TDD 循环直到功能/修复完成。**

---

## 阶段 3：工作后验证（必须通过）

在声明任务完成之前，所有门禁必须通过。

// turbo
1. **移除 `.only` 标签**
   - 确保测试文件中没有残留的 `it.only` 或 `describe.only`

// turbo
2. **运行所有单元测试**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 所有测试必须通过。零回归策略。

// turbo
3. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 所有测试必须通过。
   > [!IMPORTANT]
   > 如果需要修复 E2E 测试用例，**必须**参考 `/e2e` @.agent/workflows/e2e.md 流程中的[最佳实践大全](./e2e.md#🎯-最佳实践大全)和[架构设计详解](./e2e.md#🏗️-架构设计详解)。

// turbo
4. **验证覆盖率阈值**
   ```bash
   npm run test:unit -- --run --coverage
   ```
   - **覆盖率阈值**（针对每个文件）：
     - 行 (Lines)：>= 90%
     - 分支 (Branches)：>= 70%
     - 函数 (Functions)：>= 80%
     - 语句 (Statements)：>= 80%
   - ❌ 如果覆盖率未达标，返回阶段 2 补充测试。

// turbo
5. **验证代码质量（复杂度 + Lint）**
   ```bash
   npm run lint:complexity
   ```
   - **复杂度阈值**：
     - 圈复杂度：<= 10
     - 认知复杂度：<= 15
   - **Lint 检查**：所有 warning 和 error 必须解决
   - ❌ 如果有任何问题，返回阶段 2 进行修复。
   - ⚠️ **切记**：如果你在任何步骤中跳过了测试或忽略了警告，必须在最终报告中明确告知用户。

✅ **只有阶段 3 所有检查通过后，任务才算完成。**

---

## 阶段 4：文档记录

1. 创建或更新 `walkthrough.md`，包含：
   - 所做更改的摘要
   - 已验证的功能行为或 Bug 修复确认
   - 执行的测试命令和结果
   - 覆盖率状态和验证证明
   - 构建验证状态
2. 验证代码可读性和对项目风格指南的遵循

---

## 测试哲学（SOP）

所有代码更改都应遵循以下标准：

### 核心原则
- **测试先行规划**：在实现之前定义测试策略
- **逻辑完整性**：永远不要为了满足覆盖率而删除有效的代码分支
- **为可测试性重构**：难以覆盖的分支表明可测试性差，应拆分复杂函数
- **复杂度优先于覆盖率**：优先降低复杂度，而非在复杂函数上强求 100% 覆盖率
- **记录意图**：高覆盖率是手段，不是目的。如果边缘情况确实无法在测试中覆盖，达到 99% 覆盖率并记录原因，而不是通过脆弱的重构强制达到 100%

### 多层验证
| 层级       | 目标                                  |
| ---------- | ------------------------------------- |
| 单元和逻辑 | 核心业务逻辑 100% 覆盖                |
| 集成       | 验证复杂工作流                        |
| 外部边界   | Mock 所有外部 API、IndexedDB、Workers |

### 断言标准
```typescript
// 异步测试必须使用 hasAssertions
it('异步测试', async () => {
  expect.hasAssertions();
  const result = await asyncLogic();
  expect(result).toBe(true);
});

// 循环测试必须验证断言数量
it('循环测试', () => {
  expect.assertions(3);
  items.forEach(item => expect(item).toBeDefined());
});
```

### 资源管理
- 每个 `URL.createObjectURL` 必须有对应的 `revokeObjectURL`，通过 spy/mock 验证
- Canvas 上下文和 Web Workers 必须正确清理
- 在 `afterEach` 中清理数据库连接
- 每个测试后重置状态以保持沙箱隔离

### 环境安全与高保真 Mock
- 使用高保真 mock（如 `fake-indexeddb`）模拟浏览器特性
- 将核心算法提取为独立的纯函数，以便在 Node.js 中测试而无需 DOM 依赖

### 异步与沙箱最佳实践
- 始终 `await` 异步操作
- 使用 `vi.useFakeTimers()` 处理时间相关逻辑
- 使用 `await nextTick()` 或 Promise 包装处理事件发射器（如 `mitt`）
- 确保组件卸载或状态重置以保持沙箱隔离

### 状态完整性
- 验证持久化数据的完整生命周期（DB 操作、IndexedDB 状态）
- CRUD 操作必须完整测试

---

## 边缘情况示例

确保覆盖以下常见边缘情况：
- 空/Null/Undefined 输入
- 异步操作的错误处理
- 循环或数学逻辑的边界条件
- Mock 失败的网络或数据库响应
- 资源清理失败的情况

---

## 自我修复指南

- 如果修复破坏了现有测试，判断是测试太脆弱还是修复引入了回归
- 永远不要为了让当前实现通过而删除现有测试，**除非需求已根本性改变**
- 如果实现后测试失败，分析日志、自主修复代码并重新运行测试

---

## 快速参考

| 阶段   | 命令                                    | 通过标准                     |
| ------ | --------------------------------------- | ---------------------------- |
| 飞行前 | `npm run test:unit -- --run`            | 全部通过（或用户选择继续）   |
| 飞行前 | `npm run test:e2e`                      | 全部通过（或用户选择继续）   |
| 飞行前 | `npm run test:unit -- --run --coverage` | 覆盖率达标（或用户选择继续） |
| 飞行前 | `npm run lint:complexity`               | 复杂度达标（或用户选择继续） |
| TDD    | `npm run test:unit -- --run <file>`     | 目标测试通过                 |
| 工作后 | `npm run test:unit -- --run`            | 全部通过                     |
| 工作后 | `npm run test:e2e`                      | 全部通过                     |
| 工作后 | `npm run test:unit -- --run --coverage` | 覆盖率达标                   |
| 工作后 | `npm run lint:complexity`               | 复杂度达标                   |