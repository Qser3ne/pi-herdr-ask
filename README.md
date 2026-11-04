# pi-herdr-ask

让 Pi 的 `ask_user_question` 等待回答时，向 herdr 上报 **question 等待状态**，而不是一直显示 `working`。

## 安装

需要 Pi 1.5.0（含 `Terminal.setProgramStatus`）、支持 OSC 7501 的 herdr，以及 `@juicesharp/rpiv-ask-user-question`（已验证 2.15.0）。Node.js >=22.19.0。

```bash
pi install /home/qser3ne/application/pi-extensions/pi-herdr-ask
```

然后在 Pi 中执行 `/reload`。本地路径安装直接加载源码，不复制文件；开发更新后再次 `/reload` 即可。

卸载：

```bash
pi remove /home/qser3ne/application/pi-extensions/pi-herdr-ask
```

再次 `/reload`。无需修改或删除 herdr 托管的 `herdr-agent-state.ts`。

## 行为

- 仅在 **TUI + stdout TTY + `HC_TERMINAL_ID`** 环境启用。
- 监听提问插件公开的 `rpiv:ask-user:blocked` 事件；并发问卷按 `toolCallId` 分别跟踪。
- 问卷等待时上报 `{ state: "blocked", app: "pi", kind: "question" }`。这是 herdr `ask` 提示对应的协议状态，不是 `state=ask`。
- 回答、Esc 取消、插件 finally 或工具执行结束后，恢复最新捕获的 Pi 原生状态；最后一个问卷结束前持续等待。
- 原生权限/认证等待优先，不覆盖 `blocked/auth` 等已有等待状态。
- 重载/会话关闭时退订并撤销状态覆盖。非 herdr、RPC、JSON、print 模式不输出控制序列。
- 不发送问题正文、选项、答案；不增加模型工具、常驻进程或轮询。普通选择/输入弹窗不在本扩展范围内。

扩展通过一个立即移除的零行 widget 工厂取得公开的 `tui.terminal`，可撤销地包装 `setProgramStatus`；由 Pi 完成 OSC 7501 编码和能力协商，尊重 `PI_PROGRAM_STATUS=0`。不修改 Pi/提问插件源码，也不读取终端私有状态。若安装后尚未捕获原生报告，以 `ctx.isIdle()` 初始化恢复状态。

## 开发与测试

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run typecheck
npm pack --dry-run
```

宿主包与实际提问插件只作为开发依赖，发布包不包含它们，也没有运行时 npm 依赖。`src/` 是唯一扩展入口所在目录；`test/fixtures/ask-driver.js` 不随包发布。

### 真实终端验收（不调用模型）

在本仓库运行：

```bash
herdr-core run --bg --no-notify --no-parent --name herdr-ask-qa \
  --cwd "$PWD" -- pi --offline --no-session -ne -ns -np -nc --no-mcp \
  -e ./src/index.ts -e ./test/fixtures/ask-driver.js

# 清掉调用者 ID，避免 hc 把 slash command 包成 <hc> 消息送给模型。
env -u HC_TERMINAL_ID herdr-core send herdr-ask-qa /herdr-ask-test
herdr-core get herdr-ask-qa --json
# 预期 status: {"app":"pi","kind":"question","state":"blocked"}

herdr-core keys herdr-ask-qa esc  # 也可用 enter 回答第一个选项
herdr-core get herdr-ask-qa --json
# 预期 status: {"app":"pi","state":"done"}

herdr-core keys herdr-ask-qa ctrl+d
herdr-core rm herdr-ask-qa
```

使用 `herdr-core events --terminal herdr-ask-qa --json` 可看到完整的
`working → blocked/question → working → done` 状态链。去掉 `-e ./src/index.ts` 可复现问卷打开后仍为 `working`。

协议状态、实际问卷回答/取消与 `/reload` 已验证，详见 [验收记录](docs/verification.md)。**Windows herdr 图形界面的 `ask` 文案仍需用户在自己的界面确认**；core JSON 中的 `blocked` 是正确协议值。

## 仓库布局

本目录是 `pi-extensions` 工作区内的独立本地 Git 子仓库，尚未配置远程或发布。父仓库暂不记录不可克隆的 submodule URL；创建远程后可再登记为正式子模块。
