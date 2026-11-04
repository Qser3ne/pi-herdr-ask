import assert from "node:assert/strict";
import { test } from "node:test";
import { formatProgramStatus } from "@earendil-works/pi-tui";
import { attachStatusBridge } from "../src/status-bridge.ts";

// Characterize the real host reporter's deduplication, which caused the bug:
// restoring by waiting for its next working report is not sufficient.
const { ProgramStatusReporter } = await import(new URL(
  "./modes/interactive/program-status-reporter.js",
  import.meta.resolve("@earendil-works/pi-coding-agent"),
).href);

test("real Pi reporter: question override survives native dedup and restores before final done", () => {
  const output: string[] = [];
  const terminal = { setProgramStatus: (status: Parameters<typeof formatProgramStatus>[0]) => {
    output.push(formatProgramStatus(status));
  } };
  const reporter = new ProgramStatusReporter(() => terminal, () => undefined);
  reporter.report();
  const bridge = attachStatusBridge(terminal, { state: "idle", app: "pi" });
  reporter.handleEvent({ type: "agent_start" });
  bridge.receive({ active: true, toolCallId: "a" });
  assert.equal(output.at(-1), "\x1b]7501;state=blocked:app=pi:kind=question\x1b\\");
  const count = output.length;
  reporter.handleEvent({ type: "message_end", message: { role: "assistant", stopReason: "toolUse" } });
  assert.equal(output.length, count, "Pi deduplicates the native working report");
  bridge.close("a");
  assert.equal(output.at(-1), "\x1b]7501;state=working:app=pi\x1b\\");
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.equal(output.at(-1), "\x1b]7501;state=done:app=pi\x1b\\");
  bridge.dispose();
});

test("real Pi reporter: another native dialog stays blocked after questionnaire closes", () => {
  const output: string[] = [];
  const terminal = { setProgramStatus: (status: Parameters<typeof formatProgramStatus>[0]) => {
    output.push(formatProgramStatus(status));
  } };
  const reporter = new ProgramStatusReporter(() => terminal, () => undefined);
  const bridge = attachStatusBridge(terminal, { state: "working", app: "pi" });
  reporter.handleEvent({ type: "agent_start" });
  bridge.receive({ active: true, toolCallId: "a" });
  reporter.setBlocked("login", { kind: "auth", message: "Login" });
  bridge.close("a");
  assert.equal(output.at(-1), "\x1b]7501;state=blocked:app=pi:kind=auth:msg=TG9naW4=\x1b\\");
  reporter.setBlocked("login", undefined);
  assert.equal(output.at(-1), "\x1b]7501;state=working:app=pi\x1b\\");
  bridge.dispose();
});
