import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');

if (!fs.existsSync(distDir)) {
  console.error('check-bundle-size: missing dist/ — run vite build first');
  process.exit(1);
}

/** @param {string} d */
function totalBytes(d) {
  let n = 0;
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) n += totalBytes(p);
    else n += fs.statSync(p).size;
  }
  return n;
}

const bytes = totalBytes(distDir);
/** Upper bound for Three + app (adjust if assets grow). */
const limit = 3 * 1024 * 1024;

console.log(`check-bundle-size: dist ${(bytes / 1024).toFixed(1)} KiB (limit ${(limit / 1024).toFixed(0)} KiB)`);

if (bytes > limit) {
  console.error('check-bundle-size: dist exceeds limit');
  process.exit(1);
}
