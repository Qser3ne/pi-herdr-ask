import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { attachStatusBridge } from "./status-bridge.ts";

const WIDGET_KEY = "pi-herdr-ask:terminal";

export default function herdrAsk(pi: ExtensionAPI): void {
  let bridge: ReturnType<typeof attachStatusBridge> | undefined;
  let unsubscribe: (() => void) | undefined;

  function cleanup(): void {
    unsubscribe?.();
    unsubscribe = undefined;
    bridge?.dispose();
    bridge = undefined;
  }

  pi.on("session_start", (_event, ctx) => {
    cleanup();
    if (ctx.mode !== "tui" || !process.stdout.isTTY || !process.env.HC_TERMINAL_ID?.trim()) return;

    // Widget factories expose the public TUI/Terminal. Mount zero lines only
    // long enough to obtain it, then remove the widget before the next render.
    try {
      ctx.ui.setWidget(WIDGET_KEY, (tui) => {
        if (typeof tui.terminal.setProgramStatus === "function") {
          bridge = attachStatusBridge(tui.terminal, ctx.isIdle()
            ? { state: "idle", app: "pi" }
            : { state: "working", app: "pi", message: ctx.sessionManager.getSessionName() });
        }
        return { render: () => [], invalidate() {} };
      });
    } finally {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
    if (bridge) unsubscribe = pi.events.on("rpiv:ask-user:blocked", (data) => bridge?.receive(data));
  });

  // The plugin sends its normal completion in finally. This is an extra
  // per-call safety net for failed/aborted tool executions, not a global reset.
  pi.on("tool_execution_end", (event) => bridge?.close(event.toolCallId));
  pi.on("session_shutdown", cleanup);
}
