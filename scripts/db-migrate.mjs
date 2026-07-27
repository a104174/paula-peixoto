import { withD1Config, runWrangler, targetFlags } from "./d1-command.mjs";

await withD1Config(async ({ configPath, databaseName }) => {
  await runWrangler([
    "d1",
    "migrations",
    "apply",
    databaseName,
    "--config",
    configPath,
    ...targetFlags(),
  ]);
});
