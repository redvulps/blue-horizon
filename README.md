# Blue Horizon

Blue Horizon is a multiplatform Bluesky client built with a Rust + Tauri backend and a React + TypeScript frontend.

## Current Features

- Authentication with Bluesky handle + app password (custom PDS supported).
- Home timeline, profile feeds, and post thread views.
- Post composer with replies, quote posts, up to 4 images, and per-image alt text.
- Feed discovery and feed detail browsing.
- List management (create/edit/delete lists, add/remove members, list feed).
- Chat conversations and messaging.
- Notifications with unread count tracking.
- Actor and post search.
- Custom window titlebar with native-style controls.
- Async media caching, GIF-aware handling, and native image/video save actions.

## Architecture

Blue Horizon uses a backend-first architecture:

- Rust/Tauri backend owns Bluesky API calls, secure session storage, SQLite persistence, background polling, and media pipeline work.
- React frontend focuses on UI composition, interaction flow, and rendering.
- Frontend server state is managed by TanStack Query; Zustand is reserved for UI/session metadata.

## Tech Stack

- Frontend: Bun, React, TypeScript, Vite, Zustand, TanStack Query, Tailwind CSS v4, shadcn/ui, motion, React Router.
- Backend: Rust, Tauri v2, bsky-sdk (AT Protocol), tokio, sqlx (SQLite), keyring.
- Tauri plugins: dialog, os, opener.

## Project Structure

```text
.
├── src/                 # React frontend
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   └── stores/
├── src-tauri/           # Rust + Tauri backend
│   ├── src/commands/
│   ├── migrations/
│   └── tauri.conf.json
├── package.json
└── README.md
```

## Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- Tauri CLI:

```bash
cargo install tauri-cli --version "^2.0.0"
```

## Setup

```bash
bun install
```

## Development

Run desktop app (frontend + Tauri backend):

```bash
bun run tauri dev
```

Run frontend only:

```bash
bun run dev
```

## Build

Build frontend bundle:

```bash
bun run build
```

Build desktop app bundles:

```bash
bun run tauri build
```

## Quality Checks

```bash
bun run typecheck
bun run lint
bun run format
bun run test
```

Optional Rust-only checks:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --no-run
```

## Security and Data Notes

- Credentials and tokens are stored in the OS keyring from the backend.
- The frontend does not persist access/refresh tokens.
- Cached app data is persisted in SQLite.
- Media cache is stored in the app cache directory and served through Tauri's asset protocol.

## License

This project is licensed under the MIT License. See `LICENSE`.
