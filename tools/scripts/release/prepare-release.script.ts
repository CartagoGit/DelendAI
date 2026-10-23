#!/usr/bin/env bun
/**
 * prepare-release.script.ts — the version and the changelog section a
 * promotion to main carries, from the proposals finished since the last
 * release.
 *
 *   bun run release:prepare           # print the version and the section
 *   bun run release:prepare --write   # apply the lockstep version and write the section
 *
 * A commit-level changelog of a promotion is thousands of lines; the unit
 * that says what changed here is the proposal. Every proposal that reached
 * `done/` or `review/` between the last `vX.Y.Z` tag (main, when there is
 * none) and HEAD gives one line: its title and id, grouped the
 * Keep-a-Changelog way.
 *
 * The bump is the owner's rule for a new product (2026-10-22): a release
 * is a minor unless it carries only fixes, then a patch. A breaking change
 * is a major from 1.0 on; below it, a minor, as semver reads 0.x.
 *
 * Publishing is not this script's act: it prepares what the tag the owner
 * pushes will publish (`release.yml`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

/** A finished proposal, as its frontmatter names it. */
export interface IReleasedProposal {
	readonly id: string;
	readonly kind: string;
	readonly title: string;
}

export type IReleaseBump = 'major' | 'minor' | 'patch';

/** The Keep-a-Changelog heading each proposal kind is listed under. */
const SECTION_OF: Readonly<Record<string, string>> = {
	feat: 'Added',
	fix: 'Fixed',
	refactor: 'Changed',
	perf: 'Changed',
	breaking: 'Changed',
	docs: 'Documentation',
	chore: 'Maintenance',
	test: 'Maintenance',
	infra: 'Maintenance',
	repair: 'Maintenance',
};

/** Listed by id only: they plan or judge the work the other lines ship. */
const BY_ID_ONLY = 'Plans and audits';

const SECTION_ORDER = [
	'Added',
	'Changed',
	'Fixed',
	'Documentation',
	'Maintenance',
	BY_ID_ONLY,
];

/** The bump `proposals` call for, from `current`. */
export const releaseBump = (
	proposals: readonly IReleasedProposal[],
	current: string,
): IReleaseBump => {
	const major = Number(current.split('.')[0] ?? '0');
	if (proposals.some((p) => p.kind === 'breaking') && major >= 1)
		return 'major';
	return proposals.length > 0 && proposals.every((p) => p.kind === 'fix')
		? 'patch'
		: 'minor';
};

/** `current` raised by `bump`. */
export const nextVersion = (current: string, bump: IReleaseBump): string => {
	const [major = 0, minor = 0, patch = 0] = current.split('.').map(Number);
	if (bump === 'major') return `${String(major + 1)}.0.0`;
	if (bump === 'minor') return `${String(major)}.${String(minor + 1)}.0`;
	return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
};

/** The CHANGELOG section for `version`, dated `date`. */
export const releaseSection = (
	version: string,
	date: string,
	proposals: readonly IReleasedProposal[],
): string => {
	const groups = new Map<string, string[]>();
	for (const proposal of [...proposals].sort((a, b) =>
		a.id.localeCompare(b.id),
	)) {
		const heading = SECTION_OF[proposal.kind] ?? BY_ID_ONLY;
		const line =
			heading === BY_ID_ONLY
				? proposal.id
				: `- ${proposal.title} (${proposal.id})`;
		groups.set(heading, [...(groups.get(heading) ?? []), line]);
	}
	const body = SECTION_ORDER.filter((heading) => groups.has(heading)).map(
		(heading) =>
			heading === BY_ID_ONLY
				? `### ${heading}\n\n${(groups.get(heading) ?? []).join(', ')}.`
				: `### ${heading}\n\n${(groups.get(heading) ?? []).join('\n')}`,
	);
	return [`## [${version}] — ${date}`, '', body.join('\n\n'), ''].join('\n');
};

