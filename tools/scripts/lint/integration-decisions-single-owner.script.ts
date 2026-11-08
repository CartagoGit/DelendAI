#!/usr/bin/env bun
/**
 * integration-decisions-single-owner.script.ts — integration decisions
 * (allowed namespaces, ready, overlap, grouping, culprit, landed) are
 * computed in ONE module: packages/core/src/lib/integration/decisions.
 *
 * They were computed several times over: the guard, the forge ruleset
 * generator, the queue, the lints and work status each carried their own
 * reading, and the readings drifted (nine integration failures found in
 * production on 2026-11-08). This refuses a second implementation, by the
 * name of a known decision or by the signature of the code that computes
 * one, anywhere outside the module.
 *
 * Exit codes: 0 — one owner. 1 — someone wrote another.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Where the decisions live; the only place they may be defined. */
export const DECISIONS_MODULE = 'packages/core/src/lib/integration/decisions/';

/** Files that may mention the decisions' signatures without computing them. */
export const ALLOWED_FILES: ReadonlySet<string> = new Set([
	'tools/scripts/lint/integration-decisions-single-owner.script.ts',
	'tools/scripts/lint/integration-decisions-single-owner.spec.ts',
]);

/** The decisions that have exactly one implementation, by name. */
export const DECISION_NAMES: readonly string[] = [
	'allowedRefPatterns',
	'insideNamespaces',
	'policyNamespaces',
	'ownedNamespaces',
	'ownedWorkRefPrefixes',
	'ownedPublicationRefPrefixes',
	'ownedTrainPrefixes',
	'publicationPrefixesOf',
	'underPublication',
	'underNamespace',
	'pullRequestReady',
	'queueOrder',
	'queueHead',
	'byQueuePosition',
	'candidateDispositions',
	'overlapBetween',
	'footprintFromReach',
	'groupByOverlap',
	'acceptIndependent',
	'acceptRiders',
	'attributeCulprit',
	'culpritsAmong',
	'trainStep',
	'trainMembers',
	'workRefLanded',
	'workRefFate',
	'workRefProposalOpen',
	'pullRequestLanded',
	'parentsOutsideMerges',
];

/** Code that computes a decision under whatever name it was given. */
export const DECISION_SIGNATURES: readonly {
	readonly name: string;
	readonly pattern: RegExp;
}[] = [
	{
		name: 'a ref namespace stripped of refs/ and heads/ (shortName)',
		pattern: /\.replace\(\/\^refs\\\/\/u, ''\)\s*\.replace\(\/\^heads\\\//u,
	},
	{
		name: 'a culprit marker read off a train branch (culpritsAmong)',
		pattern: /startsWith\(`\$\{[^}]+\}culprit\/`\)/u,
	},
	{
		name: 'train namespaces derived by hand (ownedTrainPrefixes)',
		pattern: /`\$\{[^}]*\}train\/`/u,
	},
];

const declares = (name: string): RegExp =>
	new RegExp(
		`^\\s*(?:export\\s+)?(?:const|function|let)\\s+${name}\\b`,
		'mu',
	);

/** Every re-implementation in one file, as `path:line — what`. */
export const findReimplementations = (
	path: string,
	text: string,
): readonly string[] => {
	if (path.startsWith(DECISIONS_MODULE) || ALLOWED_FILES.has(path)) return [];
	const lines = text.split('\n');
	const found: string[] = [];
	for (const name of DECISION_NAMES) {
		const match = declares(name).exec(text);
		if (match === null) continue;
		const line = text.slice(0, match.index).split('\n').length;
		found.push(`${path}:${String(line)} — defines ${name}`);
	}
	lines.forEach((row, index) => {
		if (/^\s*(?:\/\/|\*|\/\*)/u.test(row)) return;
		for (const signature of DECISION_SIGNATURES) {
			if (signature.pattern.test(row)) {
				found.push(
					`${path}:${String(index + 1)} — computes ${signature.name}`,
				);
			}
		}
	});
	return found;
};

const trackedSources = (): readonly string[] =>
	execFileSync('git', ['ls-files', '-z'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((path) => /\.ts$/u.test(path) && !path.endsWith('.d.ts'))
		.filter(
			(path) =>
				/^(packages|tools|plugins|extensions|apps)\//u.test(path) &&
				!path.includes('/node_modules/'),
		);

if (import.meta.main) {
	const offenders = trackedSources().flatMap((path) => {
		try {
			return findReimplementations(path, readFileSync(path, 'utf8'));
		} catch {
			return [];
		}
	});
	if (offenders.length > 0) {
		process.stderr.write(
			`integration decisions are computed once, in ${DECISIONS_MODULE}.\nRead them from there instead of writing another:\n${offenders.map((line) => `  ${line}`).join('\n')}\n`,
		);
		process.exit(1);
	}
	process.stdout.write('integration-decisions-single-owner: one owner.\n');
}
