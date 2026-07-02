# Next.js / Payload / React Version Compatibility Notes

Reference for checking whether it's safe to upgrade Next.js, Payload, or React, without re-researching from scratch each time. Written after downgrading Next.js 16.2.3 → 15.4.11 (see `docs/serverless-migration.md` for why).

## Current pinned versions

- `next`: 15.4.11
- `payload` / `@payloadcms/*`: 3.82.1
- `react` / `react-dom`: 19.2.4

## Known constraints

### Payload 3.82.1 → Next.js peer dependency

Exact range, read from `node_modules/@payloadcms/next/package.json` and `node_modules/@payloadcms/ui/package.json`:

```
>=15.2.9 <15.3.0 || >=15.3.9 <15.4.0 || >=15.4.11 <15.5.0 || >=16.2.2 <17.0.0
```

This is a narrow, **gapped** range — most Next 15.x patch versions are NOT allowed, only specific windows. Before bumping Next.js, re-check this exact range against whatever Payload version is installed:

```bash
grep '"next":' node_modules/@payloadcms/next/package.json node_modules/@payloadcms/ui/package.json
```

Payload updates this range across releases, so don't assume last time's range still applies.

### Payload 3.82.1 → React peer dependency (`@payloadcms/ui`)

```
^19.0.1 || ^19.1.2 || ^19.2.1
```

Also gapped, not a simple floor.

### Next.js 15.4.11 → React peer dependency

```
^18.2.0 || 19.0.0-rc-... || ^19.0.0
```

Broader — allows React 19.x generally. Confirmed via `npm view next@15.4.11 peerDependencies`.

### Why we're on 15.4.11, not 16.x

Next.js 16 makes Turbopack the mandatory bundler for `next build` (no webpack fallback without an explicit `--webpack` flag). Turbopack hashes native modules like `sharp` with random suffixes in a way that breaks Lambda cold-start module resolution when deploying via OpenNext. This killed an earlier serverless migration attempt (see `docs/serverless-migration.md`'s history note). Downgrading to 15.4.11 — the latest release in Payload's allowed 15.x window — restores webpack as the default production bundler, avoiding the issue, without losing Payload compatibility.

If a future OpenNext/Turbopack fix resolves the sharp-hashing issue, or Payload's allowed range shifts further into 16.x with the fix confirmed, re-upgrading to 16 becomes viable again. Check both the OpenNext changelog and Payload's peer-dependency range before doing so.

### `turbopack` config key placement — verified empirically, contradicts some docs

Next.js's own 15.4 blog post describes the config key as `experimental.turbopack` for 15.x, moving to a top-level `turbopack` key only in 16. **In practice, on this exact stack (Next 15.4.11 + Payload 3.82.1), the top-level key is what works.** Nesting it under `experimental` produces a real Next.js config validation error at dev-server startup:

```
⚠ Invalid next.config.ts options detected:
⚠     Unrecognized key(s) in object: 'turbopack' at "experimental"
```

Payload also prints its own message when this happens, which is a red herring — it says the warning "only occurs on Next.js 15.2.x or lower," implying the *nested* form is what's expected on newer 15.x, which is the opposite of what actually works here. Trust the Next.js validation error, not Payload's message, on this point. Current `next.config.ts` uses the top-level `turbopack: { root: ... }` shape — this is correct, don't move it to `experimental` again without re-testing.

### `middleware.ts` vs `proxy.ts`

- Next 15.x and earlier: `middleware.ts` is the standard/only convention.
- Next 16.x: `middleware.ts` renamed to `proxy.ts` (deprecated but still supported as of 16.2.x, not yet removed).

No action needed on 15.4.11 — this repo has always used `middleware.ts`.

### `unstable_cache` (next/cache)

Confirmed unchanged between Next 15 and 16 — still fully functional, labeled "legacy" as a forward-looking signal only, not deprecated or removed. No action needed regardless of Next version. Used in `src/utilities/getGlobals.ts`, `getRedirects.ts`, `getDocument.ts`, and both sitemap routes under `src/app/(frontend)/(sitemaps)/`.

### `revalidateTag` — REAL breaking change, caught during implementation (not research)

This one was missed during pre-downgrade research and only surfaced as a TypeScript build error. Next.js 16 requires a second `cacheLife` profile argument: `revalidateTag(tag, 'max')`. **Next 15.4.11's types reject the second argument** ("Expected 1 arguments, but got 2"). All 9 call sites across `src/collections/Pages/hooks/revalidatePage.ts`, `src/collections/Posts/hooks/revalidatePost.ts`, `src/Header/hooks/revalidateHeader.ts`, `src/Footer/hooks/revalidateFooter.ts`, and `src/hooks/revalidateRedirects.ts` were reverted to the single-argument form (`revalidateTag(tag)`) for this downgrade. **If upgrading back to Next 16+, these all need the second argument added back.**

### `eslint-config-next` flat-config shape — REAL breaking change, also caught during implementation

`eslint-config-next@16.x` ships native ESLint flat-config arrays, importable directly (`import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'`). `eslint-config-next@15.4.11` ships the legacy eslintrc shape (`module.exports = { extends: [...] }`) — importing it directly into a flat `eslint.config.mjs` fails with `nextCoreWebVitals is not iterable`. Fix: bridge through `@eslint/eslintrc`'s `FlatCompat` (see `eslint.config.mjs` — this is the current, correct state for 15.4.11):

```js
import { FlatCompat } from '@eslint/eslintrc'
const compat = new FlatCompat({ baseDirectory: __dirname })
const eslintConfig = [...compat.extends('next/core-web-vitals', 'next/typescript'), ...]
```

`@eslint/eslintrc` must be a devDependency for this (`^3.2.0`). **If upgrading back to Next 16+, switch back to the direct flat-config imports and this dependency can be removed again** — see git commit `c18004b` for that exact pattern.

### `next/image` config (`localPatterns`, `qualities`)

Both compatible across 15.x and 16.x — no changes needed either direction.

### Unrelated gotcha: broken npm install after a version bump

After bumping `next`'s version, `npm install` can leave an empty, broken package directory behind for a transitive dependency (hit this with `@aws-sdk/client-s3`, pulled in via `@payloadcms/storage-s3` → `@aws-sdk/lib-storage`) — the directory exists but has zero files, causing a `Module not found` bundling error that looks like a real compatibility break but isn't. If a "missing module" error appears right after a dependency version change, check whether the package directory is actually empty before assuming it's a real incompatibility:

```bash
ls node_modules/<suspect-package>/   # empty output = broken install, not a real issue
rm -rf node_modules/<suspect-package> && npm install
```

## How to re-check before any future Next.js/Payload/React upgrade

1. `grep '"next":' node_modules/@payloadcms/next/package.json node_modules/@payloadcms/ui/package.json` — get the CURRENT allowed Next.js range (it changes across Payload releases).
2. `npm view next@<candidate-version> peerDependencies` — check the React range for the candidate Next version.
3. Check whether OpenNext/Turbopack's native-module (sharp) Lambda bundling issue has been resolved, if considering Next 16+ again for serverless deployment.
4. `grep -rn "revalidateTag(" src/` — confirm argument count matches the target version's requirement (one arg on 15.x, two on 16.x).
5. Check `eslint.config.mjs` against the installed `eslint-config-next`'s actual export shape (`cat node_modules/eslint-config-next/core-web-vitals.js`) — array export vs. `{ extends: [...] }` object determines whether `FlatCompat` bridging is needed.
6. Re-run the full test suite (`npm test`) and a full `npm run build`, and check the build banner — the presence or absence of `(Turbopack)` next to the version number tells you which bundler actually ran.
