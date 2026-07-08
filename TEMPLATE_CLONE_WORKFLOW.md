# Template Clone Workflow

This repo, `AppTemplateBase`, is the upstream/base template repo.

Each app cloned from this template should become its own GitHub repo, while still keeping a connection back to `AppTemplateBase` so template updates can be pulled in later.

## Goal

Use this setup:

```text
AppTemplateBase
  └── upstream template repo

SunoSongWriter
  ├── origin   -> app's own private repo
  └── template -> AppTemplateBase repo
```

This allows each cloned app to have its own history, commits, and GitHub repo while still being able to merge future fixes from `AppTemplateBase`.

---

## 1. Clone the template into a new app folder

```bash
cd ~/Programming
git clone https://github.com/lcharleslaing/AppTemplateBase.git SunoSongWriter
cd SunoSongWriter
```

Replace `SunoSongWriter` with the new app name.

---

## 2. Rename the original remote to `template`

```bash
git remote rename origin template
```

Verify:

```bash
git remote -v
```

Expected:

```text
template  https://github.com/lcharleslaing/AppTemplateBase.git (fetch)
template  https://github.com/lcharleslaing/AppTemplateBase.git (push)
```

Do **not** delete the `.git` folder.

Keeping the Git history makes future template merges much cleaner.

---

## 3. Create the new private GitHub repo

Log in first:

```bash
gh auth login
```

Choose:

```text
GitHub.com
HTTPS
Y
Login with a web browser
```

Then create the private repo and push:

```bash
gh repo create lcharleslaing/SunoSongWriter --private --source=. --remote=origin --push
```

Replace `SunoSongWriter` with the new app repo name.

---

## 4. If the repo already exists

If GitHub says:

```text
GraphQL: Name already exists on this account
```

That means the repo already exists.

Check remotes:

```bash
git remote -v
```

If `origin` is missing, add it:

```bash
git remote add origin https://github.com/lcharleslaing/SunoSongWriter.git
```

If `origin` already exists but is wrong, fix it:

```bash
git remote set-url origin https://github.com/lcharleslaing/SunoSongWriter.git
```

Then push:

```bash
git push -u origin main
```

---

## 5. Correct final remote setup

Run:

```bash
git remote -v
```

Expected:

```text
origin    https://github.com/lcharleslaing/SunoSongWriter.git (fetch)
origin    https://github.com/lcharleslaing/SunoSongWriter.git (push)
template  https://github.com/lcharleslaing/AppTemplateBase.git (fetch)
template  https://github.com/lcharleslaing/AppTemplateBase.git (push)
```

`origin` is the cloned app's own repo.

`template` is the original `AppTemplateBase` repo.

---

## 6. Confirm the new repo is private

```bash
gh repo view lcharleslaing/SunoSongWriter --json visibility
```

Expected:

```json
{"visibility":"PRIVATE"}
```

---

## 7. Pull future template updates into the cloned app

When `AppTemplateBase` gets updates, go into the cloned app repo:

```bash
cd ~/Programming/SunoSongWriter
```

Fetch template changes:

```bash
git fetch template
```

See what template commits are available:

```bash
git log --oneline HEAD..template/main
```

Merge template updates:

```bash
git merge template/main
```

If there are conflicts, resolve them, then commit the merge.

---

## 8. Helpful package.json scripts

Optional scripts to add to cloned apps:

```json
{
  "scripts": {
    "template:check": "git fetch template && git log --oneline HEAD..template/main",
    "template:update": "git fetch template && git merge template/main"
  }
}
```

Then use:

```bash
npm run template:check
npm run template:update
```

---

## Important Rules

Do not delete `.git` after cloning the template.

Do not make `AppTemplateBase` the `origin` of cloned apps.

Do not push cloned app changes back to `AppTemplateBase`.

Each cloned app should have:

```text
origin   = its own GitHub repo
template = AppTemplateBase
```

This keeps every app independent while still allowing base template fixes to be merged later.
