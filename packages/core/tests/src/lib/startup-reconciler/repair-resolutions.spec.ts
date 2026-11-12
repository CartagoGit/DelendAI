/**
 * x00552 — a human decision closes a repair task the reconciler may not
 * close, and closes NOTHING else.
 */
import { describe, expect, it } from 'vitest';

import { buildReconciliationReport } from '../../../../src/lib/startup-reconciler/build-report';
import type {
	IStartupFinding,
	IStartupPhaseResult,
} from '../../../../src/lib/startup-reconciler/contracts';
import {
	evidenceDigest,
	repairTaskId,
} from '../../../../src/lib/startup-reconciler/finding-catalog';
import {
	applyRepairResolutions,
	parseRepairResolutions,
	REPAIR_RESOLVED_CODE,
	REPAIR_STALE_CODE,
	renderRepairResolutions,
	staticRepairResolutions,
	type IRepairResolution,
} from '../../../../src/lib/startup-reconciler/repair-resolutions';

const VANISHED: IStartupFinding = {
	code: 'integration-evidence.ref-vanished',
	phase: 'integration-evidence',
	kind: 'blocker',
	repairClass: 'ambiguous',
	subject: 'refs/wip/machine/x00545-S1-g1',
	message:
		'The ref refs/wip/machine/x00545-S1-g1 no longer exists and its checkpoint 9421185 is NOT contained in the integration branch.',
	blocksMutation: true,
	recoveryRequired: true,
};

const phasesWith = (findings: readonly IStartupFinding[]) =>
	[
		{
			phase: 'integration-evidence',
			ran: true,
			counters: {},
			findings,
		},
	] as readonly IStartupPhaseResult[];

const report = (
	findings: readonly IStartupFinding[],
	resolutions: readonly IRepairResolution[],
) =>
	buildReconciliationReport({
		phases: phasesWith(findings),
		startedAt: 1,
		completedAt: 2,
		machineId: 'machine',
		mode: 'full',
		fingerprint: 'fp',
		resolutions,
	});

const resolutionFor = (
	item: IStartupFinding,
	overrides: Partial<IRepairResolution> = {},
): IRepairResolution => ({
	taskId: repairTaskId(item.code, item.subject),
	evidenceDigest: evidenceDigest(item),
	decision: 'accepted-loss',
	reason: 'investigated in x00546; the branch was discarded deliberately',
	decidedBy: 'cartago',
	decidedAt: '2026-09-19T08:00:00.000Z',
	...overrides,
});

describe('repair resolutions (x00552)', () => {
	it('leaves a blocker nobody answered blocking', () => {
		const built = report([VANISHED], []);
		expect(built.status).toBe('DEGRADED');
		expect(built.blockers).toHaveLength(1);
		expect(built.mutationsBlocked).toBe(true);
		expect(built.repairTasks).toHaveLength(1);
	});

	it('closes the blocker a decision answered and keeps the record', () => {
		const built = report([VANISHED], [resolutionFor(VANISHED)]);
		expect(built.status).toBe('READY');
		expect(built.blockers).toHaveLength(0);
		expect(built.mutationsBlocked).toBe(false);
		expect(built.recoveryRequired).toBe(false);
		expect(built.repairTasks).toHaveLength(0);
		const note = built.findings.find(
			(item) => item.code === REPAIR_RESOLVED_CODE,
		);
		expect(note?.message).toContain('cartago');
		expect(note?.message).toContain('accepted-loss');
		// The observation itself is still in the report, as a note.
		const evidence = built.findings.find(
			(item) => item.code === VANISHED.code,
		);
		expect(evidence?.kind).toBe('note');
		expect(evidence?.message).toBe(VANISHED.message);
	});

	it('keeps blocking when the evidence changed under the decision', () => {
		const answered = resolutionFor(VANISHED);
		const moved: IStartupFinding = {
			...VANISHED,
			message: `${VANISHED.message} (checkpoint deadbeef)`,
		};
		const built = report([moved], [answered]);
		expect(built.status).toBe('DEGRADED');
		expect(built.blockers).toHaveLength(1);
		expect(
			built.findings.some((item) => item.code === REPAIR_STALE_CODE),
		).toBe(true);
	});

	it('resolves nothing for a different task', () => {
		const other = resolutionFor({
			...VANISHED,
			subject: 'refs/wip/machine/x00001-S1-g1',
		});
		expect(report([VANISHED], [other]).blockers).toHaveLength(1);
	});

	it('reports every malformed entry and honours none of them', () => {
		const parsed = parseRepairResolutions(
			JSON.stringify({
				version: 1,
				resolutions: [
					{ taskId: 'a' },
					{ ...resolutionFor(VANISHED), decision: 'whatever' },
					resolutionFor(VANISHED),
				],
			}),
		);
		expect(parsed.resolutions).toHaveLength(1);
		expect(parsed.errors).toHaveLength(2);
		expect(parsed.errors[0]).toContain('missing');
		expect(parsed.errors[1]).toContain('decision must be one of');
	});

	it('refuses a file it does not understand rather than guessing', () => {
		expect(parseRepairResolutions('not json').errors[0]).toContain(
			'repair-resolutions.json',
		);
		expect(
			parseRepairResolutions(JSON.stringify({ version: 2 })).errors[0],
		).toContain('unsupported version');
		expect(
			parseRepairResolutions(JSON.stringify({ version: 1 })).errors[0],
		).toContain('must be an array');
		expect(parseRepairResolutions('   ')).toEqual({
			resolutions: [],
			errors: [],
		});
	});

	it('round-trips what it writes', () => {
		const entry = resolutionFor(VANISHED);
		const text = renderRepairResolutions([entry]);
		expect(text.endsWith('\n')).toBe(true);
		expect(parseRepairResolutions(text).resolutions).toEqual([entry]);
	});

	it('answers from a static source without touching the disk', () => {
		const entry = resolutionFor(VANISHED);
		expect(staticRepairResolutions([entry]).read()).toEqual([entry]);
	});

	it('is a no-op when nothing was recorded', () => {
		const outcome = applyRepairResolutions({
			blockers: [VANISHED],
			tasks: new Map(),
			resolutions: [],
		});
		expect(outcome.blockers).toEqual([VANISHED]);
		expect(outcome.notes).toEqual([]);
		expect(outcome.answered).toEqual([]);
		expect(outcome.answeredTaskIds).toEqual([]);
	});

	it('ties the digest to the evidence, not to the task identity', () => {
		const moved = { ...VANISHED, message: `${VANISHED.message} x` };
		expect(repairTaskId(moved.code, moved.subject)).toBe(
			repairTaskId(VANISHED.code, VANISHED.subject),
		);
		expect(evidenceDigest(moved)).not.toBe(evidenceDigest(VANISHED));
	});
});
