import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createEventBus, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProgramStatus } from "@earendil-works/pi-tui";
import extension from "../src/index.ts";

function environment(t: TestContext, tty = true, herdr = true) {
  const old = process.env.HC_TERMINAL_ID;
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  if (herdr) process.env.HC_TERMINAL_ID = "test-terminal";
  else delete process.env.HC_TERMINAL_ID;
  Object.defineProperty(process.stdout, "isTTY", { value: tty, configurable: true });
  t.after(() => {
    if (old === undefined) delete process.env.HC_TERMINAL_ID;
    else process.env.HC_TERMINAL_ID = old;
    if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdout, "isTTY");
  });
}

function host(mode = "tui", idle = false) {
  const reports: ProgramStatus[] = [];
  const terminal = { setProgramStatus(status: ProgramStatus) { reports.push(status); } };
  const original = terminal.setProgramStatus;
  const widgets = new Map<string, unknown>();
  const handlers = new Map<string, (event: Record<string, unknown>, ctx: ExtensionContext) => unknown>();
  const events = createEventBus();
  let mounts = 0;
  const ctx = {
    mode, hasUI: mode === "tui" || mode === "rpc", isIdle: () => idle,
    sessionManager: { getSessionName: () => "test session" },
    ui: {
      setWidget(key: string, factory: undefined | ((tui: unknown) => unknown)) {
        if (factory) {
          mounts++;
          widgets.set(key, factory({ terminal }));
        } else widgets.delete(key);
      },
    },
  } as unknown as ExtensionContext;
  const pi = {
    events,
    on(name: string, handler: (event: Record<string, unknown>, ctx: ExtensionContext) => unknown) {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
  } as unknown as ExtensionAPI;
  extension(pi);
  const fire = async (name: string, event: Record<string, unknown> = {}) => handlers.get(name)?.(event, ctx);
  const wait = (active: boolean, toolCallId = "a") => events.emit("rpiv:ask-user:blocked", { active, toolCallId });
  return { reports, terminal, original, widgets, fire, wait, events, mounts: () => mounts };
}

test("extension has no factory side effects and leaves no widget behind", async (t) => {
  environment(t);
  const h = host();
  assert.equal(h.terminal.setProgramStatus, h.original);
  h.wait(true);
  assert.deepEqual(h.reports, []);
  await h.fire("session_start");
  assert.equal(h.mounts(), 1);
  assert.equal(h.widgets.size, 0);
  h.wait(true);
  assert.deepEqual(h.reports.at(-1), { state: "blocked", app: "pi", kind: "question" });
  h.wait(false);
  assert.deepEqual(h.reports.at(-1), { state: "working", app: "pi", message: "test session" });
  await h.fire("session_shutdown");
});

for (const config of [
  { mode: "rpc", tty: true, herdr: true },
  { mode: "json", tty: true, herdr: true },
  { mode: "print", tty: true, herdr: true },
  { mode: "tui", tty: false, herdr: true },
  { mode: "tui", tty: true, herdr: false },
]) {
  test(`no bridge or output in ${JSON.stringify(config)}`, async (t) => {
    environment(t, config.tty, config.herdr);
    const h = host(config.mode);
    await h.fire("session_start");
    h.wait(true);
    h.wait(false);
    await h.fire("session_shutdown");
    assert.equal(h.mounts(), 0);
    assert.equal(h.terminal.setProgramStatus, h.original);
    assert.deepEqual(h.reports, []);
  });
}

test("unrelated UI does not enter ask; idle questionnaire restores idle", async (t) => {
  environment(t);
  const h = host("tui", true);
  await h.fire("session_start");
  await h.fire("ui_prompt_start", { kind: "custom" });
  await h.fire("ui_prompt_end", { kind: "custom" });
  h.events.emit("herdr:blocked", { active: true });
  assert.deepEqual(h.reports, []);
  h.wait(true);
  h.wait(false);
  assert.deepEqual(h.reports, [
    { state: "blocked", app: "pi", kind: "question" },
    { state: "idle", app: "pi" },
  ]);
  await h.fire("session_shutdown");
});

test("tool completion closes only its questionnaire, even on error", async (t) => {
  environment(t);
  const h = host();
  await h.fire("session_start");
  h.wait(true, "a");
  h.wait(true, "b");
  await h.fire("tool_execution_end", { toolCallId: "unrelated", toolName: "bash", isError: false });
  await h.fire("tool_execution_end", { toolCallId: "a", toolName: "ask_user_question", isError: true });
  assert.equal(h.reports.at(-1)?.state, "blocked");
  await h.fire("tool_execution_end", { toolCallId: "b", toolName: "ask_user_question", isError: false });
  assert.equal(h.reports.at(-1)?.state, "working");
  await h.fire("session_shutdown");
});

test("shutdown restores terminal, unsubscribes, and reload does not duplicate listeners", async (t) => {
  environment(t);
  const h = host();
  await h.fire("session_start");
  h.wait(true);
  await h.fire("session_shutdown");
  assert.equal(h.terminal.setProgramStatus, h.original);
  const count = h.reports.length;
  h.wait(true, "late");
  assert.equal(h.reports.length, count);
  await h.fire("session_start");
  h.wait(true, "new");
  h.wait(false, "new");
  assert.equal(h.reports.length, count + 2);
  await h.fire("session_shutdown");
});
