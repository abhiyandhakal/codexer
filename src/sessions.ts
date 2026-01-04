import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type SessionMeta = {
  id: string;
  timestamp: string;
  lastModified: string;
  cwd: string;
  file: string;
  title?: string;
  git?: {
    repository_url?: string | null;
    branch?: string | null;
    commit_hash?: string | null;
  } | null;
};

export type SessionNameIndex = Record<string, { name: string; updatedAt: string }>;

const CODEX_DIR = path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_DIR, "sessions");
const CODEXER_DIR = path.join(os.homedir(), ".codexer");
const NAMES_FILE = path.join(CODEXER_DIR, "session-names.json");

export async function listSessions(): Promise<SessionMeta[]> {
  const files = await listSessionFiles(SESSIONS_DIR);
  const sessions: SessionMeta[] = [];

  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (meta) {
      sessions.push(meta);
    }
  }

  sessions.sort((a, b) => {
    return (
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  });

  return sessions;
}

export async function loadSessionNames(): Promise<SessionNameIndex> {
  try {
    const raw = await fs.readFile(NAMES_FILE, "utf8");
    const parsed = JSON.parse(raw) as SessionNameIndex;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function saveSessionName(
  id: string,
  name: string
): Promise<void> {
  const existing = await loadSessionNames();
  const next: SessionNameIndex = {
    ...existing,
    [id]: { name, updatedAt: new Date().toISOString() },
  };

  await fs.mkdir(CODEXER_DIR, { recursive: true });
  await fs.writeFile(NAMES_FILE, JSON.stringify(next, null, 2));
}

export async function deleteSessionName(id: string): Promise<boolean> {
  const existing = await loadSessionNames();
  if (!existing[id]) {
    return false;
  }
  const next: SessionNameIndex = { ...existing };
  delete next[id];
  await fs.mkdir(CODEXER_DIR, { recursive: true });
  await fs.writeFile(NAMES_FILE, JSON.stringify(next, null, 2));
  return true;
}

export async function deleteSessionFile(file: string): Promise<void> {
  await fs.unlink(file);
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === "") {
    return true;
  }
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function filterSessionsByCwd(
  sessions: SessionMeta[],
  cwd: string
): SessionMeta[] {
  const scope = path.resolve(cwd);
  return sessions.filter((session) => {
    if (!session.cwd) {
      return false;
    }
    const sessionCwd = path.resolve(session.cwd);
    return isWithin(scope, sessionCwd);
  });
}

async function listSessionFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listSessionFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function readSessionMeta(file: string): Promise<SessionMeta | null> {
  try {
    const lines = await readFirstLines(file, 65536);
    const line = lines[0];
    if (!line) {
      return null;
    }
    const stats = await fs.stat(file);
    const lastModified = stats.mtime.toISOString();
    const parsed = JSON.parse(line) as {
      type?: string;
      payload?: {
        id?: string;
        timestamp?: string;
        cwd?: string;
        git?: {
          repository_url?: string | null;
          branch?: string | null;
          commit_hash?: string | null;
        } | null;
      };
    };

    if (parsed.type !== "session_meta" || !parsed.payload?.id) {
      return null;
    }

    const title = extractTitle(lines);

    return {
      id: parsed.payload.id,
      timestamp: parsed.payload.timestamp ?? "",
      lastModified,
      cwd: parsed.payload.cwd ?? "",
      git: parsed.payload.git ?? null,
      file,
      title,
    };
  } catch {
    return null;
  }
}

async function readFirstLines(file: string, maxBytes: number): Promise<string[]> {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const chunk = buffer.slice(0, bytesRead).toString("utf8");
    return chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } finally {
    await handle.close();
  }
}

function extractTitle(lines: string[]): string | undefined {
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        payload?: {
          type?: string;
          role?: string;
          content?: Array<{ type?: string; text?: string }>;
        };
      };
      if (
        parsed.type !== "response_item" ||
        parsed.payload?.type !== "message" ||
        parsed.payload?.role !== "user"
      ) {
        continue;
      }

      const text = parsed.payload?.content
        ?.filter((item) => item.type === "input_text")
        .map((item) => item.text ?? "")
        .join(" ")
        .trim();

      if (!text) {
        continue;
      }

      if (isIgnorablePrompt(text)) {
        continue;
      }

      return truncateTitle(normalizeWhitespace(text), 60);
    } catch {
      continue;
    }
  }

  return undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateTitle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function isIgnorablePrompt(text: string): boolean {
  const normalized = text.trim();
  if (normalized.includes("<environment_context>")) {
    return true;
  }
  if (normalized.includes("AGENTS.md") || normalized.includes("<INSTRUCTIONS>")) {
    return true;
  }
  if (normalized.includes("## Skills") || normalized.includes("These skills are discovered")) {
    return true;
  }
  return false;
}
