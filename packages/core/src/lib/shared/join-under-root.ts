/**
 * join-under-root.ts — `path.join` treats every argument as a segment to
 * concatenate, even one that looks absolute: `join('/a', '/b')` returns
 * `/a/b`, not `/b`. A caller passing a genuinely absolute override (e.g.
 * a `cacheDir` config option meant to escape the workspace on purpose)
 * gets a silently mangled path instead of the override they intended —
 * only `path.resolve` treats an absolute segment as a reset, and callers
 * building "root + optional absolute override" paths want that reset
 * without `resolve`'s other behavior (it also normalizes `..` past the
 * root, which callers of this helper are already choosing not to guard
 * against — see the note below).
 *
 * Several plugins had hand-rolled `isAbsolute(x) ? x : join(root, x)`
 * checks for this exact case (search's cache-dir resolution, i18n's
 * locales dir). This centralizes it (x00157 S5).
 *
 * Not a containment primitive: unlike `resolveWorkspaceContained`, this
 * does not reject an absolute or escaping `rel` — it deliberately HONORS
 * one, because the caller's `rel` here is a trusted config/option value
 * (a cache directory override), not untrusted tool input. Never use this
 * for a path that originates from an LLM tool argument; use
 * `resolveWorkspaceContained`/`resolveAgainstRoots` for that instead.
 */
import { isAbsolute, join } from 'node:path';

export const joinUnderRoot = (rootAbs: string, rel: string): string =>
	isAbsolute(rel) ? rel : join(rootAbs, rel);
