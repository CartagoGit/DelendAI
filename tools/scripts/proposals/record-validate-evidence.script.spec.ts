/**
 * The writer/reader contract for the validate-evidence journal.
 *
 * The gate that blocks `close_slice` and `proposal_transition` reads
 * `.cache/mcp-vertex/results/logs/validate.jsonl`. Before this script
 * existed nothing wrote that file, so the gate could never be satisfied
 * by actually running `bun run validate` — an agent could only pass a
 * hand-written `validateEvidence` argument, and an honest agent looped
 * forever. These specs pin both halves together: the writer's path and
 * entry shape must be exactly what the reader consumes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VALIDATE_LOG_RELATIVE_PATH } from '../../../plugins/proposals/src/lib/contracts/constants/proposal-paths.constant';
import { resolveRecentValidateEvidence } from '../../../plugins/proposals/src/lib/tools/proposal-transition.tool';

import {
	appendValidateJournalEntry,
	buildValidateJournalEntry,
	formatValidateSummary,
	parseValidateSteps,
	runValidateSteps,
	VALIDATE_JOURNAL_RELATIVE_PATH,
	VALIDATE_RUN_SCRIPT,
} from './record-validate-evidence.script';

describe('validate-evidence journal path', () => {
	it('writes to the exact path the proposals gate reads', () => {
		expect(VALIDATE_JOURNAL_RELATIVE_PATH).toBe(VALIDATE_LOG_RELATIVE_PATH);
	});
});

describe('package.json wiring', () => {
	/**
	 * The journal only gets written if `bun run validate` actually goes
	 * through this wrapper. The previous incarnation of the gate was
	 * orphaned precisely because nothing asserted the wiring, so a
	 * package.json edit could silently re-break the closing loop.
	 */
	it('routes `validate` through the recorder and keeps the raw chain as `validate:run`', async () => {
		const { readFileSync } = await import('node:fs');
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, '../../../package.json'),
				'utf8',
			),
		) as { scripts: Record<string, string> };

		expect(manifest.scripts.validate).toContain(
			'record-validate-evidence.script.ts',
		);
		expect(manifest.scripts[VALIDATE_RUN_SCRIPT]).toBeTypeOf('string');
		// The wrapper must not recurse into itself.
		expect(manifest.scripts[VALIDATE_RUN_SCRIPT]).not.toContain(
			'record-validate-evidence',
		);
	});
});

describe('buildValidateJournalEntry', () => {
	it('maps exit code 0 to a pass entry', () => {
		const entry = buildValidateJournalEntry({
			exitCode: 0,
			timestamp: '2026-08-31T10:00:00.000Z',
			logPath: '/tmp/validate.jsonl',
		});
		expect(entry.result).toBe('pass');
		expect(entry.exitCode).toBe(0);
	});

	it('maps any non-zero exit code to a fail entry', () => {
		for (const exitCode of [1, 2, 127]) {
			expect(
				buildValidateJournalEntry({
					exitCode,
					timestamp: '2026-08-31T10:00:00.000Z',
					logPath: '/tmp/validate.jsonl',
				}).result,
			).toBe('fail');
		}
	});
});

describe('appendValidateJournalEntry ↔ resolveRecentValidateEvidence', () => {
	let workspaceRoot = '';

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), 'validate-journal-'));
	});

	afterEach(() => {
		rmSync(workspaceRoot, { recursive: true, force: true });
	});

	it('a passing run satisfies the gate with no hand-written evidence', async () => {
		await appendValidateJournalEntry({
			workspaceRoot,
			entry: buildValidateJournalEntry({
				exitCode: 0,
				timestamp: new Date().toISOString(),
				logPath: join(workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH),
			}),
		});

		const evidence = await resolveRecentValidateEvidence({
			workspaceRoot,
		});

		expect(evidence).not.toBeNull();
		expect(evidence?.exitCode).toBe(0);
	});

	it('a failing run leaves the gate closed', async () => {
		await appendValidateJournalEntry({
			workspaceRoot,
			entry: buildValidateJournalEntry({
				exitCode: 1,
				timestamp: new Date().toISOString(),
				logPath: join(workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH),
			}),
		});

		expect(
			await resolveRecentValidateEvidence({ workspaceRoot }),
		).toBeNull();
	});

	it('a stale pass no longer satisfies the gate', async () => {
		const twoDaysAgo = new Date(
			Date.now() - 48 * 60 * 60 * 1000,
		).toISOString();
		await appendValidateJournalEntry({
			workspaceRoot,
			entry: buildValidateJournalEntry({
				exitCode: 0,
				timestamp: twoDaysAgo,
				logPath: join(workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH),
			}),
		});

		expect(
			await resolveRecentValidateEvidence({ workspaceRoot }),
		).toBeNull();
	});

	it('appends without truncating earlier entries', async () => {
		for (const exitCode of [1, 1, 0]) {
			await appendValidateJournalEntry({
				workspaceRoot,
				entry: buildValidateJournalEntry({
					exitCode,
					timestamp: new Date().toISOString(),
					logPath: join(
						workspaceRoot,
						VALIDATE_JOURNAL_RELATIVE_PATH,
					),
				}),
			});
		}

		const { readFileSync } = await import('node:fs');
		const lines = readFileSync(
			join(workspaceRoot, VALIDATE_JOURNAL_RELATIVE_PATH),
			'utf8',
		)
			.split('\n')
			.filter((line) => line.trim() !== '');

		expect(lines).toHaveLength(3);
		// The latest pass still wins even with failures recorded before it.
		expect(
			await resolveRecentValidateEvidence({ workspaceRoot }),
		).not.toBeNull();
	});
});

describe('running every step instead of stopping at the first failure', () => {
	it('reads the &&-chain as an ordered step list', () => {
		expect(
			parseValidateSteps('bun run a && bun run b && bun run c'),
		).toEqual(['bun run a', 'bun run b', 'bun run c']);
	});

	it('runs the remaining steps after one fails and reports them all', async () => {
		const results = await runValidateSteps([
			'exit 0',
			'exit 3',
			'exit 0',
			'exit 4',
		]);

		expect(results.map((entry) => entry.exitCode)).toEqual([0, 3, 0, 4]);
		const summary = formatValidateSummary(results);
		expect(summary).toContain('2 of 4 steps FAILED');
		expect(summary).toContain('exit 3');
		expect(summary).toContain('exit 4');
	});

	it('stops at the first failure when fail-fast is requested', async () => {
		const results = await runValidateSteps(['exit 0', 'exit 3', 'exit 0'], {
			failFast: true,
		});

		expect(results).toHaveLength(2);
		expect(results.at(-1)?.exitCode).toBe(3);
	});

	it('reports a clean run without listing steps', async () => {
		const results = await runValidateSteps(['exit 0', 'exit 0']);
		expect(formatValidateSummary(results)).toBe(
			'[validate] 2/2 steps passed.',
		);
	});
});
