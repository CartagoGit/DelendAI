#!/usr/bin/env bun
/**
 * dependency-advisories.script.ts — no dependency in the lockfile carries
 * a known advisory, of any severity.
 *
 * Code scanning reads the code and Dependabot reads the manifests, after
 * the fact: on 2026-10-07 a promotion reached main and two Dependabot
 * alerts opened on it, while `bun audit` reported 43 advisories in the
 * lockfile, most of them pinned in place by stale root overrides. This
 * runs on every candidate, because an advisory appears without anybody
 * touching the code; it reads the lockfile and the advisory database, so
 * it costs about a second.
 *
 * Every severity blocks, low included. The forge computes its dependency
 * alerts for the default branch only, so the integration branch has no
 * alert list of its own: this audit is that list, on every candidate, on
 * the promotion and in the daily sweep. It has to be as strict as what
 * the forge will say once the code reaches the release branch, or the
 * release branch is where the difference shows.
 *
 * An advisory with no patched version to move to is excepted in
 * `config/delendai/advisory-exceptions.json`, with its reason and the date
 * it is looked at again. An expired exception fails like the advisory
 * itself, so nothing is waived for good by being written down once.
 *
 * The lockfile is only what this repository runs. A published package
 * travels with its declared ranges, not with the lockfile or the root
 * `overrides`: `^1.31.0` let an adopter keep an SDK four advisories old
 * while every test here ran 1.32.0 (2026-10-22). So the lowest version
 * each publishable package's range admits is asked about too.
 *
 * Exit codes:
 *   0 — no advisory, or every finding excepted in date.
 *   1 — an advisory to fix, an expired exception, or an audit that could
 *       not run (a check that cannot run is not a pass).
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

export interface IAdvisory {
	readonly url: string;
	readonly title: string;
	readonly severity: string;
}

/** One advisory as the bulk endpoint answers it. */
export interface IBulkAdvisory extends IAdvisory {
	readonly vulnerable_versions?: string;
}

/** The lowest version a declared range admits, or `undefined` for one with none to name. */
export const rangeFloor = (range: string): string | undefined => {
	const floors = range
		.split('||')
		.map((set) =>
			set
				.trim()
				.split(/\s+/u)
				.find((part) => !part.startsWith('<')),
		)
		.map((part) => /(\d+)\.(\d+)\.(\d+)/u.exec(part ?? '')?.[0])
		.filter((version): version is string => version !== undefined);
	const numbers = (version: string): readonly number[] =>
		version.split('.').map(Number);
	return floors.sort((a, b) => {
		const [x, y] = [numbers(a), numbers(b)];
		return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!;
	})[0];
};

/** One range a publishable package declares, with its floor. */
export interface IDeclaredFloor {
	readonly name: string;
	readonly range: string;
	readonly floor: string;
	readonly manifest: string;
}

/** The floors every non-private manifest under `manifests` declares, `workspace:` ranges aside. */
export const declaredFloors = (
	manifests: readonly { readonly path: string; readonly json: unknown }[],
): readonly IDeclaredFloor[] =>
	manifests.flatMap(({ path, json }) => {
		const manifest = json as {
			readonly private?: boolean;
			readonly dependencies?: Readonly<Record<string, string>>;
			readonly peerDependencies?: Readonly<Record<string, string>>;
		};
		if (manifest.private === true) return [];
		return [
			...Object.entries(manifest.dependencies ?? {}),
			...Object.entries(manifest.peerDependencies ?? {}),
		].flatMap(([name, range]) => {
			if (range.startsWith('workspace:')) return [];
			const floor = rangeFloor(range);
			return floor === undefined
				? []
				: [{ name, range, floor, manifest: path }];
		});
	});

/** The version that clears `vulnerable` (`<1.32.0`, `>=1.24.0 <1.32.0`), when it names one. */
const clearedAt = (vulnerable: string | undefined): string =>
	/<\s*(\d+\.\d+\.\d+)\s*$/u.exec(vulnerable ?? '')?.[1] ?? 'none named';

/** The advisories `answer` gives for `floors`, keyed by package, each naming the range that admits it. */
export const floorAdvisories = (
	floors: readonly IDeclaredFloor[],
	answer: Readonly<Record<string, readonly IBulkAdvisory[]>>,
): Readonly<Record<string, readonly IAdvisory[]>> => {
	const found: Record<string, IAdvisory[]> = {};
	for (const floor of floors)
		for (const advisory of answer[floor.name] ?? []) {
			if (!satisfiesUpperBound(floor.floor, advisory.vulnerable_versions))
				continue;
			(found[floor.name] ??= []).push({
				...advisory,
				title: `${advisory.title} — "${floor.range}" in ${floor.manifest} admits ${floor.floor}; it clears at ${clearedAt(advisory.vulnerable_versions)}`,
			});
		}
	return found;
};

/** Whether `version` sits below the upper bound of `vulnerable`; the endpoint is asked per version, so the rest holds. */
const satisfiesUpperBound = (
	version: string,
	vulnerable: string | undefined,
): boolean => {
	const bound = clearedAt(vulnerable);
	if (bound === 'none named') return true;
	const [a, b] = [version, bound].map((v) => v.split('.').map(Number));
	return (
		(a![0]! - b![0]!) * 1e6 + (a![1]! - b![1]!) * 1e3 + (a![2]! - b![2]!) <
		0
	);
};

const ADVISORY_BULK_URL =
	'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';

