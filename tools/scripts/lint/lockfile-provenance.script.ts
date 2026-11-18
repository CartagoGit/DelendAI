#!/usr/bin/env bun
/**
 * lockfile-provenance.script.ts — every lockfile entry comes from the npm
 * registry with an integrity hash, and a version added or changed against
 * the integration branch is older than the install cooldown.
 *
 * Reads: `bun.lock` (every entry), `bunfig.toml` (the cooldown,
 * `install.minimumReleaseAge`, the one source of truth bun itself uses),
 * `bun.lock` at the integration branch (to know what changed) and
 * `config/delendai/lockfile-provenance-exceptions.json`. For each changed
 * version it asks the npm registry for its publish time.
 *
 * `bun audit` knows a malicious version only after somebody reported it;
 * the usual vector is a compromised maintainer publishing a version that
 * is pulled within hours or days. Waiting out the cooldown, and refusing
 * anything that does not resolve from the registry with a hash, closes
 * that window for the lockfile.
 *
 * An entry that has a reason to be foreign (a git dependency, say) is
 * listed in the exceptions file with its reason and an `until` date; an
 * expired exception fails like the entry itself.
 *
 * Exit codes:
 *   0 — every entry registry-sourced and hashed, no changed version
 *       younger than the cooldown (or excepted in date).
 *   1 — a finding, an expired exception, or a check that could not run
 *       (an unreadable registry or lockfile is not a pass).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'jsonc-parser';

import { lintRepoRoot, refuseMissingScanRoots } from './lib/scan-roots.lib';

const REGISTRY = 'https://registry.npmjs.org/';
const INTEGRITY = /^sha(?:256|384|512)-\S+$/u;

export interface ILockEntry {
	readonly name: string;
	readonly version: string;
	/** Why the entry is not acceptable, or `undefined` when it is. */
	readonly problem: string | undefined;
}

export interface IProvenanceException {
	readonly package: string;
	readonly version?: string;
	readonly reason: string;
	readonly until: string;
}

/** Asks the registry when `name@version` was published (ISO time), `undefined` when it does not say. */
export type PublishTimeReader = (
	name: string,
	version: string,
) => Promise<string | undefined>;

const splitId = (id: string): { name: string; spec: string } => {
	const at = id.indexOf('@', 1);
	return at < 0
		? { name: id, spec: '' }
		: { name: id.slice(0, at), spec: id.slice(at + 1) };
};

/** Every entry of `bun.lock` text, classified. */
export const readLockEntries = (text: string): readonly ILockEntry[] => {
	const lock = parse(text) as {
		readonly packages?: Readonly<Record<string, readonly unknown[]>>;
	};
	return Object.values(lock.packages ?? {}).map((entry) => {
		const id = String(entry[0]);
		let { name, spec } = splitId(id);
		if (spec.startsWith('workspace:'))
			return { name, version: spec, problem: undefined };
		if (spec.startsWith('npm:')) {
			const alias = splitId(spec.slice(4));
			name = alias.name;
			spec = alias.spec;
		}
		if (!/^\d+\.\d+\.\d+/u.test(spec))
			return {
				name,
				version: spec,
				problem: `not resolved from the npm registry (${spec})`,
			};
		const source = entry[1];
		if (
			typeof source === 'string' &&
			source !== '' &&
			!source.startsWith(REGISTRY)
		)
			return {
				name,
				version: spec,
				problem: `resolved from ${source}, not the npm registry`,
			};
		const integrity = entry[entry.length - 1];
		if (typeof integrity !== 'string' || !INTEGRITY.test(integrity))
			return { name, version: spec, problem: 'has no integrity hash' };
		return { name, version: spec, problem: undefined };
	});
};

/** The cooldown in seconds `bunfig.toml` declares, or `undefined`. */
export const readCooldown = (bunfig: string): number | undefined => {
	const found = /^\s*minimumReleaseAge\s*=\s*(\d+)/mu.exec(bunfig)?.[1];
	return found === undefined ? undefined : Number(found);
};

/** The entries of `current` that `base` does not carry at the same version. */
export const changedEntries = (
	current: readonly ILockEntry[],
	base: readonly ILockEntry[],
): readonly ILockEntry[] => {
	const known = new Set(base.map((e) => `${e.name}@${e.version}`));
	return current.filter(
		(e) =>
			!e.version.startsWith('workspace:') &&
			!known.has(`${e.name}@${e.version}`),
	);
};

export interface IProvenanceVerdict {
	readonly toFix: readonly string[];
	readonly expired: readonly string[];
	readonly excepted: readonly string[];
}

const findException = (
	exceptions: readonly IProvenanceException[],
	name: string,
	version: string,
): IProvenanceException | undefined =>
	exceptions.find(
		(e) =>
			e.package === name &&
			(e.version === undefined || e.version === version),
	);

/** What the findings mean once the exceptions are applied on `today`. */
export const judgeProvenance = (
	findings: readonly {
		readonly name: string;
		readonly version: string;
		readonly problem: string;
	}[],
	exceptions: readonly IProvenanceException[],
	today: string,
): IProvenanceVerdict => {
	const toFix: string[] = [];
	const expired: string[] = [];
	const excepted: string[] = [];
	for (const f of findings) {
		const line = `${f.name}@${f.version}: ${f.problem}`;
		const exception = findException(exceptions, f.name, f.version);
		if (exception === undefined) toFix.push(line);
		else if (exception.until < today)
			expired.push(`${line} (excepted until ${exception.until})`);
		else excepted.push(line);
	}
	return { toFix, expired, excepted };
};

