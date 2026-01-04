import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput, render } from "ink";
import SelectInput, { type Item } from "ink-select-input";
import TextInput from "ink-text-input";
import type { SessionMeta, SessionNameIndex } from "./sessions.js";

export type TuiAction =
  | { type: "resume"; session: SessionMeta }
  | { type: "rename"; session: SessionMeta; name: string }
  | { type: "exit" };

type AppProps = {
  sessions: SessionMeta[];
  names: SessionNameIndex;
  onResolve: (action: TuiAction) => void;
};

type View = "sessions" | "actions" | "rename";

type ActionItem = Item<{ action: "resume" | "rename" | "back" }>;

type SessionItem = Item<SessionMeta>;

export async function runTui(
  sessions: SessionMeta[],
  names: SessionNameIndex
): Promise<TuiAction> {
  return new Promise((resolve) => {
    const instance = render(
      <App sessions={sessions} names={names} onResolve={resolve} />
    );
    instance.waitUntilExit().catch(() => {
      resolve({ type: "exit" });
    });
  });
}

function App({ sessions, names, onResolve }: AppProps): JSX.Element {
  const { exit } = useApp();
  const [view, setView] = useState<View>("sessions");
  const [selected, setSelected] = useState<SessionMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sessionItems = useMemo<SessionItem[]>(() => {
    return sessions.map((session) => ({
      label: formatSessionLabel(session, names),
      value: session,
    }));
  }, [sessions, names]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onResolve({ type: "exit" });
      exit();
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

  if (view === "actions" && selected) {
    const items: ActionItem[] = [
      { label: "Resume session", value: { action: "resume" } },
      { label: "Rename session", value: { action: "rename" } },
      { label: "Back to list", value: { action: "back" } },
    ];

    return (
      <Box flexDirection="column" gap={1}>
        <Text>{formatSessionLabel(selected, names)}</Text>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value.action === "back") {
              setView("sessions");
              return;
            }
            if (item.value.action === "rename") {
              setRenameValue(names[selected.id]?.name ?? "");
              setView("rename");
              return;
            }
            onResolve({ type: "resume", session: selected });
            exit();
          }}
        />
        <Text dimColor>Use arrows + enter. Press q/esc to exit.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>Select a Codex session</Text>
      <SelectInput
        items={sessionItems}
        onSelect={(item) => {
          setSelected(item.value);
          setView("actions");
        }}
      />
      <Text dimColor>Use arrows + enter. Press q/esc to exit.</Text>
    </Box>
  );
}

function formatSessionLabel(
  session: SessionMeta,
  names: SessionNameIndex
): string {
  const name = names[session.id]?.name;
  const time = session.timestamp
    ? new Date(session.timestamp).toISOString()
    : "unknown";
  const cwd = session.cwd ? ` ${session.cwd}` : "";
  if (name) {
    return `${time} ${session.id} ${name}${cwd}`;
  }
  return `${time} ${session.id}${cwd}`;
}
