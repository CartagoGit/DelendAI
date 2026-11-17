#!/usr/bin/env bun
/**
 * proposal-readiness.script.ts — a proposal in ready/ or in-progress/
 * leaves nothing to work out: real Files, checkable acceptance, decided
 * Decisions, DependsOn that resolve. The rules are one pure function the
 * move to `ready` calls too; this script applies them to the tree.
 *
 * Ratchet: existing findings are baselined, and the baseline only
 * shrinks. `--update` drops entries that no longer apply and refuses to
 * add any; `--init` writes the first baseline and only when none exists.
 *
 * Exit codes: 0 clean (or only baselined), 1 new findings, 2 bad usage.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { IReadinessFinding } from '../../../plugins/proposals/src/lib/contracts/interfaces/proposal-readiness.interface';
import {
	checkProposalReadiness,
	describeReadinessFinding,
} from '../../../plugins/proposals/src/lib/proposals/proposal-readiness';
import { collectProposals } from './proposal-hygiene.script';

const BASELINE = 'tools/scripts/lint/proposal-readiness.baseline.json';

/** Stable key for baselining, independent of folder and line numbers. */
export const readinessKey = (item: IReadinessFinding): string =>
	`${item.proposal}::${item.slice}::${item.rule}::${item.text.replace(/\s+/gu, ' ')}`;

/** The baseline after an update: only the entries that still apply. */
export const shrinkBaseline = (
	baseline: readonly string[],
	findings: readonly IReadinessFinding[],
): readonly string[] => {
	const current = new Set(findings.map(readinessKey));
	return baseline.filter((key) => current.has(key)).sort();
};

/** The findings the baseline does not already carry. */
export const freshFindings = (
	baseline: readonly string[],
	findings: readonly IReadinessFinding[],
): readonly IReadinessFinding[] => {
	const known = new Set(baseline);
	return findings.filter((item) => !known.has(readinessKey(item)));
};

/** Tab-indented, so the file survives `biome format`. */
export const renderBaseline = (keys: readonly string[]): string =>
	`${JSON.stringify([...keys].sort(), null, '\t')}\n`;

const readBaseline = (): readonly string[] | undefined => {
	try {
		return JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];
	} catch {
		return undefined;
	}
};

const main = (): number => {
	const root = process.cwd();
	const proposals = collectProposals(root);
	if (proposals.size === 0) {
		console.error(
			'proposal-readiness: scanned ZERO proposals; refusing to report ok',
		);
		return 1;
	}
	const findings = [...proposals.values()].flatMap((text) =>
		checkProposalReadiness(text, {
			exists: (path) => existsSync(join(root, path)),
			newMustBeAbsent: false,
		}),
	);
	const baseline = readBaseline();

	if (process.argv.includes('--init')) {
		if (baseline !== undefined) {
			console.error(
				'proposal-readiness: a baseline exists; it only shrinks (--update).',
			);
			return 2;
		}
		writeFileSync(BASELINE, renderBaseline(findings.map(readinessKey)));
		console.log(
			`proposal-readiness: baseline written — ${findings.length} finding(s) across ${proposals.size} open proposal(s).`,
		);
		return 0;
	}

	const known = baseline ?? [];
	const fresh = freshFindings(known, findings);
	if (process.argv.includes('--update')) {
		if (fresh.length > 0) {
			console.error(
				`proposal-readiness: ${fresh.length} finding(s) are not in the baseline, and it only shrinks. Fix them:`,
			);
			for (const item of fresh)
				console.error(`  ${describeReadinessFinding(item)}`);
			return 1;
		}
		const kept = shrinkBaseline(known, findings);
		writeFileSync(BASELINE, renderBaseline(kept));
		console.log(
			`proposal-readiness: baseline now ${kept.length} (was ${known.length}).`,
		);
		return 0;
	}

	if (fresh.length === 0) {
		console.log(
			`proposal-readiness: no new findings (${known.length} baselined, ${proposals.size} open proposals scanned).`,
		);
		return 0;
	}
	console.error(
		`proposal-readiness: ${fresh.length} new finding(s) across ${proposals.size} open proposal(s):`,
	);
	for (const item of fresh)
		console.error(`  ${describeReadinessFinding(item)}`);
	console.error(
		'\nA slice is ready only when nothing is left to work out: Files that exist (or\n' +
			'new:<path>), acceptance naming a command, a .spec.ts or a Scenario, a Decisions\n' +
			'field with nothing open, and DependsOn between slices that share a file.',
	);
	return 1;
};

if (import.meta.main) process.exit(main());
