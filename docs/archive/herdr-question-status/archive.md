# herdr-question-status

## Purpose

定义 Pi 问卷等待回答期间向 herdr 报告的 question 状态，以及等待结束后的原生状态恢复。

## Requirements

### Requirement: 启用环境

本扩展 SHALL 仅在 TUI、stdout 为 TTY、HC_TERMINAL_ID 非空且宿主提供 Terminal.setProgramStatus 时启用；MUST 不在普通终端、RPC、JSON 或 print 模式增加状态控制序列。

#### Scenario: 不满足启用条件

- **WHEN** 加载扩展但缺少任一启用条件
- **THEN** SHALL 不订阅问卷等待事件，不输出额外终端状态
- **AND** 扩展 SHALL 不增加模型工具、常驻进程或周期轮询

### Requirement: 公开问卷事件

本扩展 SHALL 接收 rpiv:ask-user:blocked 事件，只接受 active 为布尔值且 toolCallId 为非空字符串的对象；MUST 不将普通输入或选择对话框当作问卷。

#### Scenario: 问卷进入等待

- **WHEN** 有效事件的 active=true
- **THEN** SHALL 按 toolCallId 记录等待，并报告 state=blocked、app=pi、kind=question
- **AND** 不发送问题正文、选项或答案；协议状态 MUST 不写成 state=ask

#### Scenario: 重复或无效事件

- **WHEN** 同一 toolCallId 重复进入等待，或收到无效载荷
- **THEN** SHALL 不重复增加该问卷的等待数，无效载荷不得创建或清除等待
- **AND** 未知 toolCallId 的关闭事件 SHALL 不关闭其他问卷

### Requirement: 并发等待与原生优先级

多个问卷 SHALL 分别跟踪；只要仍有问卷等待且原生状态不为 blocked 或 clear，question 覆盖 SHALL 保持生效。原生权限、认证等 blocked 状态 MUST 优先于本扩展。

#### Scenario: 原生权限等待与问卷重叠

- **WHEN** 问卷尚未结束而 Pi 报告 blocked/auth 或 blocked/permission
- **THEN** SHALL 原样保留该原生等待，不改写为 question
- **AND** 原生 clear SHALL 清空问卷等待，之后不得继承旧 question 状态

### Requirement: 结束后恢复最新状态

active=false 或 tool_execution_end SHALL 关闭对应 toolCallId 的等待；最后一个问卷关闭时 MUST 恢复最新捕获的 Pi 原生状态，不固定恢复为 working、idle 或 done。

#### Scenario: 回答、取消或执行异常

- **WHEN** 用户回答、Esc 取消，或问卷工具结束
- **THEN** SHALL 清除对应等待，其他问卷存在时继续等待
- **AND** 最后一个等待结束 SHALL 恢复问卷期间捕获的最新原生报告
- **AND** 尚未捕获原生报告时 SHALL 按接入时 ctx.isIdle() 初始化为 idle 或 working，不读取终端私有缓存

### Requirement: 清理与包装共存

会话关闭、替换或重载 SHALL 退订并撤销本扩展的状态覆盖；MUST 不移除其他扩展后来安装的状态包装，也不残留可见 widget。

#### Scenario: 清理后有迟到事件

- **WHEN** 扩展已清理而旧事件或旧包装仍被调用
- **THEN** SHALL 不重新创建问卷等待或覆盖新会话状态
- **AND** 后装包装 SHALL 继续存在，已撤销包装仅透明转发原生调用

### Requirement: 宿主状态协议与兼容边界

终端状态编码和能力协商 SHALL 由 Pi 完成，并遵守 PI_PROGRAM_STATUS=0；本扩展 MUST 不修改 Pi、问卷插件或 herdr 托管脚本。

#### Scenario: herdr 显示等待

- **WHEN** herdr 接收到 blocked/question 协议状态
- **THEN** 本扩展 SHALL 仅承诺所发送的协议状态，不把它当作特定 GUI 文案或截图已验证的保证
- **AND** 兼容性基线 SHALL 为 Pi 1.5.0、问卷插件 2.15.0、Node.js >=22.19.0
