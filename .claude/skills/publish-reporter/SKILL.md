---
name: publish-reporter
description: Build and publish the @radekbednarik/playwright-cart-reporter package to GitHub Packages. Use when cutting a new release of the reporter.
disable-model-invocation: true
---

Publish the Playwright Cart reporter to GitHub Packages:

```bash
# 1. Ensure NODE_AUTH_TOKEN is set (needs write:packages scope on GitHub)
echo $NODE_AUTH_TOKEN

# 2. Build the package
pnpm --filter @radekbednarik/playwright-cart-reporter build

# 3. Publish (--no-git-checks bypasses the clean working tree requirement)
pnpm --filter @radekbednarik/playwright-cart-reporter publish --no-git-checks
```

**Before publishing:**
- Bump the version in `packages/reporter/package.json`
- Ensure the build succeeds (`dist/` is populated)
- Confirm `NODE_AUTH_TOKEN` has `write:packages` scope

**Registry:** `https://npm.pkg.github.com/` (configured in `packages/reporter/package.json` → `publishConfig`)

**Note:** Publishing is also triggered automatically when a GitHub Release is created via the `publish-reporter.yml` workflow.
