import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
export const AGENT_DIR = process.env.OPENCLAW_TEAM_VAULT_AGENT_DIR || path.join(HOME, '.openclaw', 'agents', 'main', 'agent');
export const AUTH_PATH = path.join(AGENT_DIR, 'auth-profiles.json');
export const VAULT_DIR = path.join(AGENT_DIR, 'profile-vault', 'openai-codex');
export const INDEX_PATH = path.join(VAULT_DIR, 'index.json');
export const TRASH_DIR = path.join(VAULT_DIR, '.trash');
export const PROFILE_ID = 'openai-codex:default';
export const DAY_MS = 24 * 60 * 60 * 1000;
