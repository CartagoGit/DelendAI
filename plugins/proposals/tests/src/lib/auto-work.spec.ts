import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	__resetIdleStreakForTesting,
	runAutoWork,
	type IAutoWorkToolOptions,
} from '@mcp-vertex/proposals/lib/tools/auto-work.tool';

// The tool declares an `outputSchema`, so the MCP SDK requires
// `structuredContent` on every response — a text-only payload throws
// "Output validation error" at the transport layer (caught the hard way
// when the idle branch returned text-only). Assert it here so any branch
// that regresses to text-only fails the suite, not just runtime.
const parse = (result: {
	content: Array<{ text: string }>;
	structuredContent?: unknown;
}): any => {
	const value = JSON.parse(result.content[0]?.text ?? '{}');
	expect(result.structuredContent).toEqual(value);
	return value;
};

describe('auto_work (one-call action plan)', () => {
	let root = '';
	let options: IAutoWorkToolOptions;

	beforeEach(() => {
		__resetIdleStreakForTesting();
		root = mkdtempSync(join(tmpdir(), 'auto-'));
		options = {
			namespacePrefix: 'proposals',
			indexPathAbs: join(root, 'index.json'),
			lockPathAbs: join(root, 'lock.json'),
			validationCommand: 'bun run validate',
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('returns idle when nothing is actionable', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const out = parse(await runAutoWork(options));
		expect(out.state).toBe('idle');
	});

	it('escalates to a hard stop after 3 consecutive idle calls (and resets on work)', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // 1
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // 2
		const third = parse(await runAutoWork(options)); // 3 → stop
		expect(third.stop).toBe(true);
		expect(third.idleStreak).toBe(3);

		// Actionable work resets the streak; idle afterwards no longer stops.
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		expect(parse(await runAutoWork(options)).state).toBe('work');
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		expect(parse(await runAutoWork(options)).stop).toBeUndefined(); // streak reset → 1
	});

	it('returns a work plan with the configured validation command', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(options));
		expect(out.state).toBe('work');
		expect(out.proposalId).toBe('p1-x');
		expect(out.validationCommand).toBe('bun run validate');
		expect(Array.isArray(out.steps)).toBe(true);
	});

	it("plan with persist mode 'none' has no persist step (default behaviour, p109)", async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(options));
		expect(out.persist).toEqual({ mode: 'none' });
		expect(
			out.steps.some((s: string) => s.includes('Persist the slice')),
		).toBe(false);
	});

	it("plan with persist mode 'commit' includes a single persist step", async () => {
		const commitOptions: IAutoWorkToolOptions = {
			...options,
			persist: { mode: 'commit' },
		};
		writeFileSync(
			commitOptions.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(commitOptions));
		expect(out.persist.mode).toBe('commit');
		const persistSteps = out.steps.filter((s: string) =>
			s.includes('Persist the slice'),
		);
		expect(persistSteps).toHaveLength(1);
		expect(persistSteps[0]).toContain('mode: "commit"');
		expect(persistSteps[0]).toContain('maybePersistAfterSlice');
	});

	it("plan with persist mode 'commit-and-push' includes the push warning", async () => {
		const pushOptions: IAutoWorkToolOptions = {
			...options,
			persist: { mode: 'commit-and-push', pushTarget: 'origin agent/p1' },
		};
		writeFileSync(
			pushOptions.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(pushOptions));
		expect(out.persist.mode).toBe('commit-and-push');
		expect(out.persist.pushTarget).toBe('origin agent/p1');
		const persistSteps = out.steps.filter((s: string) =>
			s.includes('Persist the slice'),
		);
		expect(persistSteps).toHaveLength(1);
		expect(persistSteps[0]).toContain('commit + push');
		expect(persistSteps[0]).toContain('refuses to push to `main`');
	});

	it('input.persist overrides config.persist.mode (priority chain, p109 §2)', async () => {
		const commitOptions: IAutoWorkToolOptions = {
			...options,
			persist: { mode: 'commit' },
		};
		writeFileSync(
			commitOptions.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		// input.persist='commit-and-push' must win over config 'commit'.
		const out = parse(
			await runAutoWork({
				...commitOptions,
				inputPersist: 'commit-and-push',
			}),
		);
		expect(out.persist.mode).toBe('commit-and-push');
	});
});
