import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

marked.use(markedKatex({ throwOnError: true, trust: false }));

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const profile = await json('content/profile.json');
const projects = await json('content/projects.json');
const publications = await json('content/publications.json');
const writing = await json('content/writing.json');
const writingSlugs = new Set();
for (const post of writing) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || writingSlugs.has(post.slug)) throw new Error('Invalid or duplicate writing slug');
  writingSlugs.add(post.slug);
  if (!['draft', 'published'].includes(post.status)) throw new Error(`Invalid writing status: ${post.slug}`);
  if (post.status === 'published') {
    if (!post.title?.trim() || !post.description?.trim()) throw new Error(`Missing writing title or description: ${post.slug}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date) || new Date(post.date).toISOString().slice(0, 10) !== post.date) throw new Error(`Invalid writing date: ${post.slug}`);
  }
}
const publishedPosts = writing.filter(post => post.status === 'published').sort((a, b) => b.date.localeCompare(a.date));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const markdown = async file => marked.parse(await readFile(file, 'utf8'));
const arrow = '<svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8"/></svg>';
const link = (url, label) => `<a href="${escape(url)}">${escape(label)} ${arrow}</a>`;

function layout({ title, path, active = 'about', body, description = profile.description, math = false }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} — ${escape(profile.name)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${escape(profile.url + path)}">
  <meta property="og:title" content="${escape(title)} — ${escape(profile.name)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escape(profile.url + path)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
  ${math ? '<link rel="stylesheet" href="/assets/katex/katex.min.css">' : ''}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="masthead"><div class="header-inner">
    <a class="wordmark" href="/">${escape(profile.name)}<span class="wordmark-dot" aria-hidden="true">.</span></a>
    <nav aria-label="Main navigation">${[['about', '/', 'About'], ['projects', '/portfolio/', 'Projects'], ['writing', '/writing/', 'Writing'], ['resume', profile.resume, 'Resume']].map(([id, url, label]) => `<a href="${escape(url)}"${id === 'resume' ? ' type="application/pdf"' : ''}${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  </div></header>
  <div class="page-grid">
    <aside class="profile" aria-label="Profile">
      <a class="monogram" href="/" aria-label="${escape(profile.name)} home">${escape(profile.initials)}<span aria-hidden="true">.</span></a>
      <h2>${escape(profile.name)}</h2>
      <p class="role">${escape(profile.role)}</p>
      <p class="profile-bio">${escape(profile.bio)}</p>
      <p class="location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>${escape(profile.location)}</p>
      <div class="profile-links">${link('mailto:' + profile.email, 'Email')}${link(profile.github, 'GitHub')}${profile.linkedin ? link(profile.linkedin, 'LinkedIn') : ''}</div>
      <div class="interests"><h3>Research interests</h3><ul>${profile.interests.map(i => `<li>${escape(i)}</li>`).join('')}</ul></div>
    </aside>
    <main id="main" tabindex="-1">${body}</main>
  </div>
  <footer><span>© ${new Date().getUTCFullYear()} ${escape(profile.name)}</span><span>Robotics &amp; control systems</span></footer>
</body></html>`;
}

function projectList(items) {
  return `<div class="project-list">${items.map(p => {
    const url = p.slug ? `/portfolio/${p.slug}/` : p.url;
    const resources = [...(p.slug ? [{ label: 'Project notes', url }] : []), ...(p.links || [])];
    const media = p.media?.video
      ? `<video class="project-thumbnail" controls playsinline preload="none" poster="${escape(p.media.image)}" aria-label="${escape(p.title)} demonstration"><source src="${escape(p.media.video)}">${link(p.media.video, 'Watch demonstration')}</video>`
      : p.media?.image
        ? `<a class="project-thumbnail" href="${escape(url)}" aria-label="Explore ${escape(p.title)}"><img src="${escape(p.media.image)}" alt="${escape(p.media.alt)}" loading="lazy" decoding="async" width="352" height="264"${p.media.position ? ` style="object-position:${escape(p.media.position)}"` : ''}></a>`
        : '';
    return `<article class="project-row${media ? '' : ' project-row-text'}">${media}<div class="project-copy"><p class="project-category"><span class="project-year">${escape(p.year)}</span><span aria-hidden="true"> / </span>${escape(p.venue || p.category)}</p><h3><a href="${escape(url)}">${escape(p.title)}</a></h3>${p.authors ? `<p class="project-authors">${p.authors.map(author => author === profile.name ? `<strong>${escape(author)}</strong>` : escape(author)).join(', ')}</p>` : ''}<p class="project-summary">${escape(p.summary)}</p>${resources.length ? `<div class="project-resources" aria-label="${escape(p.title)} resources">${resources.map(resource => link(resource.url, resource.label)).join('')}</div>` : ''}</div></article>`;
  }).join('')}</div>`;
}

const publicationSection = publications.length ? `<section class="publications" aria-labelledby="publications-heading"><div class="section-heading"><h2 id="publications-heading">Publications</h2></div>${projectList(publications)}</section>` : '';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const directory of ['assets', 'images', 'files']) await cp(directory, `dist/${directory}`, { recursive: true });
await mkdir('dist/assets/katex', { recursive: true });
await cp('node_modules/katex/dist/katex.min.css', 'dist/assets/katex/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'dist/assets/katex/fonts', { recursive: true });
await cp('node_modules/katex/LICENSE', 'dist/assets/katex/LICENSE');
await writeFile('dist/.nojekyll', '');
const pages = [];
async function page(path, title, body, active, description, math = false) {
  const target = path.endsWith('.html') ? `dist${path}` : `dist${path}index.html`;
  await mkdir(target.substring(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, layout({ title, path, body, active, description, math }));
  if (path !== '/404.html') pages.push(path);
}
const postDate = value => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
await page('/writing/', 'Writing', `<p class="eyebrow">Notes & explanations</p><h1>Writing<span class="accent">.</span></h1><p class="page-intro">Notes on robotics, mathematics, and the systems I build.</p>${publishedPosts.length ? `<div class="writing-list">${publishedPosts.map(post => `<article class="writing-entry"><time datetime="${escape(post.date)}">${escape(postDate(post.date))}</time><h2><a href="/writing/${escape(post.slug)}/">${escape(post.title)}</a></h2><p>${escape(post.description)}</p>${post.tags?.length ? `<p class="writing-tags">${post.tags.map(escape).join(' · ')}</p>` : ''}</article>`).join('')}</div>` : '<p class="writing-empty">New essays and technical notes will appear here.</p>'}`, 'writing');
for (const post of publishedPosts) {
  await page(`/writing/${post.slug}/`, post.title, `<article><a class="back-link" href="/writing/">Back to writing</a><p class="eyebrow"><time datetime="${escape(post.date)}">${escape(postDate(post.date))}</time></p><h1>${escape(post.title)}</h1><p class="page-intro">${escape(post.description)}</p><div class="prose writing-body">${await markdown(`content/writing/${post.slug}.md`)}</div></article>`, 'writing', post.description, true);
}

await page('/', 'About', `<p class="eyebrow">A little about me</p><h1>About me<span class="accent">.</span></h1><div class="prose introduction">${await markdown('content/about.md')}</div>${publicationSection}<section class="selected-work" aria-labelledby="work-heading"><div class="section-heading"><h2 id="work-heading">Selected projects</h2><a class="subtle-link" href="/portfolio/">View all ${arrow}</a></div>${projectList(projects)}<p class="contact-note">Have a question or an idea? ${link('mailto:' + profile.email, 'Get in touch')}.</p></section>`);
await page('/portfolio/', 'Projects', `<p class="eyebrow">Building & exploring</p><h1>Projects<span class="accent">.</span></h1><p class="page-intro">Personal engineering and science projects, from embedded systems and renewable energy to optics and robotics.</p>${publicationSection}<section aria-labelledby="projects-heading"><div class="section-heading"><h2 id="projects-heading">Personal projects</h2></div>${projectList(projects)}</section>`, 'projects');
for (const project of projects) {
  if (!/^[a-z0-9-]+$/.test(project.slug)) throw new Error('Invalid project slug');
  const figure = project.media?.image ? `<figure class="project-figure"><img src="${escape(project.media.image)}" alt="${escape(project.media.alt)}" width="960" height="640">${project.media.caption ? `<figcaption>${escape(project.media.caption)}</figcaption>` : ''}</figure>` : '';
  await page(`/portfolio/${project.slug}/`, project.title, `<a class="back-link" href="/portfolio/">Back to projects</a><p class="eyebrow project-detail-category">${escape(project.year)} / ${escape(project.category)}</p><h1 class="project-title">${escape(project.title)}</h1>${figure}<div class="prose project-body">${await markdown(`content/projects/${project.slug}.md`)}</div>`, 'projects', project.summary);
}
await page('/404.html', 'Page not found', '<p class="eyebrow">404</p><h1>Page not found<span class="accent">.</span></h1><p class="page-intro">This page may have moved. <a href="/">Return to the homepage</a> or <a href="/portfolio/">explore my projects</a>.</p>', '');
for (const alias of ['/about/', '/about.html', '/resume/', '/cv/']) {
  const destination = ['/resume/', '/cv/'].includes(alias) ? profile.resume : '/';
  const file = alias.endsWith('.html') ? `dist${alias}` : `dist${alias}index.html`;
  await mkdir(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${destination}"><link rel="canonical" href="${escape(profile.url + destination)}"><title>Redirecting</title></head><body><a href="${destination}">Continue to ${destination}</a></body></html>`);
}
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(path => `<url><loc>${escape(profile.url + path)}</loc></url>`).join('')}</urlset>`);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${profile.url}/sitemap.xml\n`);
console.log(`Built ${pages.length} pages, a 404 page, and legacy redirects in dist/.`);
