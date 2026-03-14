#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AGENT_DIR, AUTH_PATH, DAY_MS, INDEX_PATH, PROFILE_ID, TRASH_DIR, VAULT_DIR } from './config.js';
import type { Flags, OrderField, Parsed, ProfileMeta, Row, Usage, VaultIndex } from './types.js';
import { ensureDir, fail, fmtTime, nowIso, nowMs, parsePositiveInt, parseResetToMinutes, readJson, shortId, sumDefined, writeJson } from './utils.js';

const COLOR = process.stdout.isTTY && process.env.NO_COLOR == null;
const ansi = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m'
};
const c = (text: string, ...styles: (keyof typeof ansi)[]) => !COLOR ? text : styles.map((s) => ansi[s] ?? '').join('') + text + ansi.reset;
const usageColor = (pct: number | null) => pct == null ? (s: string) => s : pct <= 5 ? (s: string) => c(s, 'red', 'bold') : pct <= 15 ? (s: string) => c(s, 'yellow', 'bold') : pct <= 40 ? (s: string) => c(s, 'yellow') : (s: string) => c(s, 'green');
const bullet = (active: boolean) => active ? c('●', 'green', 'bold') : c('○', 'gray');

function loadIndex(): VaultIndex {
  ensureDir(VAULT_DIR);
  if (!fs.existsSync(INDEX_PATH)) return { activeVaultProfile: null, profiles: {} };
  const index = readJson<VaultIndex>(INDEX_PATH);
  index.profiles ||= {};
  return index;
}
function saveIndex(index: VaultIndex) { ensureDir(VAULT_DIR); writeJson(INDEX_PATH, index); }
function loadAuth(): any { if (!fs.existsSync(AUTH_PATH)) fail(`Auth file not found: ${AUTH_PATH}`); return readJson<any>(AUTH_PATH); }
function saveAuth(auth: any) { writeJson(AUTH_PATH, auth); }
function currentProfile() { const auth = loadAuth(); const profile = auth?.profiles?.[PROFILE_ID]; if (!profile) fail(`Profile ${PROFILE_ID} not found in ${AUTH_PATH}`); return { auth, profile }; }
function profilePath(name: string, index = loadIndex()) { const meta = index.profiles?.[name]; if (!meta) fail(`Unknown team: ${name}`); return path.join(VAULT_DIR, meta.file || `${name}.json`); }
function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Flags & { help?: boolean; version?: boolean } = { refresh: false, keep: false, less: false, order: '5h' };
  const allowedOrders = new Set<OrderField>(['5h', 'week', '5h-resets', 'week-resets', 'ttl', 'query']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--days') flags.days = parsePositiveInt(argv[++i], '--days');
    else if (arg === '--refresh' || arg === '-r') flags.refresh = true;
    else if (arg === '--keep') flags.keep = true;
    else if (arg === '--less') flags.less = true;
    else if (arg === '--order') {
      const value = argv[++i] as OrderField;
      if (!allowedOrders.has(value)) fail(`--order must be one of: ${Array.from(allowedOrders).join(', ')}`);
      flags.order = value;
    } else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--version' || arg === '-v') flags.version = true;
    else positionals.push(arg);
  }
  return { positionals, flags } as Parsed;
}
function daysMeta(days?: number) {
  if (!days) return {};
  const expiresAtMs = nowMs() + days * DAY_MS;
  return { expiresInDays: days, expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs };
}
function remainingDays(meta: ProfileMeta) { return meta?.expiresAtMs ? Math.ceil((meta.expiresAtMs - nowMs()) / DAY_MS) : null; }
function expiryText(meta: ProfileMeta) { const left = remainingDays(meta); if (left == null) return c('no expiry', 'dim'); if (left <= 0) return c(`expired ${Math.abs(left)}d`, 'red', 'bold'); if (left <= 3) return c(`${left}d left`, 'red', 'bold'); if (left <= 7) return c(`${left}d left`, 'yellow', 'bold'); return c(`${left}d left`, 'blue'); }
function moveProfileToTrash(name: string, index: VaultIndex, reason = 'removed') { ensureDir(TRASH_DIR); const meta = index.profiles[name]; if (!meta) return false; const file = path.join(VAULT_DIR, meta.file || `${name}.json`); if (fs.existsSync(file)) fs.renameSync(file, path.join(TRASH_DIR, `${name}-${reason}-${Date.now()}.json`)); delete index.profiles[name]; if (index.activeVaultProfile === name) index.activeVaultProfile = null; return true; }
function pruneExpiredProfiles({ silent = false } = {}) { const index = loadIndex(); const expired = Object.entries(index.profiles).filter(([, meta]) => meta?.expiresAtMs && meta.expiresAtMs <= nowMs()).map(([name]) => name); if (expired.length === 0) return []; for (const name of expired) moveProfileToTrash(name, index, 'expired'); saveIndex(index); if (!silent) for (const name of expired) console.log(`${c('expired', 'yellow', 'bold')}: auto-removed ${name}`); return expired; }
function captureCurrentAs(name: string, label = name, options: { days?: number } = {}) {
  const index = loadIndex(); const { profile } = currentProfile(); const file = `${name}.json`; const expiry = daysMeta(options.days);
  const entry = { profileId: PROFILE_ID, savedAt: nowIso(), label, accountId: profile.accountId, ...expiry, profile };
  writeJson(path.join(VAULT_DIR, file), entry);
  index.profiles[name] = { ...(index.profiles[name] || {}), label, file, savedAt: entry.savedAt, sourceProfileId: PROFILE_ID, accountId: profile.accountId, status: 'captured', ...expiry };
  index.activeVaultProfile = name; saveIndex(index); return entry;
}
function switchTo(name: string, { quiet = false } = {}) { const index = loadIndex(); const target = readJson<any>(profilePath(name, index)); const auth = loadAuth(); auth.profiles ||= {}; auth.profiles[PROFILE_ID] = target.profile; auth.lastGood ||= {}; auth.lastGood['openai-codex'] = PROFILE_ID; saveAuth(auth); index.activeVaultProfile = name; saveIndex(index); if (!quiet) console.log(`Switched to ${name} (${index.profiles[name]?.label || name})`); }
function parseUsage(text: string): Usage { const five = text.match(/5h:\s*(\d+)% left\s*·\s*resets\s*([^\n]+)/i); const week = text.match(/Week:\s*(\d+)% left\s*·\s*resets\s*([^\n]+)/i); return { fiveHourLeft: five ? Number(five[1]) : null, fiveHourReset: five ? five[2].trim() : null, weekLeft: week ? Number(week[1]) : null, weekReset: week ? week[2].trim() : null, raw: text.trim() }; }
function getCurrentUsage(): Usage { const result = spawnSync('openclaw', ['status', '--usage'], { encoding: 'utf8' }); if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Failed to get usage').trim()); return parseUsage(result.stdout); }
let restoreState: { originalActive: string | null; originalAuth: string } | null = null;
function installRestoreHandlers() { const restoreAndExit = (code: number) => { if (restoreState) { try { fs.writeFileSync(AUTH_PATH, restoreState.originalAuth, 'utf8'); const restored = loadIndex(); restored.activeVaultProfile = restoreState.originalActive; saveIndex(restored); } catch {} restoreState = null; } process.exit(code); }; process.on('SIGINT', () => restoreAndExit(130)); process.on('SIGTERM', () => restoreAndExit(143)); process.on('uncaughtException', (err) => { console.error(err instanceof Error ? err.stack || err.message : String(err)); restoreAndExit(1); }); }
installRestoreHandlers();
function refreshUsageFor(name: string) { const index = loadIndex(); const originalActive = index.activeVaultProfile; const originalAuth = fs.readFileSync(AUTH_PATH, 'utf8'); restoreState = { originalActive, originalAuth }; try { switchTo(name, { quiet: true }); const usage = getCurrentUsage(); const fresh = loadIndex(); fresh.profiles[name] = { ...(fresh.profiles[name] || {}), lastKnownUsage: usage, lastVerifiedAt: nowIso() }; saveIndex(fresh); return { usage, refreshedAt: fresh.profiles[name].lastVerifiedAt || null }; } finally { fs.writeFileSync(AUTH_PATH, originalAuth, 'utf8'); const restored = loadIndex(); restored.activeVaultProfile = originalActive; saveIndex(restored); restoreState = null; } }
function cachedUsageFor(name: string) { const index = loadIndex(); const meta = index.profiles[name]; if (!meta) fail(`Unknown team: ${name}`); return { usage: meta.lastKnownUsage || null, refreshedAt: meta.lastVerifiedAt || null }; }
function safeUsageFor(name: string, refresh: boolean) {
  const cached = cachedUsageFor(name);
  if (!refresh) return { ...cached, usedCacheFallback: false, refreshError: null };
  try {
    const fresh = refreshUsageFor(name);
    return { ...fresh, usedCacheFallback: false, refreshError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallbackUsage = cached.usage ? { ...cached.usage, error: `refresh failed: ${message}` } : { fiveHourLeft: null, fiveHourReset: null, weekLeft: null, weekReset: null, raw: '', error: `refresh failed: ${message}` };
    return { usage: fallbackUsage, refreshedAt: cached.refreshedAt, usedCacheFallback: true, refreshError: message };
  }
}
function formatUsageLine(label: string, pct: number | null | undefined, resetText?: string | null) { const paint = usageColor(pct ?? null); const pctText = pct == null ? '?' : `${pct}%`; return `${c(label.padEnd(4), 'cyan')} ${paint(pctText.padStart(4))} ${c('left', 'dim')} ${c('·', 'gray')} ${c('resets', 'dim')} ${resetText ?? '?'}`; }
function orderValue(row: Row, order: OrderField) { const usage = row.data.usage || {}; const meta = row.meta || {}; switch (order) { case '5h': return usage.fiveHourLeft ?? -1; case 'week': return usage.weekLeft ?? -1; case '5h-resets': return parseResetToMinutes(usage.fiveHourReset) ?? -1; case 'week-resets': return parseResetToMinutes(usage.weekReset) ?? -1; case 'ttl': return meta.expiresAtMs ?? Number.POSITIVE_INFINITY; case 'query': return meta.lastVerifiedAt ? new Date(meta.lastVerifiedAt).getTime() : -1; default: return usage.fiveHourLeft ?? -1; } }
function sortRows(rows: Row[], order: OrderField) { return [...rows].sort((a, b) => { const av = orderValue(a, order); const bv = orderValue(b, order); if (bv !== av) return bv - av; const a5 = a.data.usage?.fiveHourLeft ?? -1; const b5 = b.data.usage?.fiveHourLeft ?? -1; if (b5 !== a5) return b5 - a5; const aw = a.data.usage?.weekLeft ?? -1; const bw = b.data.usage?.weekLeft ?? -1; return bw - aw; }); }
function printExpiry(meta: ProfileMeta) { if (meta?.expiresAtMs) console.log(`  ${c('ttl', 'dim')}  ${expiryText(meta)} ${c('·', 'gray')} ${c('expires', 'dim')} ${meta.expiresAt}`); else console.log(`  ${c('ttl', 'dim')}  ${expiryText(meta)}`); }
function printRefreshInfo(refreshedAt: string | null, wasRefreshed: boolean) { console.log(`  ${c('query', 'dim')}: ${wasRefreshed ? 'refreshed' : 'cached'} ${fmtTime(refreshedAt)}`); }
function printRefreshHint(flags: Flags, refreshCmd: string | null = null) { if (!flags.refresh) { console.log(`${c('hint', 'dim')}: rerun with ${c('--refresh', 'bold')} or ${c('-r', 'bold')} to fetch latest usage`); if (refreshCmd) console.log(`${c('copy', 'dim')}: ${refreshCmd}`); console.log(c('────────────────────────────────────────', 'gray')); } }
function printTeamUsage(name: string, usage: Usage | null, isActive = false, refreshedAt: string | null = null, wasRefreshed = false, showDivider = false) { if (showDivider) console.log(c('────────────────────────────────────────', 'gray')); const index = loadIndex(); const meta = index.profiles[name] || {}; console.log(`${bullet(isActive)} ${isActive ? c(name, 'bold', 'cyan') : c(name, 'bold')} ${c(`(${meta.label || name})`, 'dim')} ${c('·', 'gray')} ${c('acct', 'dim')} ${shortId(meta.accountId)}`); printExpiry(meta); printRefreshInfo(refreshedAt, wasRefreshed); if (!usage) return console.log(`  ${c('usage', 'yellow', 'bold')}: no cached usage yet`); if (usage.error) console.log(`  ${c('usage', 'red', 'bold')}: ${usage.error}`); else { console.log(`  ${formatUsageLine('5h', usage.fiveHourLeft, usage.fiveHourReset)}`); console.log(`  ${formatUsageLine('week', usage.weekLeft, usage.weekReset)}`); } }
function cmdCurrent(flags: Flags) { const index = loadIndex(); const active = index.activeVaultProfile; printRefreshHint(flags, 'openclaw-team-vault current -r'); if (active && index.profiles[active]) { const meta = index.profiles[active]; const data = safeUsageFor(active, flags.refresh); const usage = data.usage || { fiveHourLeft: null, fiveHourReset: null, weekLeft: null, weekReset: null }; console.log(`${bullet(true)} ${c(active, 'bold', 'cyan')} ${c(`(${meta.label || active})`, 'dim')}`); console.log(`  ${c('account', 'dim')}: ${shortId(meta.accountId)}`); printExpiry(meta); printRefreshInfo(data.refreshedAt, flags.refresh && !data.usedCacheFallback); console.log(`  ${formatUsageLine('5h', usage.fiveHourLeft, usage.fiveHourReset)}`); console.log(`  ${formatUsageLine('week', usage.weekLeft, usage.weekReset)}`); if (data.usedCacheFallback) console.log(`  ${c('fallback', 'yellow', 'bold')}: using cached usage because refresh failed`); } else console.log(c('(active team not mapped in vault)', 'yellow')); }
function cmdLs(flags: Flags) { const index = loadIndex(); const names = Object.keys(index.profiles || {}); if (!names.length) return console.log('No teams saved. Use: openclaw-team-vault add <name> [--days N]'); if (!flags.less) printRefreshHint(flags, 'openclaw-team-vault ls -r'); const results: Row[] = names.map((name) => ({ name, data: safeUsageFor(name, flags.refresh), isActive: index.activeVaultProfile === name, meta: loadIndex().profiles[name] || {} })); const sorted = sortRows(results, flags.order); if (!flags.less) sorted.forEach((row, i) => printTeamUsage(row.name, row.data.usage, row.isActive, row.data.refreshedAt, flags.refresh && !row.data.usedCacheFallback, i > 0)); const total5h = sumDefined(results.map((r) => r.data.usage?.fiveHourLeft)); const totalWeek = sumDefined(results.map((r) => r.data.usage?.weekLeft)); const fallbackCount = results.filter((r) => r.data.usedCacheFallback).length; if (flags.less) { console.log(`usage source: ${flags.refresh ? (fallbackCount ? `mixed (${fallbackCount} cached fallback)` : 'refreshed') : 'cached'} · order: ${flags.order}`); for (const row of sorted) { const u = row.data.usage || {}; const suffix = row.data.usedCacheFallback ? '  [cached fallback]' : ''; console.log(`${row.isActive ? '*' : '-'} ${row.name}  5h:${u.fiveHourLeft ?? '?'}%  week:${u.weekLeft ?? '?'}%${suffix}`); } console.log(`total 5h:${total5h ?? '?'}%  week:${totalWeek ?? '?'}%`); return console.log('usage: openclaw-team-vault use <name>'); } console.log(c('════════════════════════════════════════', 'gray')); console.log(`${c('Σ total', 'bold', 'cyan')} ${c('cached usage sum', 'dim')}`); console.log(`  ${c('5h', 'cyan')}    ${total5h == null ? '?' : c(`${total5h}%`, 'bold')}`); console.log(`  ${c('week', 'cyan')}  ${totalWeek == null ? '?' : c(`${totalWeek}%`, 'bold')}`); if (fallbackCount) console.log(`  ${c('note', 'yellow', 'bold')}  ${fallbackCount} team(s) used cached fallback because refresh failed`); }
function cmdShow(name: string | undefined, flags: Flags) { if (!name) fail('Usage: openclaw-team-vault show <name> [--refresh]'); const index = loadIndex(); if (!index.profiles[name]) fail(`Unknown team: ${name}`); printRefreshHint(flags, `openclaw-team-vault show ${name} -r`); const data = safeUsageFor(name, flags.refresh); printTeamUsage(name, data.usage, index.activeVaultProfile === name, data.refreshedAt, flags.refresh && !data.usedCacheFallback); if (data.usedCacheFallback) console.log(`  ${c('fallback', 'yellow', 'bold')}: using cached usage because refresh failed`); }
function cmdAdd(name: string | undefined, flags: Flags) { if (!name) fail('Usage: openclaw-team-vault add <name> [--days N] [--keep]'); const index = loadIndex(); if (index.profiles[name]) fail(`Team already exists: ${name}`); const previousActive = index.activeVaultProfile; console.log(`Starting OpenAI Codex login for new team: ${name}`); if (flags.days) console.log(`Expiry: ${flags.days} days`); if (flags.keep && previousActive) console.log(`Keep mode: will switch back to ${previousActive} after capture`); console.log('Finish the browser login and select the target team.'); const result = spawnSync('openclaw', ['models', 'auth', 'login', '--provider', 'openai-codex'], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); const entry = captureCurrentAs(name, name, { days: flags.days }); console.log(`Captured ${name} · acct ${shortId(entry.accountId)}`); if ('expiresAt' in entry && entry.expiresAt) console.log(`TTL: ${flags.days}d · expires ${entry.expiresAt}`); try { const data = refreshUsageFor(name); console.log(`5h: ${data.usage.fiveHourLeft}% left · resets ${data.usage.fiveHourReset}`); console.log(`week: ${data.usage.weekLeft}% left · resets ${data.usage.weekReset}`); } catch (err) { console.warn(`Added ${name}, but failed to read usage: ${err instanceof Error ? err.message : String(err)}`); } if (flags.keep && previousActive && previousActive !== name) { switchTo(previousActive, { quiet: true }); console.log(`Restored active team: ${previousActive}`); } }
function cmdRemove(name?: string) { if (!name) fail('Usage: openclaw-team-vault remove <name>'); const index = loadIndex(); if (!index.profiles[name]) fail(`Unknown team: ${name}`); if (index.activeVaultProfile === name) fail(`Refusing to remove active team: ${name}. Switch to another team first.`); moveProfileToTrash(name, index, 'removed'); saveIndex(index); console.log(`Removed ${name} (moved profile file to ${TRASH_DIR})`); }
function cmdUse(name?: string) { if (!name) fail('Usage: openclaw-team-vault use <name>'); const index = loadIndex(); if (!index.profiles[name]) fail(`Unknown team: ${name}`); switchTo(name); const data = refreshUsageFor(name); printTeamUsage(name, data.usage, true, data.refreshedAt, true); }
function cmdRefresh(name?: string) { const index = loadIndex(); const names = name ? [name] : Object.keys(index.profiles || {}); if (!names.length) return console.log('No teams saved.'); for (const teamName of names) { if (!index.profiles[teamName]) fail(`Unknown team: ${teamName}`); const data = refreshUsageFor(teamName); printTeamUsage(teamName, data.usage, loadIndex().activeVaultProfile === teamName, data.refreshedAt, true); } }
function cmdSetDays(name: string | undefined, days: number) { if (!name) fail('Usage: openclaw-team-vault set-days <name> <days>'); const index = loadIndex(); if (!index.profiles[name]) fail(`Unknown team: ${name}`); const expiry = daysMeta(days); Object.assign(index.profiles[name], expiry); saveIndex(index); const file = profilePath(name, index); if (fs.existsSync(file)) { const entry = readJson<any>(file); Object.assign(entry, expiry); writeJson(file, entry); } console.log(`Set expiry for ${name}: ${days}d · expires ${(expiry as any).expiresAt}`); }
function cmdRename(name: string | undefined, label: string) { if (!name || !label) fail('Usage: openclaw-team-vault rename <name> <label>'); const index = loadIndex(); if (!index.profiles[name]) fail(`Unknown team: ${name}`); index.profiles[name].label = label; saveIndex(index); console.log(`Renamed ${name} -> ${label}`); }
function help() {
  console.log(`openclaw-team-vault

Manage multiple OpenAI Codex team OAuth profiles used by OpenClaw.

Usage:
  openclaw-team-vault <command> [options]

Commands:
  ls [--refresh,-r] [--less] [--order <field>]
  current [--refresh,-r]
  show <name> [--refresh,-r]
  refresh [name]
  add <name> [--days N] [--keep]
  set-days <name> <days>
  remove <name>
  use <name>
  rename <name> <label>

Global options:
  -h, --help     Show help
  -v, --version  Show version
`);
}
function version() {
  const pkg = readJson<any>(new URL('../package.json', import.meta.url));
  console.log(pkg.version);
}
const parsed = parseArgs(process.argv.slice(2));
const [cmd, ...args] = parsed.positionals;
if (parsed.flags.version) version();
else if (parsed.flags.help || !cmd) help();
else {
  pruneExpiredProfiles();
  switch (cmd) {
    case 'ls': cmdLs(parsed.flags); break;
    case 'current': cmdCurrent(parsed.flags); break;
    case 'show': cmdShow(args[0], parsed.flags); break;
    case 'refresh': cmdRefresh(args[0]); break;
    case 'add': cmdAdd(args[0], parsed.flags); break;
    case 'set-days': cmdSetDays(args[0], parsePositiveInt(args[1], '<days>')); break;
    case 'remove': cmdRemove(args[0]); break;
    case 'use': cmdUse(args[0]); break;
    case 'rename': cmdRename(args[0], args.slice(1).join(' ')); break;
    default: fail(`Unknown command: ${cmd}`);
  }
}
