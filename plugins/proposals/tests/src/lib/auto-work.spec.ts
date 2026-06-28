import { execFileSync } from 'node:child_process';
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

describe('auto_work (one-call action plan)', async () => {
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

	it('builds the orchestration policy as a standalone pure helper', async () => {
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

	it("x00051 S3: persist mode 'commit' prepends an explicit agent_worktree create step", async () => {
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
		// The worktree step must appear BEFORE the persist step in the
		// plan, otherwise the persist push could race a worktree that
		// does not exist yet.
		const wtIdx = out.steps.findIndex(
			(s: string) => s.includes('agent_worktree') && s.includes('create'),
		);
		const persistIdx = out.steps.findIndex((s: string) =>
			s.includes('Persist the slice'),
		);
		expect(wtIdx).toBeGreaterThanOrEqual(0);
		expect(persistIdx).toBeGreaterThanOrEqual(0);
		expect(wtIdx).toBeLessThan(persistIdx);
		expect(out.steps[wtIdx]).toContain('action: "create"');
		expect(out.steps[wtIdx]).toContain('idempotent');
	});

	it("x00051 S3: persist mode 'commit-and-push' prepends the worktree step and references it in the push target", async () => {
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
		const wtStep = out.steps.find(
			(s: string) => s.includes('agent_worktree') && s.includes('create'),
		);
		expect(wtStep).toBeDefined();
		expect(wtStep).toContain('commit-and-push');
	});

	it("x00051 S3: persist mode 'none' omits the worktree step (no push ⇒ no isolation needed)", async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		const out = parse(await runAutoWork(options));
		const wtSteps = out.steps.filter(
			(s: string) => s.includes('agent_worktree') && s.includes('create'),
		);
		expect(wtSteps).toHaveLength(0);
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

describe('auto_work + loop-detector interaction (a00033 S3)', async () => {
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
			handoffPath: '.cache/mcp-vertex/handoff/stuck-agent.json',
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
		expect(out.handoffPath).toBe(
			'.cache/mcp-vertex/handoff/stuck-agent.json',
		);
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

// f00075 S4: front-hook blocks the plan when rescue candidates OR
// stashes are present. The engine composes `swarm_hygiene` +
// `stash_snapshot` at the top of `runAutoWork`, before slice
// selection. Tests below exercise the real-git path (init a temp
// repo, create a stash, run auto_work) so the contract is enforced
// end-to-end. Skip the suite when git is not on PATH.
describe('auto_work + front-hook (f00075 S4)', () => {
	const hasGit = (() => {
		try {
			execFileSync('git', ['--version'], { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	})();
	const itGit = hasGit ? it : it.skip;

	let root = '';
	let options: IAutoWorkToolOptions;

	beforeEach(() => {
		__resetIdleStreakForTesting();
		root = mkdtempSync(join(tmpdir(), 'auto-fh-'));
		// Initialise a real git repo with one commit on `develop` so
		// `runSwarmHygieneEngine` and `runStashSnapshot` can talk to a
		// repo, not just an empty tmpdir.
		execFileSync('git', ['init', '--initial-branch=main', root], {
			stdio: 'ignore',
		});
		execFileSync('git', ['-C', root, 'config', 'user.email', 'fh@test'], {
			stdio: 'ignore',
		});
		execFileSync('git', ['-C', root, 'config', 'user.name', 'fh'], {
			stdio: 'ignore',
		});
		execFileSync(
			'git',
			['-C', root, 'commit', '--allow-empty', '-m', 'init'],
			{ stdio: 'ignore' },
		);
		// Rename the default branch to `develop` so branch-status uses
		// the canonical base (runSwarmHygieneEngine defaults to
		// `develop` when none is supplied).
		try {
			execFileSync(
				'git',
				['-C', root, 'branch', '-m', 'main', 'develop'],
				{ stdio: 'ignore' },
			);
		} catch {
			// Some git versions already use `main` as the default; we
			// don't care about the name when there are no agent
			// branches — branch_status falls back to whatever it sees.
		}
		// Write the proposals index (one pending proposal so the
		// slice-selection cascade has something to fall back to IF the
		// front-hook lets it through).
		options = {
			namespacePrefix: 'proposals',
			indexPathAbs: join(root, 'index.json'),
			lockPathAbs: join(root, 'lock.json'),
			validationCommand: 'bun run validate',
			workspaceRoot: root,
		};
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1-x', file: 'p1.md', status: 'pending' }],
			}),
		);
		// The cascade reads the proposal markdown from
		// `dirname(indexPathAbs)/<entry.file>` (proposalsDirAbs fallback).
		// Without a real file on disk the cascade drops the entry as
		// `all-claimed` and the plan falls into the idle branch. The
		// front-hook in S4 is BEFORE the cascade, so a stash fixture is
		// enough to exercise the block — but the bypass test
		// (forceHygieneBypass:true) needs the cascade to find a real
		// proposal, so write a minimal markdown file.
		writeFileSync(join(root, 'p1.md'), '# p1-x\n\n## Slices\n\n');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	itGit(
		'f00075 S4: a present stash BLOCKS the plan (hygiene-blocked envelope, no slice selected)',
		async () => {
			// Drop a stash on the working tree. The stash's existence is
			// what the front-hook should detect and refuse to ignore.
			execFileSync(
				'git',
				[
					'-C',
					root,
					'stash',
					'push',
					'-u',
					'-m',
					'WIP on S4 stash fixture',
				],
				{ stdio: 'ignore' },
			);
			// Sanity check: the stash is actually there.
			const stashList = execFileSync(
				'git',
				['-C', root, 'stash', 'list'],
				{
					encoding: 'utf8',
				},
			);
			expect(stashList).toContain('stash@{0}');

			const out = parse(await runAutoWork(options));
			// Strict-mode envelope.
			expect(out.state).toBe('work');
			expect(out.ok).toBe(false);
			expect(out.reason).toBe('hygiene-blocked');
			expect(out.executionMode).toBe('blocked');
			// Stash rides on the response payload.
			expect(Array.isArray(out.stashes)).toBe(true);
			expect((out.stashes as unknown[]).length).toBe(1);
			expect((out.stashes as Array<{ ref: string }>)[0]?.ref).toBe(
				'stash@{0}',
			);
			// Blockers + rescueCandidates are surfaced in the response.
			expect(Array.isArray(out.hygieneBlockers)).toBe(true);
			expect((out.hygieneBlockers as string[])[0]).toMatch(/stash/i);
			// The slice-selection cascade was NEVER run — the plan does
			// not carry `proposalId` (the front-hook short-circuits
			// before `runContinueProposal` is called).
			expect(out.proposalId).toBeUndefined();
			expect(out.steps).toBeUndefined();
			// Hygiene actions/warnings should NOT fire when stashes are the
			// sole reason for blocking (no GC plan in this fixture).
			expect(out.hygieneActions).toBeUndefined();
		},
	);

	itGit(
		'f00075 S4: forceHygieneBypass:true overrides the stash block and proceeds to slice selection',
		async () => {
			execFileSync(
				'git',
				[
					'-C',
					root,
					'stash',
					'push',
					'-u',
					'-m',
					'WIP on S4 bypass fixture',
				],
				{ stdio: 'ignore' },
			);

			const out = parse(
				await runAutoWork({
					...options,
					inputForceHygieneBypass: true,
				}),
			);
			// The bypass unsnarls the front-hook; the cascade picks the
			// pending proposal and renders the normal work plan.
			expect(out.state).toBe('work');
			expect(out.reason).toBeUndefined();
			expect(out.ok).toBeUndefined();
			expect(out.executionMode).toBe('normal');
			expect(out.proposalId).toBe('p1-x');
			expect(Array.isArray(out.steps)).toBe(true);
			// Bypass is silent — no hygieneBlockers / hygieneActions /
			// hygieneWarnings on the response.
			expect(out.hygieneBlockers).toBeUndefined();
			expect(out.hygieneActions).toBeUndefined();
			expect(out.hygieneWarnings).toBeUndefined();
			expect(out.stashes).toBeUndefined();
		},
	);
});
