import fs from 'node:fs';
export const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
export const nowIso = () => new Date().toISOString();
export const nowMs = () => Date.now();
export const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
export const shortId = (v) => (v ? String(v).slice(0, 8) : '-');
export const parsePositiveInt = (value, flagName) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0)
        fail(`${flagName} must be a positive integer`);
    return n;
};
export const sumDefined = (values) => {
    const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
};
export const parseResetToMinutes = (text) => {
    if (!text)
        return null;
    let total = 0;
    const day = text.match(/(\d+)d/i);
    const hour = text.match(/(\d+)h/i);
    const min = text.match(/(\d+)m/i);
    if (day)
        total += Number(day[1]) * 24 * 60;
    if (hour)
        total += Number(hour[1]) * 60;
    if (min)
        total += Number(min[1]);
    return total || 0;
};
export const fmtTime = (iso) => {
    if (!iso)
        return 'never';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
};
