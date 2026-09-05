// Next 16 exports nested segment files, while the client requests dotted names.
// Publish exact byte-for-byte aliases at build time, also usable by Vercel CDN.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export async function prepareStaticExport(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '_next') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.txt')) files.push(path);
    }
  }
  await walk(root);
  let count = 0;
  for (const source of files) {
    const parts = relative(root, source).split(sep);
    const segment = parts.findIndex((part) => part.startsWith('__next.'));
    if (segment < 0 || segment === parts.length - 1) continue;
    const destination = join(root, ...parts.slice(0, segment), parts.slice(segment).join('.'));
    const data = await readFile(source);
    let existing;
    try { existing = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing && !existing.equals(data)) throw new Error(`Conflicting RSC alias: ${relative(root, destination)}`);
    if (!existing) { await writeFile(destination, data, { flag: 'wx' }); count++; }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../frontend/out/', import.meta.url));
  console.log(`Static RSC aliases prepared: ${await prepareStaticExport(root)}`);
}