/** What the advisory database says about each floor's version. */
export const askFloors = async (
	floors: readonly IDeclaredFloor[],
	fetchFn: typeof fetch = fetch,
): Promise<Readonly<Record<string, readonly IBulkAdvisory[]>>> => {
	const versions: Record<string, string[]> = {};
	for (const floor of floors)
		(versions[floor.name] ??= []).includes(floor.floor) ||
			versions[floor.name]!.push(floor.floor);
	const response = await fetchFn(ADVISORY_BULK_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(versions),
	});
	if (!response.ok)
		throw new Error(
			`the advisory database answered ${String(response.status)}`,
		);
	return (await response.json()) as Record<string, readonly IBulkAdvisory[]>;
};

/** Every package manifest under `packages/` and `plugins/` at `root`. */
export const publishableManifests = (
	root: string,
): readonly { readonly path: string; readonly json: unknown }[] =>
	['packages', 'plugins'].flatMap((dir) =>
		readdirSync(join(root, dir), { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.flatMap((entry) => {
				const path = `${dir}/${entry.name}/package.json`;
				try {
					return [
						{
							path,
							json: JSON.parse(
								readFileSync(join(root, path), 'utf8'),
							),
						},
					];
				} catch {
					return [];
				}
			}),
	);

export interface IAdvisoryException {
	readonly advisory: string;
	readonly package: string;
	readonly reason: string;
	readonly until: string;
}

export interface IAdvisoryVerdict {
	readonly toFix: readonly string[];
	readonly expired: readonly string[];
	readonly excepted: readonly string[];
}

const advisoryId = (url: string): string => url.split('/').pop() ?? url;

/** What the audit's findings mean once the exceptions are applied on `today`. */
export const judgeAdvisories = (
	audit: Readonly<Record<string, readonly IAdvisory[]>>,
	exceptions: readonly IAdvisoryException[],
	today: string,
): IAdvisoryVerdict => {
	const toFix: string[] = [];
	const expired: string[] = [];
	const excepted: string[] = [];
	for (const [name, advisories] of Object.entries(audit)) {
		for (const advisory of advisories) {
			const id = advisoryId(advisory.url);
			const line = `${name}: ${advisory.severity} ${id} — ${advisory.title}`;
			const exception = exceptions.find(
				(each) => each.advisory === id && each.package === name,
			);
			if (exception === undefined) toFix.push(line);
			else if (exception.until < today)
				expired.push(`${line} (excepted until ${exception.until})`);
			else excepted.push(line);
		}
	}
	return { toFix, expired, excepted };
};

const readAudit = (
	root: string,
): Readonly<Record<string, readonly IAdvisory[]>> => {
	try {
		return JSON.parse(
			execFileSync('bun', ['audit', '--json'], {
				cwd: root,
				encoding: 'utf8',
			}),
		) as Record<string, readonly IAdvisory[]>;
	} catch (error) {
		// `bun audit` exits non-zero when it finds something; its report
		// is still on stdout. Anything else is an audit that did not run.
		const stdout = (error as { readonly stdout?: string }).stdout ?? '';
		return JSON.parse(stdout) as Record<string, readonly IAdvisory[]>;
	}
};

export const main = async (): Promise<number> => {
	const root = repoRoot();
	let lockfile: Readonly<Record<string, readonly IAdvisory[]>>;
	try {
		lockfile = readAudit(root);
	} catch {
		console.error(
			'✖ dependency-advisories: `bun audit` did not report, so nothing was checked.',
		);
		return 1;
	}
	const floors = declaredFloors(publishableManifests(root));
	if (floors.length === 0) {
		console.error(
			'✖ dependency-advisories: no publishable manifest declared a range, so no floor was checked.',
		);
		return 1;
	}
	let published: Readonly<Record<string, readonly IAdvisory[]>>;
	try {
		published = floorAdvisories(floors, await askFloors(floors));
	} catch (error) {
		console.error(
			`✖ dependency-advisories: the declared ranges could not be checked (${error instanceof Error ? error.message : String(error)}).`,
		);
		return 1;
	}
	const audit: Record<string, readonly IAdvisory[]> = { ...lockfile };
	for (const [name, advisories] of Object.entries(published))
		audit[name] = [...(audit[name] ?? []), ...advisories];
	const { exceptions } = JSON.parse(
		readFileSync(
			join(root, 'config/delendai/advisory-exceptions.json'),
			'utf8',
		),
	) as { readonly exceptions: readonly IAdvisoryException[] };
	const today = new Date().toISOString().slice(0, 10);
	const verdict = judgeAdvisories(audit, exceptions, today);
	for (const line of verdict.excepted) console.log(`  excepted ${line}`);
	if (verdict.toFix.length === 0 && verdict.expired.length === 0) {
		console.log(
			`✓ dependency-advisories: no dependency carries a known advisory, in the lockfile or at the floor of ${String(floors.length)} published ranges (${String(verdict.excepted.length)} excepted).`,
		);
		return 0;
	}
	console.error(
		'✖ dependency-advisories: the lockfile or a published range carries advisories to fix:',
	);
	for (const line of [...verdict.toFix, ...verdict.expired]) {
		console.error(`  ${line}`);
	}
	console.error(
		'  Fix: `bun audit fix`, or raise the root `overrides` pin to the patched version; for a published range, raise its floor in that manifest (an override does not travel with a package). With no patched version, add an exception with its reason and a review date to config/delendai/advisory-exceptions.json.',
	);
	return 1;
};

if (import.meta.main) process.exit(await main());
