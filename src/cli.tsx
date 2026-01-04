#!/usr/bin/env node

import { Command } from "commander";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import {
  filterSessionsByCwd,
  listSessions,
  loadSessionNames,
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
  .command("list")
  .description("List sessions scoped to the current repo or directory")
  .option("--all", "Include sessions from all directories")
  .option("--limit <count>", "Limit number of sessions", parseCount)
  .action(async (options: { all?: boolean; limit?: number }) => {
    const scope = await resolveScope();
    const sessions = await listSessions();
    const scoped = options.all ? sessions : filterSessionsByCwd(sessions, scope);
    const names = await loadSessionNames();

    const limited = typeof options.limit === "number" ? scoped.slice(0, options.limit) : scoped;
    if (limited.length === 0) {
      console.log("No sessions found.");
      return;
    }

    for (const session of limited) {
      const displayName = names[session.id]?.name ?? session.title ?? "unnamed";
      const time = session.timestamp ? new Date(session.timestamp).toISOString() : "";
      const cwd = session.cwd ? ` ${session.cwd}` : "";
      const name = displayName ? ` ${displayName}` : "";
      console.log(`${time} ${session.id}${name}${cwd}`);
    }
  });

program
  .command("rename")
  .description("Rename a Codex session in the local index")
  .argument("<sessionId>", "Codex session ID")
  .argument("<name...>", "New display name")
  .action(async (sessionId: string, nameParts: string[]) => {
    const name = nameParts.join(" ");
    await saveSessionName(sessionId, name);
    console.log(`Renamed ${sessionId} to ${JSON.stringify(name)}`);
  });

program
  .command("resume")
  .description("Resume the latest session for this repo or directory")
  .option("--all", "Include sessions from all directories")
  .argument("[sessionId]", "Codex session ID")
  .argument("[prompt...]", "Optional prompt")
  .action(
    async (
      sessionId: string | undefined,
      promptParts: string[],
      options: { all?: boolean }
    ) => {
      const prompt = promptParts?.length ? promptParts.join(" ") : undefined;
      if (!sessionId) {
        const scope = await resolveScope();
        const sessions = await listSessions();
        const scoped = options.all
          ? sessions
          : filterSessionsByCwd(sessions, scope);
        const latest = scoped[0];
        if (latest?.id) {
          await resumeWithSession(latest, prompt);
          return;
        }
      }

      const args = ["resume"];
      if (sessionId) {
        args.push(sessionId);
      }
      if (prompt) {
        args.push(prompt);
      }
      const code = await runCodex(args);
      process.exitCode = code;
    }
  );

program.action(async () => {
  const scope = await resolveScope();
  const sessions = await listSessions();
  const scoped = filterSessionsByCwd(sessions, scope);
  const names = await loadSessionNames();
  const action = await runTui(scoped, names);

  if (action.type === "rename") {
    await saveSessionName(action.session.id, action.name);
    console.log(
      `Renamed ${action.session.id} to ${JSON.stringify(action.name)}`
    );
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

function parseCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error("limit must be a positive integer");
  }
  return parsed;
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
  session: SessionMeta,
  prompt?: string
): Promise<void> {
  const args = ["resume", session.id];
  if (prompt) {
    args.push(prompt);
  }
  const code = await runCodex(args);
  process.exitCode = code;
}
