# pi-herdr-ask

让 Pi 的 `ask_user_question` 等待回答时，向 herdr 上报 **question 等待状态**，而不是一直显示 `working`。

## 安装

需要 Pi 1.5.0（含 `Terminal.setProgramStatus`）、支持 OSC 7501 的 herdr，以及 `@juicesharp/rpiv-ask-user-question`（已验证 2.15.0）。Node.js >=22.19.0。

```bash
pi install git:github.com/Qser3ne/pi-herdr-ask
```

然后在 Pi 中执行 `/reload`。Git 安装副本与开发目录独立；开发代码推送后，需要更新安装提交才能生效。建议固定审核过的提交：

```bash
commit=$(git rev-parse HEAD) || exit 1
pi install "git:github.com/Qser3ne/pi-herdr-ask@$commit"
```

在本仓库运行上述命令前，先确保该提交已推送到远程。

卸载：

```bash
pi list
pi remove <列表中完整的pi-herdr-ask来源>
```

再次 `/reload`。无需修改或删除 herdr 托管的 `herdr-agent-state.ts`。

## 行为档案

`docs/archive/` 是当前行为的唯一档案位置。[herdr-question-status](docs/archive/herdr-question-status/archive.md) 定义启用条件、问卷事件、并发等待、原生状态优先级、恢复与清理边界。

档案位于源码仓库；本 README 保留安装和验收操作，不重复定义状态协议。

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

独立公开仓库：[Qser3ne/pi-herdr-ask](https://github.com/Qser3ne/pi-herdr-ask)。同时作为 [pi-extensions](https://github.com/Qser3ne/pi-extensions) 的 Git 子模块维护。

发布顺序：先推送本仓库提交，再提交和推送父仓库的子模块指针，最后用固定提交更新 Pi 安装。
