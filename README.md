```
 ____  _____ ____ ____ ___ ___  _   _ ___ _____ ___
/ ___|| ____/ ___/ ___|_ _/ _ \| \ | |_ _|_   _/ _ \
\___ \|  _| \___ \___ \| | | | |  \| || |  | || | | |
 ___) | |___ ___) |__) | | |_| | |\  || |  | || |_| |
|____/|_____|____/____/___\___/|_| \_|___| |_| \___/
```

# Sessionito

A web-based viewer for browsing Claude Code sessions stored locally on your machine.

## Features

- Browse all projects and sessions from `~/.claude/projects/`
- View full conversation history for any session
- Search across sessions by content, slug, or project name
- Paginated session list sorted by most recent

## Installation

```bash
yarn install
```

## Usage

```bash
# Start the server
yarn start

# Development mode (with auto-reload)
yarn dev
```

Then open http://localhost:3456 in your browser.

## Configuration

Set the `PORT` environment variable to change the default port:

```bash
PORT=8080 yarn start
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects` | List all projects |
| `GET /api/projects/:projectId/sessions` | List sessions for a project |
| `GET /api/sessions` | List all sessions (paginated) |
| `GET /api/sessions/:sessionId` | Get session content |
| `GET /api/search?q=<query>` | Search sessions |

## License

MIT
