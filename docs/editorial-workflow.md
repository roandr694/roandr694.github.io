# Updating the site with Rodrigo

## Small edits

Rodrigo can request a change in chat, including from a phone. Read the current GitHub source, make a focused change, validate it, and prepare a preview and pull request. Keep public publishing behind approval of the exact change.

The repository's default branch is the source of truth after the migration PR is merged. While migration is under review, use its branch. Do not silently maintain diverging GitHub and Sites sources: a Sites preview should be built from the same source revision and record that GitHub revision in its commit message.

## Editorial reviews

Rules and proposals belong in a separate private control repository. Its policy records pending, ignored, watched, or already-featured repositories and excluded paths. New sources default to pending. A weekly cloud task discovers repository metadata and examines only explicitly watched content. A scheduled task never publishes.

Proposals include source links/revisions, what changed, why it matters, exact suggested copy, available images/video, missing facts, and any blog ideas. Suppress routine maintenance and repeated notifications. Record postponed/ignored decisions so they are not repeatedly suggested.

Only Rodrigo's responses authorize state changes. Review decisions must identify the proposal and its content revision. Changing a proposal after approval requires another approval. Before implementing an approved proposal, recheck source state, exclusions, and the current site branch. Public changes are limited to the approved material.

Mobile interaction starts with a short response in chat, such as “acompanhe X”, “ignore Y”, “adie a proposta 2” or “prepare a proposta 3”. Preparing an edit is separate from approval to merge it publicly. The private issue history stores decisions; it is not a public visitor feature.

## Writing

1. Work on ideas and drafts in the private control space or chat.
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

The pull request workflow builds and validates the site; it does not deploy. Merging approved changes to `master`/`main` runs the Pages deployment workflow when the repository is configured to use GitHub Actions. The public site's Pages source setting must be checked before the first migration merge. Keep the current private Sites preview available until public deployment is verified.
