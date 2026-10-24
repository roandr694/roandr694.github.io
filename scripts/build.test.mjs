import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('writing publishes approved entries, renders math, and omits drafts and source files', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'rodrigo-writing-'));
  try {
    for (const directory of ['scripts', 'content', 'assets', 'images', 'files']) await cp(directory, join(fixture, directory), { recursive: true });
    await cp('package.json', join(fixture, 'package.json'));
    await symlink(resolve('node_modules'), join(fixture, 'node_modules'));
    await mkdir(join(fixture, 'content/writing'), { recursive: true });
    await writeFile(join(fixture, 'content/writing.json'), JSON.stringify([
      { slug: 'public-note', title: 'A public note', description: 'Test mathematical writing.', date: '2026-10-23', tags: ['Mathematics'], status: 'published' },
      { slug: 'private-draft', title: 'PRIVATE_DRAFT_MARKER', status: 'draft' }
    ]));
    await writeFile(join(fixture, 'content/writing/public-note.md'), 'An inline equation $x^2$ and a displayed equation:\n\n$$\nx^2 + y^2 = z^2\n$$\n\n```python\nprint("$not_math$")\n```\n');
    await writeFile(join(fixture, 'content/writing/private-draft.md'), 'PRIVATE_DRAFT_MARKER');
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, stdio: 'pipe' });
    execFileSync(process.execPath, ['scripts/check.mjs'], { cwd: fixture, stdio: 'pipe' });
    const list = await readFile(join(fixture, 'dist/writing/index.html'), 'utf8');
    const article = await readFile(join(fixture, 'dist/writing/public-note/index.html'), 'utf8');
    const sitemap = await readFile(join(fixture, 'dist/sitemap.xml'), 'utf8');
    assert.match(list, /A public note/);
    assert.match(article, /class="katex"/);
    assert.match(article, /class="katex-display"/);
    assert.match(article, /\$not_math\$/);
    assert.match(sitemap, /\/writing\/public-note\//);
    for (const output of [list, article, sitemap]) assert.doesNotMatch(output, /PRIVATE_DRAFT_MARKER|private-draft/);
    await assert.rejects(readFile(join(fixture, 'dist/writing/private-draft/index.html')));
    await assert.rejects(readFile(join(fixture, 'dist/content/writing/private-draft.md')));

    await writeFile(join(fixture, 'content/writing.json'), JSON.stringify([{ slug: '../outside', status: 'published' }]));
    assert.throws(() => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, stdio: 'pipe' }));
    await writeFile(join(fixture, 'content/writing.json'), JSON.stringify([{ slug: 'invalid-status', status: 'publised' }]));
    assert.throws(() => execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, stdio: 'pipe' }));
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
