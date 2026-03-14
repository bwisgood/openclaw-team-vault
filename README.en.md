# openclaw-team-vault

[中文](./README.md)

A CLI for managing multiple OpenAI Codex team OAuth profiles used by OpenClaw.

## Features

- Save multiple OpenAI Codex team profiles
- Switch between saved teams
- Cache provider usage snapshots
- Refresh usage on demand
- Set optional expiry days for temporary teams
- Auto-prune expired teams into `.trash/`
- Show compact views for deciding which team to use next

## Requirements

- Node.js 20+
- OpenClaw installed and available on `PATH` as `openclaw`
- An existing OpenClaw agent directory with OpenAI Codex auth, typically:
  - `~/.openclaw/agents/main/agent`

## Installation

### From npm

```bash
npm install -g openclaw-team-vault
openclaw-team-vault --help
```

### With npx

```bash
npx openclaw-team-vault --help
```

### Local development

```bash
npm install
npm run build
node dist/cli.js --help
```

## Usage

```bash
openclaw-team-vault ls
openclaw-team-vault ls --less
openclaw-team-vault ls --less --order week
openclaw-team-vault current
openclaw-team-vault current --refresh
openclaw-team-vault show team-alpha
openclaw-team-vault refresh
openclaw-team-vault add my-team --days 30 --keep
openclaw-team-vault use team-alpha
openclaw-team-vault set-days team-alpha 30
openclaw-team-vault remove old-team
```

## Notes

- `current`, `ls`, and `show` read cached usage by default.
- Use `--refresh` or `-r` to fetch fresh usage.
- `refresh [name]` is the explicit cache refresh command.
- `add --keep` adds a new team and then restores the previously active team.
- Expired teams are moved to `.trash/`, not permanently deleted.

## Environment

Override the OpenClaw agent directory if needed:

```bash
OPENCLAW_TEAM_VAULT_AGENT_DIR=/custom/agent/dir openclaw-team-vault ls
```

## Security

This tool operates on local OAuth profile files. Treat the following as sensitive:

- `auth-profiles.json`
- `profile-vault/openai-codex/*.json`

Do not commit vault/profile data to git.

## License

MIT
