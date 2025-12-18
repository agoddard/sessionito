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
- Preview markdown, text & HTML output

## Installation

```bash
yarn install
```

## Usage

```bash
# Start the server
yarn start

```

Then open http://localhost:3456 in your browser.

## Configuration

Set the `PORT` environment variable to change the default port:

```bash
PORT=8080 yarn start
```

## License

MIT
