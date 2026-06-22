import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_DELEGATE_AFTER_TOOL_CALLS,
	__resetIdleStreakForTesting,
	buildAutoWorkOrchestrationPolicy,
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

	it('surfaces a compact orchestration policy for non-trivial slices', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(options));
		expect(out.orchestration).toEqual({
			lane: 'inspect-then-delegate',
			delegateAfterToolCalls: DEFAULT_DELEGATE_AFTER_TOOL_CALLS,
			next: 'proposals_continue_proposal { proposalId: "p1-x", mode: "plan" }',
			policy: 'Keep the main thread to auto_work/plan/delegate. If the slice needs >3 tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the research here.',
		});
		expect(out.steps.join('\n')).toContain(
			'proposals_delegate one claimable slice',
		);
		expect(out.steps.join('\n')).toContain('proposals_await_lock once');
		expect(out.steps.join('\n')).toContain(
			'If that was the last open slice for the proposal, run proposals_sync_proposals once; otherwise do not sync mid-flight.',
		);
	});

	it('allows hosts to tune the auto_work delegation threshold', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(
			await runAutoWork({
				...options,
				orchestration: { delegateAfterToolCalls: 1 },
			}),
		);
		expect(out.orchestration.delegateAfterToolCalls).toBe(1);
		expect(out.orchestration.policy).toContain('>1 tool calls');
	});

	it('builds the orchestration policy as a standalone pure helper', () => {
		expect(
			buildAutoWorkOrchestrationPolicy({
				namespacePrefix: 'work',
				proposalId: 'f12-core',
				delegateAfterToolCalls: 2,
			}),
		).toEqual({
			lane: 'inspect-then-delegate',
			delegateAfterToolCalls: 2,
			next: 'work_continue_proposal { proposalId: "f12-core", mode: "plan" }',
			policy: 'Keep the main thread to auto_work/plan/delegate. If the slice needs >2 tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the research here.',
		});
	});

	it("plan with persist mode 'none' has no persist step (default behaviour, l109)", async () => {
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

	it('input.persist overrides config.persist.mode (priority chain, l109 §2)', async () => {
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

describe('auto_work + loop-detector interaction (a00033 S3)', () => {
	let root = '';
	let options: IAutoWorkToolOptions;

	beforeEach(() => {
		__resetIdleStreakForTesting();
		root = mkdtempSync(join(tmpdir(), 'auto-lp-'));
		options = {
			namespacePrefix: 'proposals',
			indexPathAbs: join(root, 'index.json'),
			lockPathAbs: join(root, 'lock.json'),
			validationCommand: 'bun run validate',
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	// Fake detector that ALWAYS says "stuck" with a handoff payload,
	// modelled on what the production AgentLoopDetectorService returns
	// from `isAgentStuck(tool, args)` when it detects an exact-repeat
	// loop (see loop-detector-service.ts). The point is to prove the
	// tool short-circuits BEFORE consulting the detector when the
	// tool is in the disable list.
	const stuckDetector = {
		isAgentStuck: () => ({
			handoffPath: '.mcp-vertex/handoff/stuck-agent.json',
			suggestedAction: 'call proposals_continue_proposal mode:auto',
		}),
	};

	it('skips the loop detector for `proposals_auto_work` by default (a00033 S3 / H1)', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const out = parse(
			await runAutoWork({
				...options,
				loopDetector: stuckDetector,
			}),
		);
		// The detector would have returned stop=true, but the disable
		// list contains `proposals_auto_work` by default, so the tool
		// falls through to the in-tool idle-streak branch.
		expect(out.state).toBe('idle');
		expect(out.reason).not.toBe('stuck-detected');
		expect(out.stop).toBeUndefined();
	});

	it('still consults the loop detector when `loopDetectorDisableFor` is empty', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const out = parse(
			await runAutoWork({
				...options,
				loopDetector: stuckDetector,
				loopDetectorDisableFor: [],
			}),
		);
		// Empty disable list ⇒ detector wins ⇒ stop with stuck-detected.
		expect(out.state).toBe('idle');
		expect(out.stop).toBe(true);
		expect(out.reason).toBe('stuck-detected');
		expect(out.handoffPath).toBe('.mcp-vertex/handoff/stuck-agent.json');
	});

	it('honors a custom disable list (a host can opt other tools out too)', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const out = parse(
			await runAutoWork({
				...options,
				loopDetector: stuckDetector,
				// Explicitly include the auto_work tool name → same effect
				// as the default but proves the override path.
				loopDetectorDisableFor: [
					'some_other_tool',
					'proposals_auto_work',
				],
			}),
		);
		expect(out.state).toBe('idle');
		expect(out.reason).not.toBe('stuck-detected');
	});

	it('in-tool `consecutiveIdle` streak is the sole brake for the no-args case (3 idle → stop)', async () => {
		writeFileSync(options.indexPathAbs, JSON.stringify({ proposals: [] }));
		const opts: IAutoWorkToolOptions = {
			...options,
			loopDetector: stuckDetector,
		};
		// Two idle returns: no stop yet.
		expect(parse(await runAutoWork(opts)).stop).toBeUndefined();
		expect(parse(await runAutoWork(opts)).stop).toBeUndefined();
		// Third idle: in-tool streak trips, stop with the recovery hint.
		const third = parse(await runAutoWork(opts));
		expect(third.stop).toBe(true);
		expect(third.idleStreak).toBe(3);
		expect(third.reason).not.toBe('stuck-detected');
	});
});
