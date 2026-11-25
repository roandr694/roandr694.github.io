# Editing and publishing the site

GitHub is the source for the public site at https://roandr694.github.io/. Rodrigo can edit the source in GitHub or request a specific change in chat. The former editorial form and scheduled reviews have been retired from this workflow.

## Where to edit

| To change | Source |
| --- | --- |
| About text | `content/about.md` |
| Name, profile details and contact links | `content/profile.json` |
| Projects | `content/projects.json` and `content/projects/` |
| Publications | `content/publications.json` |
| Writing | `content/writing.json` and `content/writing/` |
| Resume PDF | `files/rodrigo-andrade-resume.pdf` |

For an article, add its Markdown file under `content/writing/` and register the matching slug, title, description, date (`YYYY-MM-DD`), tags and `published` status in `content/writing.json`. Inline math uses `$...$` and display math uses `$$` on separate lines. The repository is public, so keep drafts in chat or a private location until they are ready to publish.

## Publishing a change

Start from the latest `master`. After editing the sources, run `npm ci`, then `npm test` and `npm run export:pages && npm run check`. Commit the source edits and the generated Pages files. For changes made with Codex, open a pull request and merge after checks pass. GitHub Pages publishes updates from the default branch. Verify the updated page on the live site.

If you edit a source file in the GitHub web interface, you can ask Codex to regenerate the Pages output and verify the update. Edit the source files in the table so future builds preserve your changes.
