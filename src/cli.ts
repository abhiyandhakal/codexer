#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "node:child_process";

const program = new Command();

program
  .name("codexer")
  .description("Wrapper CLI for Codex session management")
  .showHelpAfterError();

program
  .command("resume")
  .description("Show Codex sessions")
  .action(async () => {
    const code = await runCodex(["resume"]);
    process.exitCode = code;
  });

program
  .command("rename")
  .description("Rename a Codex session in the local index")
  .argument("<sessionId>", "Codex session ID")
  .argument("<name...>", "New display name")
  .action((sessionId: string, nameParts: string[]) => {
    const name = nameParts.join(" ");
    console.error(
      `Not implemented: rename ${sessionId} -> ${JSON.stringify(name)}`
    );
    process.exitCode = 1;
  });

program.parse();

function runCodex(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("codex", args, { stdio: "inherit" });
    child.on("error", (err) => {
      console.error(`Failed to run codex: ${err.message}`);
      resolve(1);
    });
    child.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });
}
