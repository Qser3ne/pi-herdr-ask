# 验收记录（2026-11-04）

## 环境

- Ubuntu 24.04 / Node.js 22.23.4。
- Pi 1.5.0；herdr-core 0.1.14。
- `@juicesharp/rpiv-ask-user-question` 2.15.0。
- 验收在独立 herdr 测试终端完成，没有修改当前 Pi 的安装配置、凭据或上游源码。

## 自动化

- 状态桥先运行空实现：12 个测试中 9 个断言失败，证明缺少 question 状态及恢复行为；实现后 12/12 通过。
- 扩展入口先运行空实现：总计 21 个测试中新增的 4 个用例失败；接入后 21/21 通过。
- 补充真实 Pi `ProgramStatusReporter` 与 `formatProgramStatus` 集成测试，确认原生状态去重不会导致问卷结束后残留 blocked，原生 auth 等待不被覆盖。
- 最终 `npm ci --ignore-scripts --legacy-peer-deps` 后，`npm test`：**23/23 通过**；`npm run typecheck`：通过。
- `npm pack --dry-run`：仅扩展源码、manifest、README 和本验收记录，不包含测试驱动、开发依赖或凭据。

## 真实问卷与 herdr-core

实际加载本扩展及 `test/fixtures/ask-driver.js`；后者注册真实提问插件，以 slash command 直接执行问卷，不需要模型生成工具调用。

| 路径 | herdr events 序号 | 实际状态 |
| --- | --- | --- |
| Esc 取消 | 189 → 190 → 193 → 194 | working → blocked/question → working → done |
| Enter 回答 | 196 → 197 → 201 → 202 | working → blocked/question → working → done |
| `/reload` 后再问并取消 | 206 → 207 → 212 → 213 | working → blocked/question → working → done |
| 退出 | 215 | status=null，无残留等待 |

- 等待时 `herdr-core get` 返回 `{"app":"pi","kind":"question","state":"blocked"}`。
- 取消结果为 `details.cancelled=true`；回答结果为 `details.cancelled=false` 且选项“确认”。
- 对照终端只加载真实提问插件和测试驱动，不加载本扩展：问卷已显示时状态仍为 `{"app":"pi","state":"working"}`，复现原问题。
- 两个测试终端（t40、t41）均已通过 Ctrl+D 正常退出并移除。

### 测试驱动注意事项

最初直接从另一个 herdr 终端调用 `hc send`，slash command 被包装为 `<hc from=...>` 普通模型消息，产生两次 OAuth invalidated-token 错误，未打开问卷。这不是扩展错误。随后将控制端命令改为 `env -u HC_TERMINAL_ID herdr-core send ...`，slash command 正常分发；上述正式验收全部通过，不需要修改凭据或调用模型。README 已记录这个调用方式。

## 自审与边界

作者按设计独立做了一次代码自审，无子代理/独立审阅者参与。

- 已检查等待计数、载荷验证、native clear、最新状态恢复、原生 auth 优先、退出后迟到事件、其他扩展包装器保留以及非 TUI 门控。
- 扩展只恢复它捕获到的最新原生状态；初次接入而尚无原生报告时，以 `ctx.isIdle()` 初始化为 idle 或 working，不读取终端私有缓存。
- 当前是本地独立子仓库，无远程，无发布；父仓库克隆暂不包含该子仓库。
- 未直接观察 Windows herdr GUI，因此 **`ask` 文案的人工验收仍待用户确认**。已验证的是问卷真实等待和对应 `blocked/question` 协议状态，不能把 core JSON 当作 GUI 截图验收。
