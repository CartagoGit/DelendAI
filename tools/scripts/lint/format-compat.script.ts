#!/usr/bin/env bun
/**
 * format-compat.script.ts — `bun run lint:format-compat`.
 *
 * A persisted or exchanged format that delendai owns is listed once, in
 * `FORMAT_REGISTRY`, with its version, its readers and its migrations. A
 * change to the files that write or define one of them, with no new
 * version in the registry and the reader and migration that carry the old
 * one, strands every workspace written before it. This fails that change
 * before the pull request.
 *
 * The recorded versions are the ones on the integration branch (read from
 * the merge base, else from the working snapshot); `--update` re-records
 * them. The cache-layout ratchet is one case of this lint: it runs here and
 * is not a second mechanism.
 *
 * Exit codes: 0 — compatible. 1 — a format changed without its carry.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORMAT_REGISTRY } from '../../../packages/core/src/lib/compat/format-registry.constant';
import {
	CACHE_LAYOUT_EPOCH,
	CACHE_LAYOUT_MANIFEST,
} from '../../../packages/core/src/lib/contracts/constants/cache-layout.constant';
import type { IFormatEntry } from '../../../packages/core/src/lib/contracts/interfaces/format-registry.interface';
import { changedFilesScope } from '../lib/changed-files-scope';
import { declaredIntegrationRef } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';
import { judgeRatchet, manifestChecksum } from './cache-layout-ratchet.script';
import { CACHE_LAYOUT_RATCHET_SNAPSHOT_PATH } from './cache-layout-ratchet.constant';
import type { ICacheLayoutRatchetSnapshot } from './cache-layout-ratchet.interface';
import { FORMAT_COMPAT_SNAPSHOT_PATH } from './format-compat.constant';
import type {
	IFormatCompatSnapshot,
	IFormatCompatVerdict,
} from './format-compat.interface';

/** Whether a changed path is one the entry writes or defines. */
const ownsPath = (entry: IFormatEntry, path: string): boolean =>
	entry.owner.some((owned) => path === owned || path.endsWith(`/${owned}`));

/** Whether the entry can still read `version`: a reader or a migration from it. */
const readsVersion = (entry: IFormatEntry, version: number): boolean =>
	entry.previousReaders.some((reader) => reader.version === version) ||
	entry.migrations.some((migration) => migration.from === version);

/** The versions from `from` up to the current one a migration does not carry. */
const missingSteps = (entry: IFormatEntry, from: number): readonly number[] =>
	Array.from(
		{ length: Math.max(entry.currentVersion - from, 0) },
		(_, i) => from + i,
	).filter(
		(step) =>
			!entry.migrations.some(
				(migration) =>
					migration.from === step && migration.to === step + 1,
			),
	);

/** The messages for one entry against the version recorded for it. Pure. */
const judgeEntry = (
	entry: IFormatEntry,
	recorded: number | undefined,
	changed: readonly string[],
): readonly string[] => {
	if (recorded === undefined) return [];
	if (entry.currentVersion < recorded)
		return [
			`${entry.id}: the version went down (${String(recorded)} -> ${String(entry.currentVersion)}); a version only ever rises`,
		];
	if (entry.currentVersion === recorded)
		return changed.some((path) => ownsPath(entry, path))
			? [
					`${entry.id}: its writer or schema changed but the version is still ${String(recorded)}. Bump it in format-registry.constant.ts and add the reader of version ${String(recorded)} and the migration to the new one.`,
				]
			: [];
	const messages: string[] = [];
	if (!readsVersion(entry, recorded))
		messages.push(
			`${entry.id}: moved from version ${String(recorded)} with no reader of it. Add a previousReaders entry for ${String(recorded)}.`,
		);
	const missing = missingSteps(entry, recorded);
	if (missing.length > 0)
		messages.push(
			`${entry.id}: no migration for ${missing.map((v) => `${String(v)} -> ${String(v + 1)}`).join(', ')}. Add it to migrations.`,
		);
	return messages;
};

/**
 * Judge the registry against the recorded versions and the changed files.
 * Pure.
 */
