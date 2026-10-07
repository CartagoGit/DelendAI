#!/usr/bin/env bun
/**
 * dependency-advisories.script.ts — no dependency in the lockfile carries
 * a known advisory of moderate severity or above.
 *
 * Code scanning reads the code and Dependabot reads the manifests, after
 * the fact: on 2026-10-07 a promotion reached main and two Dependabot
 * alerts opened on it, while `bun audit` reported 43 advisories in the
 * lockfile, most of them pinned in place by stale root overrides. This
 * runs on every candidate, because an advisory appears without anybody
 * touching the code; it reads the lockfile and the advisory database, so
 * it costs about a second.
 *
 * An advisory with no patched version to move to is excepted in
 * `config/delendai/advisory-exceptions.json`, with its reason and the date
 * it is looked at again. An expired exception fails like the advisory
 * itself, so nothing is waived for good by being written down once.
 *
 * Exit codes:
 *   0 — nothing at or above moderate, or every finding excepted in date.
 *   1 — an advisory to fix, an expired exception, or an audit that could
 *       not run (a check that cannot run is not a pass).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

export interface IAdvisory {
	readonly url: string;
	readonly title: string;
	readonly severity: string;
}

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

const BLOCKING = new Set(['moderate', 'high', 'critical']);

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
			if (!BLOCKING.has(advisory.severity)) continue;
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

export const main = (): number => {
	const root = repoRoot();
	let audit: Readonly<Record<string, readonly IAdvisory[]>>;
	try {
		audit = readAudit(root);
	} catch {
		console.error(
			'✖ dependency-advisories: `bun audit` did not report, so nothing was checked.',
		);
		return 1;
	}
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
			`✓ dependency-advisories: no dependency carries an advisory of moderate severity or above (${String(verdict.excepted.length)} excepted).`,
		);
		return 0;
	}
	console.error(
		'✖ dependency-advisories: the lockfile carries advisories to fix:',
	);
	for (const line of [...verdict.toFix, ...verdict.expired]) {
		console.error(`  ${line}`);
	}
	console.error(
		'  Fix: `bun audit fix`, or raise the root `overrides` pin to the patched version. With no patched version, add an exception with its reason and a review date to config/delendai/advisory-exceptions.json.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());
