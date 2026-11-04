// Manual real-host fixture. Load with pi -ne -e ./src/index.ts -e this-file.
// Runs the real questionnaire from a slash command: no model/network calls.
import { writeFileSync } from "node:fs";
import questionnaire from "@juicesharp/rpiv-ask-user-question";

export default function askDriver(pi) {
  let ask;
  let terminal;
  let sequence = 0;
  questionnaire({
    ...pi,
    registerTool(tool) {
      if (tool.name === "ask_user_question") ask = tool;
      pi.registerTool(tool);
    },
  });
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setWidget("herdr-ask-test:terminal", (tui) => {
      terminal = tui.terminal;
      return { render: () => [], invalidate() {} };
    });
    ctx.ui.setWidget("herdr-ask-test:terminal", undefined);
  });
  pi.registerCommand("herdr-ask-test", {
    description: "Open a real questionnaire without calling an LLM (test fixture)",
    handler: async (_args, ctx) => {
      terminal.setProgramStatus({ state: "working", app: "pi" });
      const result = await ask.execute(`herdr-qa-${++sequence}`, {
        questions: [{
          question: "herdr ask 状态验收：请选择或按 Esc 取消？",
          header: "herdr QA",
          options: [
            { label: "确认", description: "结束问卷并恢复工作状态" },
            { label: "继续测试", description: "另一条正常回答路径" },
          ],
        }],
      }, undefined, undefined, ctx);
      if (process.env.HERDR_ASK_TEST_RESULT) {
        writeFileSync(process.env.HERDR_ASK_TEST_RESULT, JSON.stringify(result, null, 2));
      }
      terminal.setProgramStatus({ state: "done", app: "pi" });
    },
  });
}
