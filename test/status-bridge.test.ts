import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProgramStatus } from "@earendil-works/pi-tui";
import { attachStatusBridge } from "../src/status-bridge.ts";

const working: ProgramStatus = { state: "working", app: "pi", message: "session" };
const ask: ProgramStatus = { state: "blocked", app: "pi", kind: "question" };

function setup(initial: ProgramStatus = working) {
  const reports: ProgramStatus[] = [];
  const terminal = { setProgramStatus(status: ProgramStatus) { reports.push({ ...status }); } };
  const original = terminal.setProgramStatus;
  const bridge = attachStatusBridge(terminal, initial);
  return { reports, terminal, original, bridge };
}

test("waiting reports question without content, then restores working", () => {
  const { reports, bridge } = setup();
  assert.deepEqual(reports, []);
  bridge.receive({ active: true, toolCallId: "a", questions: ["secret"] });
  assert.deepEqual(reports, [ask]);
  bridge.receive({ active: false, toolCallId: "a" });
  assert.deepEqual(reports, [ask, working]);
  bridge.dispose();
});

test("overlapping questions remain blocked until every distinct call ends", () => {
  const { reports, bridge } = setup();
  for (const toolCallId of ["a", "a", "b"]) bridge.receive({ active: true, toolCallId });
  bridge.close("unknown");
  bridge.close("a");
  bridge.close("a");
  assert.deepEqual(reports, [ask]);
  bridge.close("b");
  bridge.close("b");
  assert.deepEqual(reports, [ask, working]);
  bridge.dispose();
});

test("malformed bus payloads neither create nor clear a wait", () => {
  const { reports, bridge } = setup();
  const bad = [null, undefined, [], true, "question", {}, { active: 1, toolCallId: "a" },
    { active: true }, { active: true, toolCallId: "" }, { active: true, toolCallId: " " },
    { active: "false", toolCallId: "a" }, { active: false, toolCallId: 3 }];
  for (const payload of bad) bridge.receive(payload);
  assert.deepEqual(reports, []);
  bridge.receive({ active: true, toolCallId: "a" });
  for (const payload of bad) bridge.receive(payload);
  assert.deepEqual(reports, [ask]);
  bridge.dispose();
});

for (const native of [
  { state: "done", app: "pi", message: "finished" },
  { state: "error", app: "pi", message: "failure" },
  { state: "idle", app: "pi" },
  { state: "working", app: "pi", message: "Compacting context" },
] satisfies ProgramStatus[]) {
  test(`restores latest native ${native.state} instead of pre-question working`, () => {
    const { reports, bridge, terminal } = setup();
    bridge.receive({ active: true, toolCallId: "a" });
    terminal.setProgramStatus(native);
    assert.deepEqual(reports.at(-1), ask);
    bridge.close("a");
    assert.deepEqual(reports.at(-1), native);
    bridge.dispose();
  });
}

test("native permission/auth blocking takes precedence and is preserved", () => {
  const { reports, bridge, terminal } = setup();
  bridge.receive({ active: true, toolCallId: "a" });
  const auth: ProgramStatus = { state: "blocked", app: "pi", kind: "auth", message: "Login" };
  terminal.setProgramStatus(auth);
  assert.deepEqual(reports.at(-1), auth);
  terminal.setProgramStatus(working);
  assert.deepEqual(reports.at(-1), ask);
  terminal.setProgramStatus(auth);
  bridge.close("a");
  assert.deepEqual(reports.at(-1), auth);
  bridge.dispose();
});

test("clear forwards and removes waits so a later start cannot inherit ask", () => {
  const { reports, bridge, terminal } = setup();
  bridge.receive({ active: true, toolCallId: "a" });
  terminal.setProgramStatus({ state: "clear" });
  assert.deepEqual(reports.at(-1), { state: "clear" });
  terminal.setProgramStatus(working);
  bridge.close("a");
  assert.deepEqual(reports.at(-1), working);
  bridge.dispose();
});

test("disposal restores native status and exact method once, ignoring late events", () => {
  const { reports, bridge, terminal, original } = setup();
  bridge.receive({ active: true, toolCallId: "a" });
  bridge.dispose();
  assert.equal(terminal.setProgramStatus, original);
  assert.deepEqual(reports, [ask, working]);
  bridge.dispose();
  bridge.receive({ active: true, toolCallId: "late" });
  bridge.close("a");
  assert.deepEqual(reports, [ask, working]);
});

test("disposal leaves a later extension's wrapper installed and our wrapper inert", () => {
  const { reports, bridge, terminal } = setup();
  const wrapped = terminal.setProgramStatus;
  const later = (status: ProgramStatus) => wrapped.call(terminal, { ...status, message: "later" });
  terminal.setProgramStatus = later;
  bridge.receive({ active: true, toolCallId: "a" });
  bridge.dispose();
  assert.equal(terminal.setProgramStatus, later);
  terminal.setProgramStatus({ state: "done", app: "pi" });
  assert.deepEqual(reports.at(-1), { state: "done", app: "pi", message: "later" });
});

test("native calls retain receiver and are forwarded untouched when not waiting", () => {
  const reports: ProgramStatus[] = [];
  const terminal = {
    setProgramStatus(status: ProgramStatus) {
      assert.equal(this, terminal);
      reports.push(status);
    },
  };
  const bridge = attachStatusBridge(terminal, working);
  terminal.setProgramStatus(working);
  assert.equal(reports[0], working);
  bridge.receive({ active: true, toolCallId: "a" });
  bridge.close("a");
  bridge.dispose();
});
