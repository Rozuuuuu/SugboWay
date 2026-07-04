// UserPromptSubmit hook: append each user prompt to the project's memory log so
// there's a durable backup of the conversation that survives /clear.
// Reads the hook payload (JSON) from stdin; appends "{timestamp}\n{prompt}" to the log.
import fs from "node:fs";

const LOG_PATH =
  "C:\\Users\\Lloyd\\.claude\\projects\\C--Users-Lloyd-OneDrive-Desktop-SugboWay\\memory\\sugboway-conversation-log.md";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const prompt = String(data.prompt ?? "").trim();
    if (prompt) {
      const ts = new Date().toISOString();
      fs.appendFileSync(LOG_PATH, `\n### ${ts}\n${prompt}\n`, "utf8");
    }
  } catch {
    // Never block or fail the prompt on a logging error.
  }
  process.exit(0);
});
