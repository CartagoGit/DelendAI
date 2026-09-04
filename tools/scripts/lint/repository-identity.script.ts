#!/usr/bin/env bun
/**
 * repository-identity.script.ts — b00239.
 *
 * Refuses a second copy of the repository slug.
 *
 * `packages/core/src/lib/contracts/constants/repository-identity.constant.ts`
 * declares where this project lives. Everything else is supposed to import
 * it. The point is that renaming the repository becomes one edit — and the
 * only thing that makes a one-line rename trustworthy is a check proving
 * nothing kept a private copy.
 *
 * Before this existed the slug appeared 227 times across 119 files:
 * `DEFAULT_TARGET_REPO` in error-reporting, three manifest `repository.url`
 * fields, the shared-UI strings, and half a dozen CI and generator
 * scripts. A rename would have left the ones nobody found pointing at a
 * slug that keeps working only because GitHub redirects — which is the
 * worst kind of stale reference, since nothing fails.
 *
 * ## What is allowed, and why
 *
 * Manifest `repository.url` fields cannot import a constant: npm reads
 * them as literal JSON. They are checked for AGREEMENT with the constant
 * instead, which is the same guarantee by another route.
 *
 * Tests, docs and proposals may spell it out. A fixture asserting the
 * literal slug is testing the real thing, and a proposal is a record of
 * what was true when it was written.
 *
 * Ratchet: existing occurrences are baselined, new ones fail. `--update`
 * rebaselines.
 *
 * Exit: 0 clean, 1 new occurrences or a manifest that disagrees.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
	REPOSITORY_NAME,
	REPOSITORY_OWNER,
	REPOSITORY_SLUG,
} from '@mcp-vertex/core/public';

const BASELINE = 'tools/scripts/lint/repository-identity.baseline.json';

/** The file that is allowed — required — to spell the slug out. */
const DECLARATION =
	'packages/core/src/lib/contracts/constants/repository-identity.constant.ts';

/** Roots that must import rather than repeat. */
const SOURCE_ROOTS = ['packages', 'plugins', 'apps', 'extensions', 'tools'];

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'tests',
	'__fixtures__',
]);

const SOURCE_EXTS = /\.(?:ts|tsx|mts|cts)$/;
const TEST_FILE = /\.(?:spec|test|e2e)\.[cm]?tsx?$/;

export interface IIdentityFinding {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

export const findingKey = (finding: IIdentityFinding): string =>
	`${finding.file}::${finding.text}`;

/**
 * Occurrences of the slug in one file's text.
 *
 * Matches `owner/name` rather than the name alone: the bare project name
 * appears legitimately everywhere (paths, package scopes, prose), and a
 * check that flagged all of it would be turned off within a day.
 */
export const findSlugOccurrences = (
	file: string,
	text: string,
): readonly IIdentityFinding[] => {
	const findings: IIdentityFinding[] = [];
	const lines = text.split('\n');
	for (const [index, line] of lines.entries()) {
		if (!line.includes(REPOSITORY_SLUG)) continue;
		findings.push({ file, line: index + 1, text: line.trim() });
	}
	return findings;
};

const walk = (dir: string, root: string, out: string[]): void => {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		if (SKIP_DIRS.has(entry)) continue;
		if (statSync(full).isDirectory()) {
			walk(full, root, out);
			continue;
		}
		if (!SOURCE_EXTS.test(entry) || TEST_FILE.test(entry)) continue;
		out.push(relative(root, full));
	}
};

/**
 * Manifests must AGREE with the constant, since they cannot import it.
 *
 * Returns the manifests whose `repository.url` names a different slug —
 * the one failure mode a ratchet cannot express, because a disagreeing
 * manifest is wrong today, not debt to burn down.
 */
export const findManifestDisagreements = (root: string): readonly string[] => {
	const bad: string[] = [];
	for (const group of ['packages', 'plugins', 'apps', 'extensions']) {
		let names: string[];
		try {
			names = readdirSync(join(root, group));
		} catch {
			continue;
		}
		for (const name of names) {
			const manifest = join(root, group, name, 'package.json');
			let raw: string;
			try {
				raw = readFileSync(manifest, 'utf8');
			} catch {
				continue;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				continue;
			}
			const repository = (parsed as { repository?: unknown }).repository;
			const url =
				typeof repository === 'string'
					? repository
					: typeof (repository as { url?: unknown })?.url === 'string'
						? (repository as { url: string }).url
						: undefined;
			if (url === undefined) continue;
			if (url.includes(REPOSITORY_SLUG)) continue;
			// A manifest naming a DIFFERENT repository under the same owner
			// is the rename half-applied; one naming another owner entirely
			// is somebody else's project and not ours to judge.
			if (!url.includes(`${REPOSITORY_OWNER}/`)) continue;
			bad.push(`${group}/${name}/package.json → ${url}`);
		}
	}
	return bad;
};

const main = (): number => {
	const update = process.argv.includes('--update');
	const root = process.cwd();

	const files: string[] = [];
	for (const source of SOURCE_ROOTS) walk(join(root, source), root, files);

	if (files.length === 0) {
		console.error(
			'repository-identity: scanned ZERO files; refusing to report ok',
		);
		return 1;
	}

	const findings: IIdentityFinding[] = [];
	for (const file of files) {
		if (file === DECLARATION) continue;
		let text: string;
		try {
			text = readFileSync(join(root, file), 'utf8');
		} catch {
			continue;
		}
		findings.push(...findSlugOccurrences(file, text));
	}

	if (update) {
		writeFileSync(
			BASELINE,
			`${JSON.stringify(findings.map(findingKey).sort(), null, 2)}\n`,
			'utf8',
		);
		console.log(
			`repository-identity: baseline updated — ${findings.length} occurrence(s) across ${files.length} source file(s).`,
		);
		return 0;
	}

	const baseline: string[] = (() => {
		try {
			return JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];
		} catch {
			return [];
		}
	})();
	const known = new Set(baseline);
	const fresh = findings.filter((f) => !known.has(findingKey(f)));
	const manifests = findManifestDisagreements(root);

	if (fresh.length === 0 && manifests.length === 0) {
		console.log(
			`repository-identity: no new hardcoded slugs (${baseline.length} baselined, ${files.length} source files scanned).`,
		);
		return 0;
	}

	if (manifests.length > 0) {
		console.error(
			`repository-identity: ${manifests.length} manifest(s) name a different repository than ${REPOSITORY_SLUG}:`,
		);
		for (const entry of manifests) console.error(`  ${entry}`);
		console.error(
			'\nManifests cannot import the constant — npm reads them as literal JSON — so they\n' +
				'are checked for agreement instead. Update them to match, or update the constant\n' +
				'if the repository really moved.',
		);
	}

	if (fresh.length > 0) {
		console.error(
			`\nrepository-identity: ${fresh.length} new hardcoded slug(s):`,
		);
		for (const finding of fresh)
			console.error(
				`  ${finding.file}:${finding.line}\n    ${finding.text}`,
			);
		console.error(
			`\nImport { REPOSITORY_SLUG } from '@mcp-vertex/core/public' instead of writing\n` +
				`"${REPOSITORY_OWNER}/${REPOSITORY_NAME}". A private copy is a copy that survives a\n` +
				'rename by pointing at a redirect, which is the worst kind of stale reference\n' +
				'because nothing fails.',
		);
	}
	return 1;
};

if (import.meta.main) process.exit(main());
