import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

console.log('--- Starting MediaFlow Release Packaging ---');

// Ensure dist/ is fresh
console.log('Building latest production assets...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

const version = '1.0.0';
const stageDir = path.join(releaseDir, `mediaflow-v${version}`);
fs.mkdirSync(stageDir, { recursive: true });

// Files and folders to include in release bundle
const includeItems = [
  'dist',
  'worker',
  'public',
  'src',
  'docs',
  'start.bat',
  'start.ps1',
  'wrangler.jsonc',
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'tailwind.config.mjs',
  'tsconfig.json',
  'vitest.config.ts',
  'README.md',
  'README_EN.md',
  'SECRETS.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSE',
  '.gitignore',
  '.dev.vars.example',
];

console.log('Staging release files...');
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      if (['node_modules', '.git', '.wrangler', '.astro', 'release'].includes(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const item of includeItems) {
  const srcPath = path.join(rootDir, item);
  const destPath = path.join(stageDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
  }
}

const zipName = `mediaflow-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

console.log(`Compressing ${zipName}...`);
// Use PowerShell Compress-Archive for standard cross-platform zip format
const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force"`;
execSync(psCmd, { cwd: rootDir, stdio: 'inherit' });

// Cleanup stage directory
fs.rmSync(stageDir, { recursive: true, force: true });

// Calculate SHA256
const fileBuffer = fs.readFileSync(zipPath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const hex = hashSum.digest('hex');
const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

const checksumContent = `${hex}  ${zipName}\n`;
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), checksumContent, 'utf-8');

console.log(`\nRelease archive created successfully!`);
console.log(`File: ${zipPath} (${fileSizeMB} MB)`);
console.log(`SHA-256: ${hex}`);
console.log(`Checksum file: ${path.join(releaseDir, 'SHA256SUMS.txt')}`);
