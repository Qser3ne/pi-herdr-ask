# Pi herdr Ask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 herdr 中将 ask_user_question 的等待状态从 working 改为 ask，并准确恢复原生状态。

**Architecture:** 监听 rpiv:ask-user:blocked，以工具调用 ID 跟踪等待。通过临时零行 widget 工厂取得公开的 TUI terminal，并可撤销地包装 setProgramStatus：记录原生报告，在等待期间覆盖为 blocked/question，最后恢复最新报告。复用 Pi 的 OSC 7501 编码和终端能力协商，不直接写 stdout，不改宿主源码。

**Tech Stack:** TypeScript，Node.js >=22.19，node:test，Pi 1.5.0 public ExtensionAPI/Terminal。

**Spec:** `../specs/2026-11-04-pi-herdr-ask-design.md`

## Global Constraints

- 独立子仓库 pi-extensions/pi-herdr-ask/，按用户指示原地开发。
- 仅支持当前 HC/OSC 路径；仅 TUI、stdout TTY 且存在 HC_TERMINAL_ID 时启用。
- 仅接入 rpiv:ask-user:blocked，不修改上游插件或 Pi，不处理所有 UI 弹窗。
- 不发送问题、选项或答案；等待报告只有 state=blocked、app=pi、kind=question。
- RPC/print/JSON 不产生状态输出。没有轮询、子进程或运行时依赖。
- 不自动创建远程仓库或推送；未设远程前父仓库不记录不可克隆的 submodule URL。

## Review Focus

- 原生状态在等待期间改变：结束恢复最新值，不恢复旧 working，Task 1 测试。
- 权限/auth 弹窗与问卷重叠：保留原生 blocked 优先级，Task 1 测试。
- 重复事件、乱序结束、非法载荷：不能误清其他问卷，Task 1 测试。
- 其他扩展在本扩展之后包装 terminal：卸载不得覆盖别人的方法，Task 1 测试。
- reload/中断/非交互子进程：不残留 ask，不写非 TUI 输出，Task 2 测试。

---

### Task 1: Reversible status bridge

**Files:** `src/status-bridge.ts`, `test/status-bridge.test.ts`, `package.json`, `tsconfig.json`, `.gitignore`。

**Interfaces:** `attachStatusBridge(terminal: Pick<Terminal, 'setProgramStatus'>, initial: ProgramStatus): { receive(data: unknown): void; close(toolCallId: string): void; dispose(): void }`。

- [ ] 编写测试：working→blocked/question→working；两问卷需全部关闭；重复/未知结束和错误载荷不更改状态；原生 done/error/idle 更新在等待结束后恢复；原生 blocked/auth 优先；clear 不被阻挡；dispose 幂等且保留后装包装器。
- [ ] `npm test`：断言失败，显示缺失桥接行为。
- [ ] 实现集合、载荷校验、原生报告快照、幂等清理；只在有效等待状态改变时输出。借用公开 Terminal 方法，不访问私有 programStatus。
- [ ] `npm test && npm run typecheck`：全部通过。
- [ ] 提交 `feat: bridge questionnaire waits to native terminal status`。

### Task 2: Extension lifecycle and real-host verification

**Files:** `src/index.ts`, `test/extension.test.ts`, `test/integration.test.ts`, `test/fixtures/ask-driver.ts`, `README.md`。

**Interfaces:** 默认导出 `(pi: ExtensionAPI) => void`。Task 1 的 bridge 负责状态；session_start 负责环境门控与安装，session_shutdown 负责退订/卸载，tool_execution_end 为缺失 finally 事件提供按 ID 兜底。

- [ ] 编写扩展边界测试：无启动副作用；TUI+HC+TTY 才装桥；关闭后事件无效；reload 无重复监听；普通 UI 不触发等待；工具结束只清理对应问卷。
- [ ] `npm test`：新用例因尚未注册桥接而失败。
- [ ] 实现入口及 package pi.extensions。临时 widget 工厂只获取 terminal，随后移除，不保留可见 UI。
- [ ] `npm test && npm run typecheck`：通过；使用真实 ProgramStatusReporter 验证原生去重不会留下 blocked。
- [ ] 用真实 herdr-core 启动隔离测试终端，加载实际提问插件和本扩展，命令驱动问卷，无模型调用；观察 blocked/question，发送答案/取消并核实恢复；退出且清理本次创建的终端。若无法检查 GUI 文案，明确保留人工验收。
- [ ] 写 README 安装/卸载/支持范围/本地子仓库说明；`npm pack --dry-run` 核查包内容。
- [ ] 提交 `feat: integrate Pi questionnaire lifecycle and document installation`。

## Execution decisions

- 用户已批准设计并要求实现，采用当前会话执行；用户明确要求当前目录独立子仓库，不建 worktree。
- 没有授权委派，最终做作者自审，不调用子代理。
- 本计划完整自审：两个任务接口匹配，覆盖设计；GUI 文案验收与已确认的协议状态分开报告。
