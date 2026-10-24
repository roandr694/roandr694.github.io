# Updating the site with Rodrigo

## Small edits

Rodrigo can request a change in chat, including from a phone. Read the current GitHub source, make a focused change, validate it, and prepare a preview and pull request. Keep public publishing behind approval of the exact change.

The repository's default branch (`master`) is the source of truth. The migration is complete. Do not silently maintain diverging GitHub and Sites sources: a Sites preview should be built from the same source revision and record that GitHub revision in its commit message.

## Editorial reviews

Rules, drafts and history belong in the private `roandr694/site-editorial` repository. Its policy records pending, ignored, watched, or already-featured repositories and excluded paths. New sources default to pending. A weekly discovery task examines only explicitly watched content and never publishes. A separate response processor can apply version-specific approval from the private form after checking and testing the exact approved changes.

Proposals include source links/revisions, what changed, why it matters, exact suggested copy, available images/video, missing facts, and any blog ideas. Suppress routine maintenance and repeated notifications. Record postponed/ignored decisions so they are not repeatedly suggested.

Only Rodrigo's responses authorize state changes. Review decisions must identify the proposal and its content revision. Changing a proposal after approval requires another approval. Before implementing an approved proposal, recheck source state, exclusions, and the current site branch. Public changes are limited to the approved material.

Mobile interaction uses https://rodrigo-andrade-editorial.randrade0609.chatgpt.site/. Rodrigo saves project eligibility and reviews proposals there. The form stores decisions in private R2 storage. Do not ask him to repeat a valid form approval in chat. Issues are no longer the questionnaire. Saving an approval does not prove publication: verify the public result before marking it applied.

## Writing

1. Read `AGENTS.md` and `drafts/README.md` in `roandr694/site-editorial`. Work on ideas in chat and save drafts at `drafts/<slug>/article.md`, with sources, unresolved questions and publication context in `drafts/<slug>/notes.md`. Do not invent Rodrigo's experiences or publish private research details without approval.
2. Review the text, claims, references, math, and media with Rodrigo.
3. After approval, put the article in `content/writing/<slug>.md` and add its metadata to `content/writing.json`.
4. Run checks, show the actual preview, and submit the change for publication approval.

Example metadata for an approved article (illustrative only):

```json
{
  "slug": "inverse-kinematics",
  "title": "Understanding inverse kinematics",
  "description": "An explanation of the problem and a worked example.",
  "date": "YYYY-MM-DD",
  "tags": ["Robotics", "Mathematics"],
  "status": "published"
}
```

Inline math uses `$...$`; display math uses `$$` on separate lines. KaTeX renders at build time with local CSS/fonts. Fenced code blocks, ordinary Markdown images, and accessible HTML video are supported. Never invent an article attributed to Rodrigo based only on a repository name.

## Publication

The pull request workflow builds and validates the site; it does not deploy. Before a publishing commit, run `npm run export:pages` and include the generated root pages, `.nojekyll`, and KaTeX bundle. This preserves the existing Pages branch configuration while the Actions deployment uses the same output. Keep the owner-private Sites preview available until public deployment is verified. Never change the public Pages source setting merely to make a preview work.
