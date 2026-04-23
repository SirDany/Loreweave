import { linearize, loadSaga, BUILTIN_GREGORIAN } from "@loreweave/core";
import pc from "picocolors";

export async function threadCmd(
  saga: string,
  threadId: string,
  opts: {
    linear?: boolean;
    withBranches?: boolean;
    tome?: string;
    json?: boolean;
  },
): Promise<void> {
  const loaded = await loadSaga(saga);
  const calendars = [BUILTIN_GREGORIAN, ...loaded.calendars];
  const result = linearize(threadId, loaded.threads, calendars, {
    includeBranches: opts.withBranches ?? false,
    tome: opts.tome ?? null,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const issue of result.issues) {
    console.log(
      `${pc.red("issue")} ${pc.dim("[" + issue.kind + "]")}  ${issue.message}`,
    );
  }
  console.log(pc.bold(`thread/${threadId}`));
  for (const wp of result.waypoints) {
    const date = wp.at ? pc.yellow(wp.at) : pc.dim("(relational)");
    const tomes = wp.appears_in?.length ? pc.dim(" [" + wp.appears_in.join(",") + "]") : "";
    console.log(`  ${String(wp.order + 1).padStart(3)}. ${pc.cyan(wp.id)}  ${date}  → ${wp.event}${tomes}`);
  }
  if (result.issues.length) process.exit(1);
}
