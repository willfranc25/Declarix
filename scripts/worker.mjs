import { adminClient } from "../server/admin.js";
import { runOne, cleanupAbandoned } from "../server/worker.js";
const db = adminClient();
let running = true,
  ticks = 0;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
while (running) {
  try {
    if (ticks++ % 100 === 0) await cleanupAbandoned(db);
    const result = await runOne(db);
    if (result.worked) console.log(JSON.stringify(result));
  } catch {
    console.error(
      "Worker failed; will retry. Inspect server health and database connectivity.",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 8000));
}
