import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve('dist');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : `${directory}/${entry.name}`))).flat();
}
const files = await walk(root);
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src|poster)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    let target = resolve(root, '.' + decodeURIComponent(match[1]));
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Path leaves build directory: ${file}`);
    let info;
    try {
      info = await stat(target);
      if (info.isDirectory()) { target += '/index.html'; info = await stat(target); }
    } catch { throw new Error(`Broken local link in ${file}: ${match[1]}`); }
    if (!info.isFile()) throw new Error(`Local link is not a file: ${target}`);
  }
}
if (files.some(file => /\/(?:content|\.editorial|\.git|node_modules)\//.test(file))) throw new Error('Source or private control data found in dist');
console.log('Generated page links and media resolve; source/control directories are absent.');