/** The changed entries published less than `cooldownSeconds` before `now`, as findings. */
export const youngEntries = async (
	changed: readonly ILockEntry[],
	cooldownSeconds: number,
	now: Date,
	read: PublishTimeReader,
): Promise<readonly { name: string; version: string; problem: string }[]> => {
	const found: { name: string; version: string; problem: string }[] = [];
	for (const entry of changed) {
		if (entry.problem !== undefined) continue;
		const published = await read(entry.name, entry.version);
		if (published === undefined)
			throw new Error(
				`the registry gave no publish time for ${entry.name}@${entry.version}`,
			);
		const age = (now.getTime() - new Date(published).getTime()) / 1000;
		if (age < cooldownSeconds)
			found.push({
				name: entry.name,
				version: entry.version,
				problem: `published ${published}, younger than the ${String(cooldownSeconds)} s cooldown in bunfig.toml`,
			});
	}
	return found;
};

/** The registry read: one packument per package, its `time` map. */
export const registryPublishTime = (
	fetchFn: (url: string) => Promise<Response> = fetch,
): PublishTimeReader => {
	const cache = new Map<string, Promise<Record<string, string>>>();
	return async (name, version) => {
		let times = cache.get(name);
		if (times === undefined) {
			times = (async () => {
				const response = await fetchFn(
					`${REGISTRY}${name.replace('/', '%2f')}`,
				);
				if (!response.ok)
					throw new Error(
						`the registry answered ${String(response.status)} for ${name}`,
					);
				return (
					(
						(await response.json()) as {
							readonly time?: Record<string, string>;
						}
					).time ?? {}
				);
			})();
			cache.set(name, times);
		}
		return (await times)[version];
	};
};

const BASE_REF = 'origin/develop';

export const main = async (
	read: PublishTimeReader = registryPublishTime(),
	now: Date = new Date(),
): Promise<number> => {
	const root = lintRepoRoot(import.meta.url);
	if (
		refuseMissingScanRoots('lockfile-provenance', root, [
			'bun.lock',
			'bunfig.toml',
		])
	)
		return 1;
	const entries = readLockEntries(
		readFileSync(join(root, 'bun.lock'), 'utf8'),
	);
	if (entries.length === 0) {
		console.error(
			'✖ lockfile-provenance: bun.lock lists no entry, so nothing was checked.',
		);
		return 1;
	}
	const cooldown = readCooldown(
		readFileSync(join(root, 'bunfig.toml'), 'utf8'),
	);
	if (cooldown === undefined) {
		console.error(
			'✖ lockfile-provenance: bunfig.toml sets no install.minimumReleaseAge, so there is no cooldown to enforce.',
		);
		return 1;
	}
	let base: readonly ILockEntry[];
	try {
		base = readLockEntries(
			execFileSync('git', ['show', `${BASE_REF}:bun.lock`], {
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				maxBuffer: 1 << 28,
			}),
		);
	} catch {
		console.error(
			`✖ lockfile-provenance: bun.lock at ${BASE_REF} could not be read, so the changed entries are unknown.`,
		);
		return 1;
	}
	const changed = changedEntries(entries, base);
	let young: Awaited<ReturnType<typeof youngEntries>>;
	try {
		young = await youngEntries(changed, cooldown, now, read);
	} catch (error) {
		console.error(
			`✖ lockfile-provenance: the registry could not be read (${error instanceof Error ? error.message : String(error)}).`,
		);
		return 1;
	}
	const { exceptions } = JSON.parse(
		readFileSync(
			join(root, 'config/delendai/lockfile-provenance-exceptions.json'),
			'utf8',
		),
	) as { readonly exceptions: readonly IProvenanceException[] };
	const foreign = entries.flatMap((e) =>
		e.problem === undefined
			? []
			: [{ name: e.name, version: e.version, problem: e.problem }],
	);
	const verdict = judgeProvenance(
		[...foreign, ...young],
		exceptions,
		now.toISOString().slice(0, 10),
	);
	for (const line of verdict.excepted) console.log(`  excepted ${line}`);
	if (verdict.toFix.length === 0 && verdict.expired.length === 0) {
		console.log(
			`✓ lockfile-provenance: read ${String(entries.length)} bun.lock entries (${String(changed.length)} new or changed against ${BASE_REF}); all registry-sourced with a hash, none younger than ${String(cooldown)} s (${String(verdict.excepted.length)} excepted).`,
		);
		return 0;
	}
	console.error(
		`✖ lockfile-provenance: read ${String(entries.length)} bun.lock entries; these cannot reach the tree:`,
	);
	for (const line of [...verdict.toFix, ...verdict.expired])
		console.error(`  ${line}`);
	console.error(
		'  Fix: wait out the cooldown and pin an older version, or move the entry to the npm registry. An entry with a reason to stay is listed in config/delendai/lockfile-provenance-exceptions.json with its reason and an until date.',
	);
	return 1;
};

if (import.meta.main) process.exit(await main());
