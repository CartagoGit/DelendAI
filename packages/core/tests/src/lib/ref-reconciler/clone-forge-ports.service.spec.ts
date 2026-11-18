/**
 * clone-forge-ports.service.spec.ts — the real ports of the clone-side
 * forge, over mocked git and unit services: each port asks the service
 * the reaper asked, and `endDeliveredUnits` runs one reconciler pass.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

const m = vi.hoisted(() => ({
	readGit: vi.fn(),
	integrationBase: vi.fn(),
	integrationRemote: vi.fn(),
	carriesNothingBeyond: vi.fn(),
	keepUncommittedEdits: vi.fn(),
	alive: vi.fn(),
	removeUnitCheckout: vi.fn(),
	dropForgeCopy: vi.fn(),
	worktreeOfRef: vi.fn(),
	readUnitStandings: vi.fn(),
	inspectWorktree: vi.fn(),
}));

vi.mock('@delendai/core/lib/work-units/work-unit-shared.service', () => ({
	readGit: m.readGit,
	integrationBase: m.integrationBase,
	integrationRemote: m.integrationRemote,
}));
vi.mock('@delendai/core/lib/work-units/landed-work.service', () => ({
	carriesNothingBeyond: m.carriesNothingBeyond,
}));
vi.mock('@delendai/core/lib/work-units/unit-edits-kept.service', () => ({
	keepUncommittedEdits: m.keepUncommittedEdits,
}));
vi.mock('@delendai/core/lib/work-units/unit-liveness.service', () => ({
	unitLifeReader: () => (input: unknown) => Promise.resolve(m.alive(input)),
}));
vi.mock('@delendai/core/lib/work-units/unit-removal.service', () => ({
	removeUnitCheckout: m.removeUnitCheckout,
	dropForgeCopy: m.dropForgeCopy,
	worktreeOfRef: m.worktreeOfRef,
}));
vi.mock('@delendai/core/lib/work-units/unit-standings.service', () => ({
	readUnitStandings: m.readUnitStandings,
}));
vi.mock('@delendai/core/lib/work-units/unit-worktree-state.service', () => ({
	inspectWorktree: m.inspectWorktree,
}));

const { cloneForgePortsAt, endDeliveredUnits } = await import(
	'@delendai/core/lib/ref-reconciler/clone-forge-ports.service'
);

const policy = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'delendai' } },
});
const REF = 'delendai/wip/m/x1-S1-g1/t';

beforeEach(() => {
	for (const fn of Object.values(m)) fn.mockReset();
	m.integrationBase.mockReturnValue('origin/develop');
	m.integrationRemote.mockReturnValue('origin');
});

describe('cloneForgePortsAt', () => {
	it('[<200ms] maps the standings to clone units', async () => {
		m.readUnitStandings.mockResolvedValue([
			{ ref: REF, standing: 'idle', delivered: true, silentSeconds: 5 },
			{ ref: 'r2', standing: 'live', silentSeconds: null },
		]);
		const ports = cloneForgePortsAt({ root: '/r', policy, now: 7 });
		expect(await ports.units()).toEqual([
			{ ref: REF, standing: 'idle', delivered: true, silentSeconds: 5 },
			{
				ref: 'r2',
				standing: 'live',
				delivered: false,
				silentSeconds: null,
			},
		]);
		expect(m.readUnitStandings).toHaveBeenCalledWith({
			root: '/r',
			policy,
			now: 7,
		});
		await cloneForgePortsAt({ root: '/r', policy }).units();
		expect(m.readUnitStandings).toHaveBeenLastCalledWith({
			root: '/r',
			policy,
		});
	});

	it('[<200ms] reads the tip, the worktree and the worktree state', () => {
		m.readGit.mockReturnValue('abc');
		m.worktreeOfRef
			.mockReturnValueOnce('/w')
			.mockReturnValueOnce(undefined);
		m.inspectWorktree.mockReturnValue({ edited: ['a'], regenerable: [] });
		const ports = cloneForgePortsAt({ root: '/r', policy });
		expect(ports.tipOf(REF)).toBe('abc');
		expect(m.readGit).toHaveBeenCalledWith('/r', [
			'rev-parse',
			'-q',
			'--verify',
			`refs/heads/${REF}`,
		]);
		expect(ports.worktreeOf(REF)).toBe('/w');
		expect(ports.worktreeOf(REF)).toBeNull();
		expect(ports.inspect('/w')).toEqual({ edited: ['a'], regenerable: [] });
	});

	it('[<200ms] asks git whether the integration branch holds a tip', () => {
		m.readGit.mockReturnValueOnce('').mockReturnValueOnce(undefined);
		const ports = cloneForgePortsAt({ root: '/r', policy });
		expect(ports.isLanded('t')).toBe(true);
		expect(ports.isLanded('t')).toBe(false);
		m.integrationBase.mockReturnValue(undefined);
		const none = cloneForgePortsAt({ root: '/r', policy });
		expect(none.isLanded('t')).toBe(false);
		expect(none.carriesNothing(REF)).toBe(false);
	});

	it('[<200ms] asks whether the unit carries nothing beyond the integration branch', () => {
		m.carriesNothingBeyond.mockReturnValue(true);
		const ports = cloneForgePortsAt({ root: '/r', policy });
		expect(ports.carriesNothing(REF)).toBe(true);
		expect(m.carriesNothingBeyond).toHaveBeenCalledWith(
			'/r',
			`refs/heads/${REF}`,
			'origin/develop',
		);
	});

	it('[<200ms] reads the retired tips of the remote once', () => {
		m.readGit.mockReturnValue('aaa\trefs/x\n\nbbb\trefs/y\n');
		const ports = cloneForgePortsAt({ root: '/r', policy });
		expect(ports.keptOnRemote('aaa')).toBe(true);
		expect(ports.keptOnRemote('ccc')).toBe(false);
		expect(m.readGit).toHaveBeenCalledTimes(1);
		m.readGit.mockReset();
		m.readGit.mockReturnValue(undefined);
		expect(
			cloneForgePortsAt({ root: '/r', policy }).keptOnRemote('aaa'),
		).toBe(false);
	});

	it('[<200ms] reads life, keeps edits and removes through the unit services', async () => {
		m.alive.mockReturnValue({ alive: true });
		m.keepUncommittedEdits.mockReturnValue('refs/retired/x');
		m.removeUnitCheckout.mockResolvedValue({ deletedBranch: true });
		const ports = cloneForgePortsAt({ root: '/r', policy, now: 9 });
		expect(await ports.alive(REF, '/w')).toBe(true);
		expect(ports.keepEdits(REF, '/w')).toBe('refs/retired/x');
		expect(await ports.removeCheckout(REF, 't', true)).toBe(true);
		expect(m.removeUnitCheckout).toHaveBeenCalledWith('/r', REF, {
			policy,
			tip: 't',
			editsKept: true,
			now: 9,
		});
		await ports.removeCheckout(REF, 't', false);
		expect(m.removeUnitCheckout).toHaveBeenLastCalledWith('/r', REF, {
			policy,
			tip: 't',
			now: 9,
		});
		ports.dropForgeCopy(REF, 't');
		expect(m.dropForgeCopy).toHaveBeenCalledWith('/r', 'origin', REF, 't');
	});

	it('[<200ms] reports through the given sink, and silently by default', () => {
		const lines: string[] = [];
		cloneForgePortsAt({
			root: '/r',
			policy,
			report: (line) => lines.push(line),
		}).report('x');
		expect(lines).toEqual(['x']);
		expect(
			cloneForgePortsAt({ root: '/r', policy }).report('x'),
		).toBeUndefined();
	});
});

describe('endDeliveredUnits', () => {
	it('[<200ms] ends a delivered unit through one reconciler pass', async () => {
		m.readUnitStandings.mockResolvedValue([
			{
				ref: REF,
				standing: 'delivered',
				delivered: true,
				silentSeconds: 9,
			},
		]);
		m.readGit.mockReturnValue('tip1');
		m.worktreeOfRef.mockReturnValue('/w');
		m.inspectWorktree.mockReturnValue({ edited: [], regenerable: [] });
		m.alive.mockReturnValue({ alive: false });
		m.removeUnitCheckout.mockResolvedValue({ deletedBranch: true });
		const reaped = await endDeliveredUnits({
			root: '/r',
			policy,
			apply: true,
		});
		expect(reaped).toMatchObject([{ ref: REF, outcome: 'removed' }]);
		expect(m.dropForgeCopy).toHaveBeenCalledWith(
			'/r',
			'origin',
			REF,
			'tip1',
		);
	});
});
