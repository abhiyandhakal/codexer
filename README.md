# codexer

Wrapper CLI for Codex session management, scoped to the current repo or folder.

## Development

- `npm install`
- `npm run dev -- resume`

## Usage

- `npx codexer` (interactive TUI session picker)
- `npx codexer list` (show sessions scoped to this repo or directory)
- `npx codexer resume [sessionId] [prompt...]`
- `npx codexer rename <sessionId> <name...>`
