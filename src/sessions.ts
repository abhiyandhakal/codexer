import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type SessionMeta = {
  id: string;
  timestamp: string;
  cwd: string;
  file: string;
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
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
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
    const line = await readFirstLine(file);
    if (!line) {
      return null;
    }
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

    return {
      id: parsed.payload.id,
      timestamp: parsed.payload.timestamp ?? "",
      cwd: parsed.payload.cwd ?? "",
      git: parsed.payload.git ?? null,
      file,
    };
  } catch {
    return null;
  }
}

async function readFirstLine(file: string): Promise<string> {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const chunk = buffer.slice(0, bytesRead).toString("utf8");
    const newlineIndex = chunk.indexOf("\n");
    if (newlineIndex === -1) {
      return chunk.trim();
    }
    return chunk.slice(0, newlineIndex).trim();
  } finally {
    await handle.close();
  }
}
