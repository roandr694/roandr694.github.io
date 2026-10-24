import { cp, rm } from 'node:fs/promises';

// Keep the existing GitHub Pages branch configuration working. Only generated
// page directories and the KaTeX bundle are replaced; authored assets stay put.
for (const name of ['portfolio', 'writing', 'assets/katex']) {
  await rm(name, { recursive: true, force: true });
  await cp(`dist/${name}`, name, { recursive: true });
}
for (const name of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', '.nojekyll']) await cp(`dist/${name}`, name);
console.log('Exported generated pages for the existing GitHub Pages branch source.');
