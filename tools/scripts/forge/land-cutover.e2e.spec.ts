/**
 * land-cutover.e2e.spec.ts — land is the one integrator, and nothing of the
 * mechanism it replaced is left: no workflow, script, hook or host module
 * references the queue, its trains, the candidate refresh, hydration or
 * ref maintenance; the policy, not a repository variable, switches the
 * engine; and the integration branch's CI follows land. While the engine
 * is not `land` (integration paused), nothing merges, labels or pushes a
 * pull request.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/** A workflow line that merges, labels, updates or pushes a pull request, or runs what does. */
const PULL_REQUEST_WRITE =
	/gh pr (?:merge|edit|ready)|--add-label|\/labels\b|update-branch|land\.script|bring-forward|open-batches/u;

/** The engine `delendai.config.json` records. */
const engineOf = (config: string): string | undefined =>
	/"engine": "(\w+)"/u.exec(config)?.[1];

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A reference by path or import: `/name`, `name.ts`, `'./name'`; a prose mention in a comment is history. */
const REFERENCE = new RegExp(
	[
		...REMOVED_MODULES.map(
			(name) =>
				`(?:${escapeRegExp(name)}(?:\\.script)?\\.(?:ts|yml|interface|constant|spec)|['"/]${escapeRegExp(name)}['"])`,
		),
		...REMOVED_NAMES.map((name) => `${escapeRegExp(name)}\\b`),
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
	'tools/scripts/forge/land-cutover.e2e.spec.ts',
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

/** A tracked file's text; `undefined` for one deleted in the working tree. */
const readTracked = (path: string): string | undefined => {
	try {
		return readFileSync(join(ROOT, path), 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return undefined;
		throw error;
	}
};

describe('the cutover to land', () => {
	it('[<1500ms] leaves no workflow, script or host module referencing the removed mechanism', () => {
		const found = tracked().flatMap((path) => {
			const text = readTracked(path);
			if (text === undefined) return [];
			return text
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
		expect(config).toMatch(/"engine": "(?:land|none)"/u);
		expect(config).toMatch(/"protocol": \d+/u);
		const land = join(ROOT, '.github/workflows/land.yml');
		expect(existsSync(land)).toBe(engineOf(config) === 'land');
		if (existsSync(land))
			expect(readFileSync(land, 'utf8')).not.toContain('vars.');
	});

	it('[<50ms] while the engine is not land, nothing merges, labels or pushes a pull request', () => {
		const config = readFileSync(join(ROOT, 'delendai.config.json'), 'utf8');
		if (engineOf(config) === 'land') return;
		const workflows = join(ROOT, '.github/workflows');
		const writes = readdirSync(workflows).flatMap((file) =>
			readFileSync(join(workflows, file), 'utf8')
				.split('\n')
				.flatMap((line, index) =>
					PULL_REQUEST_WRITE.test(line)
						? [`${file}:${String(index + 1)}: ${line.trim()}`]
						: [],
				),
		);
		expect(writes).toEqual([]);
		// The two scripts that act on pull requests refuse under any other engine.
		for (const script of ['land.script.ts', 'bring-forward.script.ts']) {
			const source = readFileSync(
				join(ROOT, 'tools/scripts/forge', script),
				'utf8',
			);
			expect(source).toMatch(/\.integration\.engine (?:!==|===) 'land'/u);
		}
	});

	it('[<20ms] runs on the pushes the identity makes and tells the integrator when a pull request run ends', () => {
		const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
		expect(ci).not.toContain('workflow_run');
		expect(ci).toContain('integration-signal:');
		expect(ci).toContain('if: ${{ always() && (github.event_name == ');
		expect(ci).toContain('zones:');
		expect(ci).not.toContain('scan-the-integration-branch');
		expect(ci).not.toContain('gh workflow run keep-the-queue');
	});
});
