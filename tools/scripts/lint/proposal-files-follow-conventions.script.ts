#!/usr/bin/env bun
/**
 * proposal-files-follow-conventions.script.ts — ratchet lint: a file an
 * unfinished proposal declares, and that does not exist yet, must be named
 * the way `lint:file-conventions` will accept once it exists.
 *
 * The name is chosen when the proposal is written, but the convention lint
 * only sees it after the code is. Judging the declared name at the
 * proposal moves the failure to the point where renaming costs one line.
 *
 * Scope and rules are the ones of `file-conventions.script.ts`: the same
 * scan roots, the same walker exclusions, the same classifier. Only
 * `ready/` and `in-progress/` are judged; finished work already has files.
 *
 * Usage:
 *   bun tools/scripts/lint/proposal-files-follow-conventions.script.ts
 *   bun tools/scripts/lint/proposal-files-follow-conventions.script.ts --baseline=<path>
 *   bun tools/scripts/lint/proposal-files-follow-conventions.script.ts --write-baseline=<path>
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import {
	FILES_BLOCK_RE,
	extractPathCandidates,
	stripLineRefs,
	walkMarkdown,
} from './proposal-files-exist.script';
import { classifyPath, DEFAULT_TS_RULES } from './file-conventions';

export interface IConventionFinding {
	readonly proposal: string;
	readonly slice: string;
	readonly path: string;
	readonly expected: string;
}

const PROPOSALS_ROOT = 'docs/delendai/proposals';
const JUDGED_DIRS: readonly string[] = ['ready', 'in-progress'];

/** The roots `lint:file-conventions` scans by default. */
const SCAN_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'extensions',
	'apps',
	'docs/delendai/examples',
	'tools',
];

/** Directories the shared TypeScript walker never enters. */
const SKIPPED_SEGMENTS: ReadonlySet<string> = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
]);

/** Role suffixes tried, in order, when deriving the accepted file name. */
const SUFFIXES_TO_TRY: readonly string[] = [
	'service',
	'helper',
	'tool',
	'factory',
	'registry',
	'builder',
	'engine',
	'constant',
	'interface',
];

const SLICE_HEADING_RE = /^###\s+(\S+)/gm;

/** True when the file-conventions lint would have this path in scope. */
export const isJudgedPath = (path: string): boolean => {
	if (!/\.tsx?$/.test(path) || /\.d\.tsx?$/.test(path)) return false;
	if (!SCAN_ROOTS.some((scanRoot) => path.startsWith(`${scanRoot}/`)))
		return false;
	return !path.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment));
};

/** True when the classifier assigns the path a role. */
export const hasRole = (path: string): boolean =>
	classifyPath(path, DEFAULT_TS_RULES) !== 'other';

/** What the convention would accept for a refused path. */
export const expectedName = (path: string): string => {
	const slash = path.lastIndexOf('/');
	const folder = path.slice(0, slash + 1);
	const base = path.slice(slash + 1);
	const stem = base.replace(/\.tsx?$/, '');
	const ext = base.slice(stem.length);
	if (stem === 'index')
		return 'no barrel here: only `src/index.ts` and `src/public/index.ts` are barrels, so name the files that hold the code';
	for (const suffix of SUFFIXES_TO_TRY) {
		const candidate = `${folder}${stem}.${suffix}${ext}`;
		if (hasRole(candidate)) return `\`${candidate}\``;
	}
	return `a role suffix such as ${SUFFIXES_TO_TRY.map((s) => `.${s}`).join(', ')}, or a folder that names a role`;
};

const sliceOf = (text: string, index: number): string => {
	let slice = '-';
	for (const match of text.slice(0, index).matchAll(SLICE_HEADING_RE))
		slice = match[1] ?? slice;
	return slice;
};

/** Pure over the working tree: every declared, missing path with no role. */
export const findConventionDrift = (
	root: string,
): readonly IConventionFinding[] => {
	const findings: IConventionFinding[] = [];
	for (const dir of JUDGED_DIRS) {
		const abs = join(root, PROPOSALS_ROOT, dir);
		if (!existsSync(abs)) continue;
		const documents: string[] = [];
		walkMarkdown(abs, documents);
		for (const document of documents.sort()) {
			const text = readFileSync(document, 'utf8');
			const proposal = relative(root, document).split('\\').join('/');
			for (const block of text.matchAll(FILES_BLOCK_RE)) {
				const slice = sliceOf(text, block.index ?? 0);
				for (const declared of extractPathCandidates(block[1] ?? '')) {
					const path = stripLineRefs(declared);
					if (!isJudgedPath(path)) continue;
					if (existsSync(join(root, path))) continue;
					if (hasRole(path)) continue;
					findings.push({
						proposal,
						slice,
						path,
						expected: expectedName(path),
					});
				}
			}
		}
	}
	return findings;
};

const keyOf = (finding: IConventionFinding): string =>
	`${finding.proposal}|${finding.path}`;

const readBaseline = async (path: string): Promise<ReadonlySet<string>> => {
	const raw = await readFile(path, 'utf8').catch(() => null);
	if (raw === null) return new Set();
	try {
		const parsed = JSON.parse(raw) as unknown;
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((v): v is string => typeof v === 'string')
				: [],
		);
	} catch {
		return new Set();
	}
};

const flagValue = (args: readonly string[], flag: string): string | undefined =>
	args.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const describe = (finding: IConventionFinding): string =>
	`  ${finding.proposal} ${finding.slice}: \`${finding.path}\` has no role; the convention expects ${finding.expected}`;

export const main = async (argv: readonly string[]): Promise<number> => {
	const args = argv.slice(2);
	const findings = findConventionDrift(repoRoot());

	const writeTo = flagValue(args, '--write-baseline');
	if (writeTo !== undefined) {
		const keys = [...new Set(findings.map(keyOf))].sort();
		await writeFile(
			writeTo,
			`${JSON.stringify(keys, null, '\t')}\n`,
			'utf8',
		);
		process.stderr.write(
			`proposal-files-follow-conventions: baseline written — ${keys.length} accepted finding(s) at ${writeTo}\n`,
		);
		return 0;
	}

	const baselinePath = flagValue(args, '--baseline');
	const baseline =
		baselinePath === undefined
			? new Set<string>()
			: await readBaseline(baselinePath);
	const fresh = findings.filter((f) => !baseline.has(keyOf(f)));
	if (fresh.length === 0) {
		process.stderr.write(
			`✓ proposal-files-follow-conventions: no declared file name the conventions refuse (${findings.length} baselined).\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✖ proposal-files-follow-conventions: ${fresh.length} declared file name(s) the file conventions refuse:\n${fresh.map(describe).join('\n')}\n\n` +
			`  Rename the path in the proposal's Files now; lint:file-conventions refuses it once the file exists.\n`,
	);
	return 1;
};

if (import.meta.main) process.exit(await main(process.argv));