/**
 * `changelog` with `section` placed above every earlier release, or in
 * place of the section it already has for the same version: what landed
 * between preparing a release and promoting it joins the release still
 * unpublished instead of starting the next one.
 */
export const withSection = (changelog: string, section: string): string => {
	const heading = /^## \[[^\]]+\]/u.exec(section)?.[0];
	if (heading !== undefined) {
		const start = changelog.indexOf(`${heading} `);
		if (start !== -1) {
			const rest = changelog.slice(start + heading.length);
			const next = rest.search(/^## /mu);
			const end =
				next === -1 ? changelog.length : start + heading.length + next;
			return `${changelog.slice(0, start)}${section}\n${changelog.slice(end)}`;
		}
	}
	const first = changelog.search(/^## \[/mu);
	return first === -1
		? `${changelog.trimEnd()}\n\n${section}`
		: `${changelog.slice(0, first)}${section}\n${changelog.slice(first)}`;
};

/** A proposal's id, kind and title from its frontmatter. */
export const proposalOf = (text: string): IReleasedProposal | undefined => {
	const field = (name: string): string | undefined =>
		new RegExp(`^${name}:\\s*"?(.*?)"?\\s*$`, 'mu').exec(text)?.[1];
	const id = field('id');
	const kind = field('kind');
	const title = field('title');
	return id === undefined || kind === undefined || title === undefined
		? undefined
		: { id, kind, title: title.replace(/\\"/gu, '"') };
};

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

/** The last release tag, or main when nothing was tagged yet. */
const releaseBase = (root: string): string => {
	try {
		return git(root, ['describe', '--tags', '--abbrev=0', '--match', 'v*']);
	} catch {
		return 'origin/main';
	}
};

/** The proposals that reached done/ or review/ since `base`. */
const finishedSince = (
	root: string,
	base: string,
): readonly IReleasedProposal[] => {
	const paths = git(root, [
		'diff',
		'--name-only',
		'--diff-filter=AR',
		'-M',
		base,
		'HEAD',
		'--',
		'docs/delendai/proposals/done',
		'docs/delendai/proposals/review',
	])
		.split('\n')
		.filter((path) => path.endsWith('.md'));
	const byId = new Map<string, IReleasedProposal>();
	for (const path of paths) {
		const proposal = proposalOf(readFileSync(join(root, path), 'utf8'));
		if (proposal !== undefined) byId.set(proposal.id, proposal);
	}
	return [...byId.values()];
};

const main = (): number => {
	const root = repoRoot();
	const base = releaseBase(root);
	const current = (
		JSON.parse(
			readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
		) as { readonly version: string }
	).version;
	const proposals = finishedSince(root, base);
	if (proposals.length === 0) {
		console.error(
			`✖ release:prepare: no proposal reached done or review since ${base}; there is nothing to release.`,
		);
		return 1;
	}
	// A version already prepared and not yet tagged is refreshed, not bumped again.
	const changelogPath = join(root, 'CHANGELOG.md');
	const prepared =
		readFileSync(changelogPath, 'utf8').includes(`## [${current}] `) &&
		!base.startsWith(`v${current}`);
	const version = prepared
		? current
		: nextVersion(current, releaseBump(proposals, current));
	const section = releaseSection(
		version,
		new Date().toISOString().slice(0, 10),
		proposals,
	);
	console.log(
		`release:prepare: ${String(proposals.length)} proposals since ${base}; ${current} → ${version}\n\n${section}`,
	);
	if (!process.argv.includes('--write')) return 0;
	if (!prepared)
		execFileSync(
			'bun',
			[
				'tools/scripts/release/release.script.ts',
				`--set=${version}`,
				'--write',
			],
			{ cwd: root, stdio: 'inherit' },
		);
	writeFileSync(
		changelogPath,
		withSection(readFileSync(changelogPath, 'utf8'), section),
	);
	console.log(`release:prepare: wrote ${version} and its CHANGELOG section.`);
	return 0;
};

if (import.meta.main) process.exit(main());
