# Publishing Guide

OpenStory publishes its four packages to npm via GitHub Actions on a version tag
(mirrors the `@gobrand/tiempo` / `@gobrand/calendar` setup).

Published packages:

- `@gobrand/openstory-config`
- `@gobrand/openstory-runtime`
- `@gobrand/openstory-vite`

(`openstory-desktop` and the examples stay private.)

## One-time setup

### Add the npm token to GitHub Secrets

1. Create a **granular access token** at https://www.npmjs.com/settings/~/tokens
   - Publish rights to the `@gobrand` scope
   - **"Bypass 2FA" enabled** (CI can't enter an OTP)
2. Add it as a repo secret:
   - https://github.com/go-brand/openstory/settings/secrets/actions
   - Name: `NPM_TOKEN`, value: the `npm_…` token
   - Or: `gh secret set NPM_TOKEN` (paste when prompted)

Only needed once.

## Releasing

The packages share one synced version.

### First release (current version, no bump)

Versions are already at the intended number — tag and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Subsequent releases (bump + tag + push)

```bash
pnpm release patch   # 0.1.0 → 0.1.1  (fixes)
pnpm release minor   # 0.1.0 → 0.2.0  (features)
pnpm release major   # 0.1.0 → 1.0.0  (breaking)
```

`scripts/release.sh` runs tests + typecheck + build, bumps all four packages,
commits, tags `vX.Y.Z`, and pushes. The tag triggers `.github/workflows/ci.yml`,
which builds and runs `pnpm --filter <pkg> publish --access public --no-git-checks`
for each package using `NPM_TOKEN`.

Internal deps use `workspace:^`; pnpm rewrites them to `^X.Y.Z` at publish time.

## Verify

```bash
npm view @gobrand/openstory-config version
```
