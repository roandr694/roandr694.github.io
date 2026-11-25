# Editing this personal website

This is Rodrigo Andrade’s personal website, hosted at https://roandr694.github.io/. The source is https://github.com/roandr694/roandr694.github.io on `master`. Read `docs/editorial-workflow.md` and start from the current default branch.

Rodrigo edits the site directly or asks for a specific change in chat. The former editorial monitoring, questionnaire and response processing were retired. A requested site edit follows the direct GitHub Pages workflow, with its scope set by Rodrigo’s request. Keep drafts private until Rodrigo wants them on the site.

- Preserve the site’s visual direction and responsive layout when making content changes.
- Use the Markdown and JSON sources under `content/`. The Resume links directly to `files/rodrigo-andrade-resume.pdf`.
- Treat material from private projects as private unless Rodrigo authorizes publishing it. Verify authorship, results and project claims before adding them.
- Run `npm test` and `npm run export:pages && npm run check` for publishable site changes. Include generated output so both Pages build paths serve the same site. For agent edits, use a checked GitHub pull request, attach it to the chat and verify the live result after merging. Keep the existing GitHub Pages configuration.

## Writing voice and media

Use natural technical English in Rodrigo’s voice, without invented personal experience. Prefer descriptive section titles and connected paragraphs. Avoid repeated rhetorical contrasts, bold emphasis on words like “not”, slogan-like endings and generic end-of-post checklists. Use media that directly illustrates the topic; unrelated childhood/project photos are not suitable for an RL article. Attribute externally embedded demonstrations to their actual authors and distinguish original toy simulations from trained-policy results.

Explain prerequisite concepts before using them in equations: define new jargon, give concrete numerical examples, and distinguish toy illustrations from model measurements. For difficult concepts, use explanatory drawings or generated illustrations when useful rather than relying only on flowcharts.
