import React, { useEffect, useMemo, useState } from "react";
import path from "node:path";
import { Box, Text, useApp, useInput, render } from "ink";
import SelectInput, { type Item } from "ink-select-input";
import TextInput from "ink-text-input";
import type { SessionMeta, SessionNameIndex } from "./sessions.js";

export type TuiAction =
  | { type: "resume"; session: SessionMeta }
  | { type: "rename"; session: SessionMeta; name: string }
  | { type: "delete"; session: SessionMeta }
  | { type: "exit" };

type AppProps = {
  sessions: SessionMeta[];
  names: SessionNameIndex;
  scope: string;
  onResolve: (action: TuiAction) => void;
};

type View = "sessions" | "rename" | "delete";

type SessionItem = Item<SessionMeta>;

export async function runTui(
  sessions: SessionMeta[],
  names: SessionNameIndex,
  scope: string
): Promise<TuiAction> {
  return new Promise((resolve) => {
    const instance = render(
      <App sessions={sessions} names={names} scope={scope} onResolve={resolve} />
    );
    instance.waitUntilExit().catch(() => {
      resolve({ type: "exit" });
    });
  });
}

function App({ sessions, names, scope, onResolve }: AppProps): JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState<View>("sessions");
  const [selected, setSelected] = useState<SessionMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sessionItems = useMemo<SessionItem[]>(() => {
    const rows = sessions.map((session) =>
      formatSessionRow(session, names, scope)
    );
    const widths = computeColumnWidths(rows);
    return sessions.map((session, index) => ({
      label: formatRow(rows[index], widths),
      value: session,
      key: session.id,
    }));
  }, [sessions, names, scope]);

  useEffect(() => {
    if (!selected && sessions.length > 0) {
      setSelected(sessions[0]);
    }
  }, [selected, sessions]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onResolve({ type: "exit" });
      exit();
    }
    if (!selected || view !== "sessions") {
      return;
    }
    if (key.ctrl && input === "r") {
      setRenameValue(names[selected.id]?.name ?? selected.title ?? "");
      setView("rename");
    }
    if (key.ctrl && input === "d") {
      setView("delete");
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column">
        <Text>No sessions found.</Text>
        <Text dimColor>Press q or esc to exit.</Text>
      </Box>
    );
  }

  if (view === "rename" && selected) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Rename session {selected.id}</Text>
        <TextInput
          value={renameValue}
          onChange={setRenameValue}
          onSubmit={(value) => {
            onResolve({ type: "rename", session: selected, name: value });
            exit();
          }}
          placeholder="Enter a new name"
        />
        <Text dimColor>Press enter to save, q/esc to exit.</Text>
      </Box>
    );
  }

  if (view === "delete" && selected) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Delete session {selected.id}?</Text>
        <Text>{formatRow(formatSessionRow(selected, names, scope), undefined)}</Text>
        <DeleteConfirmation
          onConfirm={() => {
            onResolve({ type: "delete", session: selected });
            exit();
          }}
          onCancel={() => {
            setView("sessions");
          }}
        />
        <Text dimColor>Press y to confirm, n to cancel.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>Select a Codex session</Text>
      <SelectInput
        items={sessionItems}
        onHighlight={(item) => {
          setSelected(item.value);
        }}
        onSelect={(item) => {
          onResolve({ type: "resume", session: item.value });
          exit();
        }}
      />
      <Text dimColor>
        Use arrows + enter. Ctrl+r rename, ctrl+d delete, q/esc exit.
      </Text>
    </Box>
  );
}

function DeleteConfirmation({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  useInput((input) => {
    if (input === "y" || input === "Y") {
      onConfirm();
    }
    if (input === "n" || input === "N") {
      onCancel();
    }
  });
  return <Text dimColor>Waiting for input...</Text>;
}

type SessionRow = {
  time: string;
  id: string;
  nameTitle: string;
  cwd: string;
};

function formatSessionRow(
  session: SessionMeta,
  names: SessionNameIndex,
  scope: string
): SessionRow {
  const nameTitle = formatNameTitle(session, names);
  return {
    time: formatRelativeTime(session.lastModified),
    id: session.id,
    nameTitle,
    cwd: formatPath(session.cwd ?? "", scope),
  };
}

function formatRelativeTime(timestamp: string | undefined): string {
  if (!timestamp) {
    return "unknown";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "just now";
  }
  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `${mins}m ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    const mins = Math.floor((diffMs % hour) / minute);
    if (hours === 1 && mins === 0) {
      return "1h ago";
    }
    if (mins === 0) {
      return `${hours}h ago`;
    }
    return `${hours}h ${mins}m ago`;
  }
  const days = Math.floor(diffMs / day);
  const hours = Math.floor((diffMs % day) / hour);
  if (hours === 0) {
    return `${days}d ago`;
  }
  return `${days}d ${hours}h ago`;
}

function computeColumnWidths(rows: SessionRow[]): Record<keyof SessionRow, number> {
  return rows.reduce(
    (acc, row) => {
      acc.time = Math.max(acc.time, row.time.length);
      acc.id = Math.max(acc.id, row.id.length);
      acc.nameTitle = Math.max(acc.nameTitle, row.nameTitle.length);
      acc.cwd = Math.max(acc.cwd, row.cwd.length);
      return acc;
    },
    { time: 0, id: 0, nameTitle: 0, cwd: 0 }
  );
}

function formatRow(
  row: SessionRow,
  widths?: Record<keyof SessionRow, number>
): string {
  if (!widths) {
    return `${row.time} ${row.id} ${row.nameTitle} ${row.cwd}`.trimEnd();
  }
  const time = row.time.padEnd(widths.time);
  const id = row.id.padEnd(widths.id);
  const nameTitle = row.nameTitle.padEnd(widths.nameTitle);
  return `${time}  ${id}  ${nameTitle}  ${row.cwd}`.trimEnd();
}

function formatNameTitle(session: SessionMeta, names: SessionNameIndex): string {
  const name = names[session.id]?.name;
  const title = session.title ?? "untitled";
  return name ?? title;
}

function formatPath(cwd: string, scope: string): string {
  if (!cwd) {
    return "";
  }
  const normalizedScope = path.resolve(scope);
  const normalizedCwd = path.resolve(cwd);
  const rel = path.relative(normalizedScope, normalizedCwd);
  if (!rel || rel === ".") {
    return "./";
  }
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `./${rel}`;
  }
  return cwd;
}
