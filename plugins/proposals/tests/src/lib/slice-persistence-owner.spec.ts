import { describe, expect, it } from 'vitest';

import {
	announceSlicePersistence,
	resolveSlicePersistence,
} from '../../../src/lib/slice-persistence-owner';

describe('resolveSlicePersistence', () => {
	it('stands down when commit-policy owns slice persistence', () => {
		// Both committing means duplicate commits; the handoff is the
		// whole point of the two plugins agreeing on one owner.
		const resolution = resolveSlicePersistence({
			configuredMode: 'commit-and-push',
			commitPolicyOwnsSlices: true,
		});
		expect(resolution.mode).toBe('none');
		expect(resolution.owner).toBe('commit-policy');
		expect(resolution.lines).toEqual([]);
	});

	it('keeps its own configured mode when commit-policy does not', () => {
		const resolution = resolveSlicePersistence({
			configuredMode: 'commit',
			commitPolicyOwnsSlices: false,
		});
		expect(resolution.mode).toBe('commit');
		expect(resolution.owner).toBe('proposals');
		expect(resolution.lines).toEqual([]);
	});

	it('says so, loudly, when NOBODY commits finished slices', () => {
		// The expensive case for an agent: every slice succeeds, nothing
		// is committed, no `shipped-in` SHA can exist, so the closing gate
		// refuses forever — and the agent retries the only thing it knows
		// how to do, more slices, without ever closing anything.
		const resolution = resolveSlicePersistence({
			configuredMode: undefined,
			commitPolicyOwnsSlices: false,
		});
		expect(resolution.mode).toBe('none');
		expect(resolution.owner).toBe('nobody');
		const text = resolution.lines.join('\n');
		expect(text).toContain('No component commits finished slices');
		expect(text).toContain('shipped-in');
		expect(text).toContain('plugins.commit-policy.options.commit');
		expect(text).toContain('plugins.proposals.options.persist.mode');
	});

	it('treats an explicit "none" as the same unowned state', () => {
		// Writing "none" by hand is legitimate — someone commits manually
		// — but it produces exactly the same dead end for an agent, so it
		// gets the same warning, which says as much.
		const resolution = resolveSlicePersistence({
			configuredMode: 'none',
			commitPolicyOwnsSlices: false,
		});
		expect(resolution.owner).toBe('nobody');
		expect(resolution.lines.join('\n')).toContain('commit by hand');
	});

	it('obeys the configuration exactly — it only changes what is said', () => {
		// The warning must never become a silent behaviour change: an
		// unowned host still resolves to 'none'.
		expect(
			resolveSlicePersistence({
				configuredMode: undefined,
				commitPolicyOwnsSlices: false,
			}).mode,
		).toBe('none');
	});
});

describe('announceSlicePersistence', () => {
	it('writes nothing when persistence has an owner', () => {
		const written: string[] = [];
		announceSlicePersistence(
			resolveSlicePersistence({
				configuredMode: 'commit',
				commitPolicyOwnsSlices: false,
			}),
			(line) => written.push(line),
		);
		expect(written).toEqual([]);
	});

	it('never throws when the writer does', () => {
		expect(() =>
			announceSlicePersistence(
				resolveSlicePersistence({
					configuredMode: undefined,
					commitPolicyOwnsSlices: false,
				}),
				() => {
					throw new Error('stderr is closed');
				},
			),
		).not.toThrow();
	});
});
