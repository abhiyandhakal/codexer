#!/usr/bin/env node

import { Command } from "commander";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import {
  filterSessionsByCwd,
  listSessions,
  loadSessionNames,
  deleteSessionFile,
  deleteSessionName,
  saveSessionName,
  type SessionMeta,
} from "./sessions.js";
import { runTui } from "./tui.js";

const program = new Command();

program
  .name("codexer")
  .description("Wrapper CLI for Codex session management in this repo or folder")
  .showHelpAfterError();

program
  .command("new")
  .description("Start a new Codex session")
  .argument("[prompt...]", "Optional prompt")
  .action(async (promptParts: string[]) => {
    const prompt = promptParts?.length ? promptParts.join(" ") : undefined;
    const args = prompt ? [prompt] : [];
    const code = await runCodex(args);
    process.exitCode = code;
  });

program.action(async () => {
  const scope = await resolveScope();
  const sessions = await listSessions();
  const scoped = filterSessionsByCwd(sessions, scope);
  const names = await loadSessionNames();
  const action = await runTui(scoped, names, scope);

  if (action.type === "rename") {
    await saveSessionName(action.session.id, action.name);
    console.log(
      `Renamed ${action.session.id} to ${JSON.stringify(action.name)}`
    );
    return;
  }

  if (action.type === "delete") {
    try {
      await deleteSessionFile(action.session.file);
      await deleteSessionName(action.session.id);
      console.log(`Deleted session ${action.session.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to delete session: ${message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (action.type === "new") {
    const args = action.prompt ? [action.prompt] : [];
    const code = await runCodex(args);
    process.exitCode = code;
    return;
  }

  if (action.type === "resume") {
    await resumeWithSession(action.session, undefined);
    return;
  }
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

async function resolveScope(): Promise<string> {
  const gitRoot = detectGitRoot();
  return gitRoot ?? process.cwd();
}

function detectGitRoot(): string | null {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return null;
  }
  const root = result.stdout.toString("utf8").trim();
  return root ? path.resolve(root) : null;
}

async function resumeWithSession(
  session: SessionMeta
): Promise<void> {
  const args = ["resume", session.id];
  const code = await runCodex(args);
  process.exitCode = code;
}
