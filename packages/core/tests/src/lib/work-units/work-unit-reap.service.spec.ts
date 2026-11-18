/**
 * work-unit-reap.service.spec.ts — `work reap` runs every upkeep step
 * once, ends the delivered units through the reconciler and hands each
 * step the same `--apply` flag, over mocked steps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';

const m = vi.hoisted(() => ({
	openWork: vi.fn(),
	endDeliveredUnits: vi.fn(),
	endFinishedUnits: vi.fn(),
	readUnitStandings: vi.fn(),
	hasLocalBranch: vi.fn(),
	hydrateKeptUnits: vi.fn(),
	releaseIdleDependencies: vi.fn(),
	reapHusks: vi.fn(),
	keepStrayFiles: vi.fn(),
	reapTestTempLeftovers: vi.fn(),
	reapLandedRetired: vi.fn(),
	reapSpentReservations: vi.fn(),
	reapStrayRefs: vi.fn(),
	reapRetiredMachinery: vi.fn(),
}));
vi.mock('@delendai/core/lib/work-units/work-unit-shared.service', () => ({
	openWork: m.openWork,
	integrationBase: () => 'origin/develop',
	integrationRemote: () => 'origin',
	mainWorktreeOf: (root: string) => root,
}));
vi.mock('@delendai/core/lib/ref-reconciler/clone-forge-ports.service', () => ({
	endDeliveredUnits: m.endDeliveredUnits,
}));
vi.mock('@delendai/core/lib/work-units/finished-units-end.service', () => ({
	endFinishedUnits: m.endFinishedUnits,
}));
vi.mock('@delendai/core/lib/work-units/unit-standings.service', () => ({
	readUnitStandings: m.readUnitStandings,
	hasLocalBranch: m.hasLocalBranch,
}));
vi.mock('@delendai/core/lib/work-units/unit-removal.service', () => ({
	worktreeOfRef: (_root: string, ref: string) => `/w/${ref}`,
}));
vi.mock('@delendai/core/lib/work-units/kept-unit-hydration.service', () => ({
	hydrateKeptUnits: m.hydrateKeptUnits,
}));
vi.mock('@delendai/core/lib/work-units/idle-unit-dependencies.service', () => ({
	releaseIdleDependencies: m.releaseIdleDependencies,
}));
vi.mock('@delendai/core/lib/work-units/worktree-husks.service', () => ({
	reapHusks: m.reapHusks,
	keepStrayFiles: m.keepStrayFiles,
}));
vi.mock('@delendai/core/lib/work-units/test-temp-leftovers.service', () => ({
	reapTestTempLeftovers: m.reapTestTempLeftovers,
}));
vi.mock('@delendai/core/lib/work-units/retired-landed.service', () => ({
	reapLandedRetired: m.reapLandedRetired,
}));
vi.mock('@delendai/core/lib/work-units/slice-reservation-reap.service', () => ({
	reapSpentReservations: m.reapSpentReservations,
}));
vi.mock('@delendai/core/lib/work-units/stray-refs-reap.service', () => ({
	reapStrayRefs: m.reapStrayRefs,
}));
vi.mock('@delendai/core/lib/work-units/retired-machinery-reap.service', () => ({
	reapRetiredMachinery: m.reapRetiredMachinery,
}));

const { reaped } = await import(
	'@delendai/core/lib/work-units/work-unit-reap.service'
);

const policy = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'delendai' } },
});
const ctxOf = (remote?: string): IWorkUnitContext => ({
	cwd: '/r',
	globals: { workspace: '/r', json: false, format: 'text', remote },
});
const ctx = ctxOf();
const SPENT = 'delendai/wip/m/x1-S1-g1/spent';
const KEPT = 'delendai/wip/m/x1-S2-g1/kept';

beforeEach(() => {
	for (const fn of Object.values(m)) fn.mockReset();
	m.openWork.mockResolvedValue({ root: '/r', policy, engine: {} });
	m.endDeliveredUnits.mockResolvedValue([{ ref: SPENT, outcome: 'removed' }]);
	m.endFinishedUnits.mockResolvedValue([
		{ unit: 'x1-S3-g1/done', outcome: 'ended' },
		{ unit: 'x1-S4-g1/live', outcome: 'kept' },
	]);
	m.readUnitStandings.mockResolvedValue([
		{ ref: SPENT, standing: 'delivered' },
		{ ref: KEPT, standing: 'idle' },
		{ ref: 'no-branch', standing: 'idle' },
	]);
	m.hasLocalBranch.mockImplementation(
		(_root: string, ref: string) => ref !== 'no-branch',
	);
	m.hydrateKeptUnits.mockReturnValue(['advanced']);
	m.releaseIdleDependencies.mockResolvedValue(['deps']);
	m.reapHusks.mockResolvedValue(['husks']);
	m.keepStrayFiles.mockResolvedValue(['stray']);
	m.reapTestTempLeftovers.mockResolvedValue(['temp']);
	m.reapLandedRetired.mockReturnValue(['retired']);
	m.reapSpentReservations.mockReturnValue(['reservations']);
	m.reapStrayRefs.mockReturnValue(['strays']);
	m.reapRetiredMachinery.mockReturnValue(['machinery']);
});

describe('work reap', () => {
	it('[<200ms] returns the opening refusal untouched', async () => {
		const refusal = { code: 2, data: {} };
		m.openWork.mockResolvedValue(refusal);
		expect(await reaped([], ctx)).toBe(refusal);
		expect(m.endDeliveredUnits).not.toHaveBeenCalled();
	});

	it('[<200ms] runs every step and reports each, advancing only the kept units', async () => {
		const result = await reaped(['--apply'], ctx);
		expect(result.data).toMatchObject({
			units: [{ ref: SPENT, outcome: 'removed' }],
			ended: [{ unit: 'x1-S3-g1/done' }],
			advanced: ['advanced'],
			dependencies: ['deps'],
			husks: ['husks'],
			strayFiles: ['stray'],
			testTemp: ['temp'],
			retired: ['retired'],
			reservations: ['reservations'],
			strays: ['strays'],
			machinery: ['machinery'],
		});
		expect(m.endDeliveredUnits).toHaveBeenCalledWith({
			root: '/r',
			policy,
			apply: true,
		});
		expect(m.hydrateKeptUnits.mock.calls[0]?.[0]).toMatchObject({
			apply: true,
			units: [{ ref: KEPT, worktree: `/w/${KEPT}` }],
		});
		expect(m.releaseIdleDependencies.mock.calls[0]?.[0]).toMatchObject({
			apply: true,
			units: [{ ref: KEPT, standing: 'idle' }],
		});
	});

	it('[<200ms] only reports without --apply, and reads the remote from the global', async () => {
		await reaped([], ctxOf('up'));
		expect(m.endDeliveredUnits.mock.calls[0]?.[0].apply).toBe(false);
		expect(m.reapHusks.mock.calls[0]?.[0]).toMatchObject({
			remote: 'up',
			apply: false,
		});
	});
});
