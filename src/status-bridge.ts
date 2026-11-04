import type { ProgramStatus, Terminal } from "@earendil-works/pi-tui";

/** Own only the questionnaire override; Pi remains the source of normal status. */
export function attachStatusBridge(
  terminal: Pick<Terminal, "setProgramStatus">,
  initial: ProgramStatus,
) {
  const original = terminal.setProgramStatus;
  const pending = new Set<string>();
  let native = { ...initial };
  let disposed = false;

  const effective = (): ProgramStatus =>
    pending.size > 0 && native.state !== "blocked" && native.state !== "clear"
      ? { state: "blocked", app: "pi", kind: "question" }
      : { ...native };

  function wrapped(status: ProgramStatus): void {
    if (disposed) {
      original.call(terminal, status);
      return;
    }
    native = { ...status };
    if (status.state === "clear") pending.clear();
    original.call(terminal, pending.size > 0 ? effective() : status);
  }
  terminal.setProgramStatus = wrapped;

  function close(toolCallId: string): void {
    if (disposed || !pending.delete(toolCallId)) return;
    if (pending.size === 0) original.call(terminal, { ...native });
  }

  return {
    receive(data: unknown): void {
      if (disposed || typeof data !== "object" || data === null || Array.isArray(data)) return;
      const { active, toolCallId } = data as { active?: unknown; toolCallId?: unknown };
      if (typeof active !== "boolean" || typeof toolCallId !== "string" || !toolCallId.trim()) return;
      if (!active) {
        close(toolCallId);
        return;
      }
      const wasWaiting = pending.size > 0;
      pending.add(toolCallId);
      if (!wasWaiting) original.call(terminal, effective());
    },
    close,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const wasWaiting = pending.size > 0;
      pending.clear();
      // Do not remove another extension's subsequently installed wrapper.
      // If it still calls ours, the disposed wrapper is transparent.
      if (terminal.setProgramStatus === wrapped) terminal.setProgramStatus = original;
      if (wasWaiting) terminal.setProgramStatus({ ...native });
    },
  };
}