export const judgeFormatCompat = (
	registry: readonly IFormatEntry[],
	recorded: IFormatCompatSnapshot,
	changed: readonly string[],
): IFormatCompatVerdict => {
	const messages = registry.flatMap((entry) =>
		judgeEntry(entry, recorded.versions[entry.id], changed),
	);
	return messages.length === 0 ? { ok: true } : { ok: false, messages };
};

/** The versions the registry has now, as the snapshot records them. Pure. */
export const currentVersions = (
	registry: readonly IFormatEntry[],
): IFormatCompatSnapshot => ({
	versions: Object.fromEntries(
		registry.map((entry) => [entry.id, entry.currentVersion]),
	),
});

/** Whether the working snapshot is the one the registry would record. Pure. */
export const snapshotIsCurrent = (
	registry: readonly IFormatEntry[],
	working: IFormatCompatSnapshot,
): boolean =>
	JSON.stringify(sorted(working.versions)) ===
	JSON.stringify(sorted(currentVersions(registry).versions));

const sorted = (versions: Readonly<Record<string, number>>): unknown =>
	Object.entries(versions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

const readJson = <T>(text: string | undefined): T | undefined => {
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
};

const readFile = (path: string): string | undefined => {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return undefined;
	}
};

/** The snapshot as the integration branch has it, when git can say. */
const baseSnapshot = (root: string): IFormatCompatSnapshot | undefined => {
	try {
		const base = git(root, [
			'merge-base',
			declaredIntegrationRef(root),
			'HEAD',
		]).trim();
		return readJson(
			git(root, ['show', `${base}:${FORMAT_COMPAT_SNAPSHOT_PATH}`]),
		);
	} catch {
		return undefined;
	}
};

/** The files the change touched: the run's list, else the diff to the merge base. */
const changedPaths = (root: string): readonly string[] => {
	const scope = changedFilesScope(root);
	if (scope !== undefined) return [...scope];
	try {
		const base = git(root, [
			'merge-base',
			declaredIntegrationRef(root),
			'HEAD',
		]).trim();
		return git(root, ['diff', '--name-only', base, 'HEAD'])
			.split('\n')
			.filter((line) => line !== '');
	} catch {
		return [];
	}
};

/** The cache-layout ratchet, as one case of this lint. */
const ratchetMessages = (root: string): readonly string[] => {
	const recorded = readJson<ICacheLayoutRatchetSnapshot>(
		readFile(join(root, CACHE_LAYOUT_RATCHET_SNAPSHOT_PATH)),
	);
	if (recorded === undefined)
		return [
			'cache-layout: no snapshot recorded; run `bun tools/scripts/lint/cache-layout-ratchet.script.ts --update`.',
		];
	const verdict = judgeRatchet(recorded, {
		epoch: CACHE_LAYOUT_EPOCH,
		checksum: manifestChecksum(CACHE_LAYOUT_MANIFEST),
	});
	return verdict.ok ? [] : [`cache-layout: ${verdict.message}`];
};

if (import.meta.main) {
	const root = repoRoot();
	const path = join(root, FORMAT_COMPAT_SNAPSHOT_PATH);
	if (process.argv.includes('--update')) {
		writeFileSync(
			path,
			`${JSON.stringify(currentVersions(FORMAT_REGISTRY), null, '\t')}\n`,
		);
		console.log('format-compat: recorded the registry versions.');
		process.exit(0);
	}
	const working = readJson<IFormatCompatSnapshot>(readFile(path));
	if (working === undefined) {
		console.error(
			'✖ format-compat: no snapshot recorded; run with --update.',
		);
		process.exit(1);
	}
	const verdict = judgeFormatCompat(
		FORMAT_REGISTRY,
		baseSnapshot(root) ?? working,
		changedPaths(root),
	);
	const messages = [
		...(verdict.ok ? [] : verdict.messages),
		...(snapshotIsCurrent(FORMAT_REGISTRY, working)
			? []
			: [
					'the snapshot is stale: run this lint with --update once the migration is in.',
				]),
		...ratchetMessages(root),
	];
	if (messages.length > 0) {
		for (const message of messages)
			console.error(`✖ format-compat: ${message}`);
		process.exit(1);
	}
	console.log(
		`✓ format-compat: ${String(FORMAT_REGISTRY.length)} formats, each carried.`,
	);
}
