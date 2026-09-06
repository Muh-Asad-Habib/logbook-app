import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function privatePath(path) {
  const p = path.replaceAll('\\', '/');
  if (p === 'backend/src/assets/template-logbook.docx') return false;
  if (/(^|\/)\.env[^/]*$/i.test(p)) return !/(^|\/)\.env\.example$/.test(p);
  if (/(^|\/)(?:data|uploads|artifacts|node_modules|\.git|\.next|\.vercel|\.idea|\.vscode|coverage|backups?)(?:\/|$)/i.test(p)) return true;
  if (/^(?:vv|diag|hasil-deploy)\.txt$/i.test(p)) return true;
  if (/\.prompt\.md$/i.test(p)) return true;
  if (/\.(?:pem|key|p12|pfx|db|sqlite3?|log|zip|7z|rar|exe|docx|pptx|xlsx|pdf)$/i.test(p)) return true;
  return /^[^/]+\.(?:png|jpe?g)$/i.test(p) || p.startsWith('Referensi Desain UI/');
}
export function botAttribution(message) {
  return /^[ \t]*(?:co-authored-by|generated-by|signed-off-by):[^\r\n]*copilot/im.test(message);
}
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

export function checkRepo({ secrets = false } = {}) {
  const entries = git('ls-files', '--stage', '-z').split('\0').filter(Boolean);
  const paths = [];
  for (const entry of entries) {
    const match = entry.match(/^(\d+) [0-9a-f]+ (\d)\t([\s\S]+)$/);
    if (!match || match[2] !== '0') throw new Error('Index memiliki konflik yang belum diselesaikan.');
    if (!['100644', '100755'].includes(match[1])) throw new Error('Symlink/submodule perlu ditinjau sebelum commit.');
    paths.push(match[3]);
  }
  const blocked = paths.filter(privatePath);
  if (blocked.length) throw new Error(`Berkas privat/artefak dilarang di index: ${JSON.stringify(blocked)}`);
  if (!secrets) return paths.length;

  let scanner = process.env.GITLEAKS_PATH || 'gitleaks';
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Logbook-audit-tools', 'gitleaks.exe');
  if (!process.env.GITLEAKS_PATH && local && existsSync(local)) scanner = local;
  if (spawnSync(scanner, ['version'], { encoding: 'utf8', windowsHide: true }).status !== 0) {
    throw new Error('Gitleaks belum tersedia. Pasang binary resmi pada PATH atau set GITLEAKS_PATH; commit dihentikan.');
  }
  const temp = mkdtempSync(join(tmpdir(), 'logbook-index-scan-'));
  try {
    const snapshot = join(temp, 'index');
    git('checkout-index', '--all', `--prefix=${snapshot.replaceAll('\\', '/')}/`);
    const report = join(temp, 'report.json');
    const scan = spawnSync(scanner, ['dir', snapshot, '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report], {
      cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    if (scan.status !== 0) {
      const findings = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : [];
      const locations = findings.slice(0, 12).map((f) => ({ file: f.File.replace(snapshot, ''), line: f.StartLine, rule: f.RuleID }));
      throw new Error(`Pemindaian rahasia gagal; nilai tidak ditampilkan. ${JSON.stringify(locations)}`);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
  return paths.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const messageIndex = process.argv.indexOf('--message');
    if (messageIndex >= 0) {
      const path = process.argv[messageIndex + 1];
      if (!path) throw new Error('Path pesan commit belum diberikan.');
      if (botAttribution(readFileSync(path, 'utf8'))) throw new Error('Atribusi Copilot pada pesan commit tidak diizinkan untuk repo ini.');
      console.log('Pesan commit: lolos pemeriksaan atribusi.');
    } else {
      const count = checkRepo({ secrets: process.argv.includes('--secrets') });
      console.log(`Pemeriksaan repo: ${count} berkas index lulus${process.argv.includes('--secrets') ? ' dan tidak ada rahasia terdeteksi' : ''}.`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
// End of repository checks.
