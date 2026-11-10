/**
 * land-cutover.spec.ts — land is the one integrator, and nothing of the
 * mechanism it replaced is left: no workflow, script, hook or host module
 * references the queue, its trains, the candidate refresh, hydration or
 * ref maintenance; the policy, not a repository variable, switches the
 * engine; and the integration branch's CI follows land.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');

/** The modules, workflows and scripts the cutover removed. */
const REMOVED_MODULES = [
	'keep-the-queue-moving',
	'advance-queue',
	'queue-arming',
	'queue-acceptance',
	'queue-order',
	'train-fallback',
	'train-rehearsal',
	'release-checkout',
	'candidate-overlap-report',
	'candidate-tested-base',
	'refresh-candidate-artifacts',
	'refresh-candidate-derived',
	'hydrate-candidates-after-merge',
	'hydration-lock',
	'maintain-ref-namespace',
	'orphan-rescue',
	'reap-finished-units',
	'stale-verdict-conflicts',
	'work-ref-fate-agreement',
	'close-approved-proposals',
	'sent-back-proposals',
	'forward-sync-release.yml',
	'verify-develop-health.yml',
] as const;

/** Entry points and switches that no longer exist. */
const REMOVED_NAMES = [
	'forge:refresh',
	'forge:namespace',
	'forge:release',
	'forge:rehearse-train',
	'DELENDAI_INTEGRATION_ENGINE',
	'DELENDAI_CANDIDATE_REFRESH_INTERVAL_MS',
] as const;

const escape = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A reference by path or import: `/name`, `name.ts`, `'./name'`; a prose mention in a comment is history. */
const REFERENCE = new RegExp(
	[
		...REMOVED_MODULES.map(
			(name) =>
				`(?:${escape(name)}(?:\\.script)?\\.(?:ts|yml|interface|constant|spec)|['"/]${escape(name)}['"])`,
		),
		...REMOVED_NAMES.map((name) => `${escape(name)}\\b`),
	].join('|'),
	'u',
);

/** Workflows, scripts, hooks and host and core modules: what could run the old mechanism. */
const SCANNED = [
	'.github',
	'package.json',
	'lefthook.yml',
	'tools',
	'packages/core/src',
	'packages/cli/src',
] as const;

/** Files that only record history or measure it, and this spec. */
const UNSCANNED = new Set([
	'tools/scripts/forge/land-cutover.spec.ts',
	'tools/scripts/ci/zone-reads.generated.json',
	'tools/scripts/test/test-time-budget.migration.json',
	'tools/scripts/lint/spec-git-init.baseline.json',
]);

const tracked = (): readonly string[] =>
	execFileSync('git', ['ls-files', '--', ...SCANNED], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((path) => path !== '' && !UNSCANNED.has(path));

describe('the cutover to land', () => {
	it('[<1500ms] leaves no workflow, script or host module referencing the removed mechanism', () => {
		const found = tracked().flatMap((path) => {
			if (!existsSync(join(ROOT, path))) return [];
			return readFileSync(join(ROOT, path), 'utf8')
				.split('\n')
				.flatMap((line, index) =>
					REFERENCE.test(line)
						? [`${path}:${String(index + 1)}: ${line.trim()}`]
						: [],
				);
		});
		expect(found).toEqual([]);
	});

	it('[<20ms] removed the replaced workflows', () => {
		for (const workflow of [
			'keep-the-queue-moving.yml',
			'open-promotion.yml',
			'forward-sync-release.yml',
			'verify-develop-health.yml',
		]) {
			expect(existsSync(join(ROOT, '.github/workflows', workflow))).toBe(
				false,
			);
		}
		const tier3 = readFileSync(
			join(ROOT, '.github/workflows/tier3.yml'),
			'utf8',
		);
		expect(tier3).not.toMatch(/^ {2}develop-health:/mu);
	});

	it('[<20ms] switches the engine in the policy and records the protocol', () => {
		const config = readFileSync(join(ROOT, 'delendai.config.json'), 'utf8');
		expect(config).toMatch(/"engine": "land"/u);
		expect(config).toMatch(/"protocol": \d+/u);
		const land = readFileSync(
			join(ROOT, '.github/workflows/land.yml'),
			'utf8',
		);
		expect(land).not.toContain('vars.');
	});

	it('[<20ms] runs the integration branch CI after land, judged since the tip the pass started from', () => {
		const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
		expect(ci).toMatch(/workflow_run:\n\s+workflows: \[land\]/u);
		expect(ci).toContain('github.event.workflow_run.head_sha');
		expect(ci).not.toContain('gh workflow run keep-the-queue');
	});
});
