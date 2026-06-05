import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Binaries are resolved in priority order:
//   1. ~/.live-translate/bin/<name>     — previously auto-downloaded
//   2. <package>/bin/<platform>/<name> — bundled with npm package
//   3. system PATH                     — existing user install (e.g. Homebrew)
// If none found, attempts to download from the live-translate GitHub release.

const RELEASE_BASE = 'https://github.com/jolucashornung/live-translate/releases/download/binaries-v1';

const DOWNLOAD_URLS: Record<string, Partial<Record<string, string>>> = {
  'espeak-ng': {
    'darwin-arm64': `${RELEASE_BASE}/espeak-ng-darwin-arm64.tar.gz`,
    'darwin-x64':   `${RELEASE_BASE}/espeak-ng-darwin-x64.tar.gz`,
    'linux-x64':    `${RELEASE_BASE}/espeak-ng-linux-x64.tar.gz`,
    'linux-arm64':  `${RELEASE_BASE}/espeak-ng-linux-arm64.tar.gz`,
  },
};

function getCacheDir(): string { return path.join(os.homedir(), '.live-translate', 'bin'); }

function getPkgBinDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = path.resolve(path.dirname(thisFile), '..', '..');
  return path.join(pkgRoot, 'bin', `${process.platform}-${process.arch}`);
}

function platformKey(): string { return `${process.platform}-${process.arch}`; }

function existsAndExecutable(p: string): boolean {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

function findOnPath(name: string): string | null {
  try {
    const result = execSync(`which ${name} 2>/dev/null`, { stdio: 'pipe' }).toString().trim();
    return result || null;
  } catch { return null; }
}

async function downloadAndExtract(url: string, destDir: string): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `live-translate-bin-${Date.now()}.tar.gz`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer()));
    fs.mkdirSync(destDir, { recursive: true });
    execSync(`tar -xzf ${JSON.stringify(tmpFile)} -C ${JSON.stringify(destDir)}`, { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

export async function resolveBinary(
  name: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const cached = path.join(getCacheDir(), name);
  if (existsAndExecutable(cached)) return cached;

  const bundled = path.join(getPkgBinDir(), name);
  if (existsAndExecutable(bundled)) return bundled;

  const system = findOnPath(name);
  if (system) return system;

  const url = DOWNLOAD_URLS[name]?.[platformKey()];
  if (url) {
    onProgress?.(`Downloading ${name} for ${platformKey()}...`);
    try {
      await downloadAndExtract(url, getCacheDir());
      if (existsAndExecutable(cached)) {
        fs.chmodSync(cached, 0o755);
        return cached;
      }
    } catch {
      // Download failed — fall through to error
    }
  }

  throw new Error(
    `${name} not found. Install with: brew install ${name} (macOS) or apt install ${name} (Linux)`
  );
}

export function isBinaryAvailable(name: string): boolean {
  const cached = path.join(getCacheDir(), name);
  if (existsAndExecutable(cached)) return true;
  const bundled = path.join(getPkgBinDir(), name);
  if (existsAndExecutable(bundled)) return true;
  return findOnPath(name) !== null;
}
