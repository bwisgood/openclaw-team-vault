# openclaw-team-vault

[English](./README.en.md)

一个用于管理 OpenClaw 下多个 OpenAI Codex Team OAuth 登录态的命令行工具。

## 功能

- 保存多个 OpenAI Codex team 登录态
- 在已保存的 team 之间切换
- 缓存 provider 用量快照
- 按需刷新最新用量
- 给临时 team 设置过期天数
- 将已过期 team 自动移动到 `.trash/`
- 提供紧凑视图，方便快速判断接下来该切哪个 team

## 依赖

- Node.js 20+
- 已安装 OpenClaw，并且 `openclaw` 可直接执行
- 本机已有 OpenClaw agent 目录与 OpenAI Codex 登录态，默认通常在：
  - `~/.openclaw/agents/main/agent`

## 安装

### 从 npm 安装

```bash
npm install -g openclaw-team-vault
openclaw-team-vault --help
```

### 使用 npx

```bash
npx openclaw-team-vault --help
```

### 本地开发

```bash
npm install
npm run build
node dist/cli.js --help
```

## 用法

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

## 说明

- `current`、`ls`、`show` 默认读取缓存用量。
- 使用 `--refresh` 或 `-r` 获取最新用量。
- `refresh [name]` 是显式刷新缓存的命令。
- `add --keep` 会添加新 team，并在完成后切回之前正在使用的 team。
- 已过期 team 会被移动到 `.trash/`，不是永久删除。

## 环境变量

如果你的 OpenClaw agent 目录不是默认路径，可以覆盖：

```bash
OPENCLAW_TEAM_VAULT_AGENT_DIR=/custom/agent/dir openclaw-team-vault ls
```

## 安全提醒

这个工具会直接操作本地 OAuth profile 文件。下面这些都属于敏感数据：

- `auth-profiles.json`
- `profile-vault/openai-codex/*.json`

不要把这些 vault/profile 数据提交到 git。

## 许可证

MIT
