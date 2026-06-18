#!/usr/bin/env bun
/**
 * derive-version.ts — decide the next lockstep version from Conventional Commits.
 *
 * "El usuario no hace nada": on a push to `main`, the release workflow runs this
 * to compute whether to release and which version, from the commits since the
 * last `vX.Y.Z` tag:
 *   - `feat:`            → minor
 *   - `fix:` / `perf:`   → patch
 *   - `…!:` / BREAKING    → major
 *   - only docs/chore/ci/test/style/build/refactor/revert → no release
 *   - anything else with content (non-conventional commit) → patch (safe default,
 *     because the repo's auto-commit sometimes writes non-conventional messages).
 *
 * No tag yet → first release publishes the version declared in package.json.
 * The next version is derived from the LAST TAG (the workflow does not commit the
 * bump back to `main`, so the tag is the source of truth — no CI loop).
 *
 *   bun scripts/derive-version.ts                 # prints JSON {release, version, bump}
 *   bun scripts/derive-version.ts --github-output # also writes release=/version= to $GITHUB_OUTPUT
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type BumpKind = 'major' | 'minor' | 'patch' | 'none';

const RELEASABLE_NONE = new Set([
	'docs',
	'chore',
	'ci',
	'test',
	'style',
	'build',
	'refactor',
	'revert',
]);

/** Parse `type(scope)!: subject` → `{ type, breaking }` (or null if no type). */
const parseHeader = (
	subject: string,
): { type: string; breaking: boolean } | null => {
	const m = subject.match(/^([a-zA-Z]+)(\([^)]*\))?(!)?:/);
	if (!m) return null;
	return { type: m[1]!.toLowerCase(), breaking: m[3] === '!' };
};

/**
 * Classify a set of commits into the strongest bump they justify. `commits` is
 * the list of full messages (subject + body, separated by newlines).
 */
export const classifyBump = (commits: readonly string[]): BumpKind => {
	const rank = { none: 0, patch: 1, minor: 2, major: 3 } as const;
	let bump: BumpKind = 'none';
	const raise = (next: BumpKind): void => {
		if (rank[next] > rank[bump]) bump = next;
	};

	for (const raw of commits) {
		const message = raw.trim();
		if (message.length === 0) continue;
		const subject = message.split('\n', 1)[0]!;
		// Skip merge commits — they carry no release intent of their own.
		if (/^Merge /.test(subject)) continue;

		const header = parseHeader(subject);
		const breakingBody = /(^|\n)BREAKING[ -]CHANGE:/.test(message);

		if (header?.breaking || breakingBody) {
			raise('major');
		} else if (header?.type === 'feat') {
			raise('minor');
		} else if (header?.type === 'fix' || header?.type === 'perf') {
			raise('patch');
		} else if (header && RELEASABLE_NONE.has(header.type)) {
			// recognised non-releasable type → contributes nothing
		} else {
			// Unrecognised / non-conventional commit with real content → patch.
			raise('patch');
		}
	}
	return bump;
};

/** Apply a bump to a `X.Y.Z` version. `none` returns the version unchanged. */
export const applyBump = (version: string, bump: BumpKind): string => {
	const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!m) throw new Error(`not a semver version: "${version}"`);
	let major = Number(m[1]);
	let minor = Number(m[2]);
	let patch = Number(m[3]);
	if (bump === 'major') {
		major += 1;
		minor = 0;
		patch = 0;
	} else if (bump === 'minor') {
		minor += 1;
		patch = 0;
	} else if (bump === 'patch') {
		patch += 1;
	}
	return `${major}.${minor}.${patch}`;
};

export interface IVersionDecision {
	readonly release: boolean;
	readonly version: string;
	readonly bump: BumpKind;
	readonly lastTag: string | null;
}

const git = (args: string[], cwd: string): string => {
	try {
		return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	} catch {
		return '';
	}
};

// git separates each commit body with a NUL byte (`%x00`); split on it.
const NUL = String.fromCharCode(0);

/** Compute the release decision for the repo at `root`. */
export const decideVersion = (root: string): IVersionDecision => {
	const corePkg = JSON.parse(
		readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
	) as { version: string };

	const lastTag =
		git(['tag', '--list', 'v*', '--sort=-v:refname'], root)
			.split('\n')
			.filter(Boolean)[0] ?? null;

	// First release ever → publish the declared version as-is.
	if (!lastTag) {
		return {
			release: true,
			version: corePkg.version,
			bump: 'none',
			lastTag: null,
		};
	}

	const base = lastTag.replace(/^v/, '');
	const log = git(
		['log', `${lastTag}..HEAD`, '--no-merges', '--format=%B%x00'],
		root,
	);
	const commits = log
		.split(NUL)
		.map((c) => c.trim())
		.filter(Boolean);
	const bump = classifyBump(commits);
	if (bump === 'none') {
		return { release: false, version: base, bump, lastTag };
	}
	return { release: true, version: applyBump(base, bump), bump, lastTag };
};

// CLI ------------------------------------------------------------------------
if (import.meta.main) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const decision = decideVersion(root);
	console.log(JSON.stringify(decision));
	if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			`release=${decision.release}\nversion=${decision.version}\nbump=${decision.bump}\n`,
		);
	}
}
