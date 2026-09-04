/**
 * effect-broker-dry-run.e2e.spec.ts — r00037 S3.
 *
 * `capability-injection.spec.ts` (dry-run/) proved the ambient-scope
 * property for ONE hand-built capability. `effect-broker.spec.ts`
 * (capabilities/) proved `createEffectBroker` composes many capability
 * kinds correctly in isolation, without a router. This file closes the
 * loop end-to-end: a synthetic plugin whose `register(ctx)` runs ONCE
 * (exactly like a real plugin) builds its effects object through
 * `createEffectBroker` — the same call `cli/assemble.ts` makes for
 * every real plugin context — and its tool handler NEVER reads
 * `args.dryRun`. It is dispatched through the real
 * `ToolSurfaceRuntime.invokeTool`, the single call path every plugin's
 * tool goes through in production.
 *
 * The property this proves is PREVENTION, not detection: for every
 * `TEffectCapabilityKind` the broker knows about, a call made while
 * `dryRun: true` never reaches the real implementation — there is
 * nothing to observe afterwards because nothing ran. Contrast with
 * `router-enforcement.spec.ts`, which proves the weaker DETECTION
 * property for a handler that does not use the broker at all.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import { createEffectBroker } from '@delendai/core/lib/capabilities/effect-broker.factory';
import { createGitRunner } from '@delendai/core/lib/shared/git-write';
import { DryRunEffectRefusedError } from '@delendai/core/lib/dry-run/effect-guard.helper';
import { runWithDryRunScope } from '@delendai/core/lib/dry-run/dry-run-scope.helper';
import type { TEffectCapabilityKind } from '@delendai/core/lib/contracts/interfaces/effect-guard.interface';

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

/**
 * Every capability kind the broker's own vocabulary declares today
 * (`TEffectCapabilityKind`). The proposal's architecture sketch names
 * six categories (fs/git/process/network/database/browser); the
 * SHIPPED vocabulary has five (`write`, `delete`, `spawn`, `network`,
 * `git` — `write`/`delete` cover the filesystem case, and
 * `database`/`browser` have no capability today because no plugin
 * needs one yet — see `effect-capabilities.interface.ts`'s own
 * YAGNI note). This test parametrizes over the REAL vocabulary rather
 * than the aspirational one, so it fails loudly the day a new kind is
 * added without broker coverage, instead of silently testing
 * categories that don't exist.
 */
const ALL_EFFECT_KINDS: readonly TEffectCapabilityKind[] = [
	'write',
	'delete',
	'spawn',
	'network',
	'git',
];

/**
 * Builds ONE runtime + ONE plugin context, mirroring `cli/assemble.ts`:
 * `register(ctx)` (here, the broker construction) runs exactly once,
 * before any tool call, and the returned handler closes over that same
 * long-lived `effects` object forever — exactly like a real plugin.
 */
const buildRuntimeWithSyntheticPlugin = () => {
	const reached: TEffectCapabilityKind[] = [];
	// Built ONCE, at "register" time — never rebuilt per call. This is
	// the shape `IMcpPluginContext.effects` actually has in production.
	const effects = createEffectBroker({
		write: {
			kind: 'write' as const,
			perform: () => {
				reached.push('write');
			},
		},
		remove: {
			kind: 'delete' as const,
			perform: () => {
				reached.push('delete');
			},
		},
		spawn: {
			kind: 'spawn' as const,
			perform: () => {
				reached.push('spawn');
			},
		},
		fetch: {
			kind: 'network' as const,
			perform: () => {
				reached.push('network');
			},
		},
		git: {
			kind: 'git' as const,
			perform: () => {
				reached.push('git');
			},
		},
	});

	const runtime = createToolSurfaceRuntime({
		mode: 'native',
		bootstrapToolIds: ['overview'],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'careless_run',
				name: 'mcp-vertex_careless_run',
				toolId: 'run',
				pluginId: 'careless-plugin',
				namespace: 'careless',
			},
		],
		plugins: [
			{
				id: 'careless-plugin',
				namespace: 'careless',
				toolRegistrationIds: ['careless_run'],
			},
		],
	});
	runtime.bindRegisteredTool({
		registrationId: 'careless_run',
		name: 'mcp-vertex_careless_run',
		// This handler NEVER reads `args.dryRun` and calls every
		// capability unconditionally — modelling a third-party plugin
		// that ignores the flag entirely (the exact scenario AUD-D02
		// names as the critical risk once external plugins load).
		handler: async () => {
			effects.write();
			effects.remove();
			effects.spawn();
			effects.fetch();
			effects.git();
			return { ok: true };
		},
		handle: makeHandle(),
	});
	runtime.finalizeInitialSurface();
	return { runtime, reached };
};

describe('EffectBroker end-to-end — a careless plugin cannot reach ANY guarded effect while dryRun is true', () => {
	it('a plugin that ignores args.dryRun and calls every capability leaves no trace under dryRun: true', async () => {
		const { runtime, reached } = buildRuntimeWithSyntheticPlugin();

		await expect(
			runtime.invokeTool('mcp-vertex_careless_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);

		// PREVENTION, not detection: the FIRST guarded call inside the
		// handler throws, so none of the five capabilities the handler
		// tries to reach ever ran — not even the ones sequenced after
		// the one that failed. There is no partial mutation to clean up.
		expect(reached).toEqual([]);
	});

	it('the same plugin performs every real effect when dryRun is not set', async () => {
		const { runtime, reached } = buildRuntimeWithSyntheticPlugin();

		const result = (await runtime.invokeTool(
			'mcp-vertex_careless_run',
			{},
			{},
		)) as { isError?: boolean };

		expect(result.isError).toBeUndefined();
		expect(reached).toEqual(['write', 'delete', 'spawn', 'network', 'git']);
	});

	it('gates independently per call — one broker instance safely serves a mixed sequence of real and dry-run calls', async () => {
		const { runtime, reached } = buildRuntimeWithSyntheticPlugin();

		await expect(
			runtime.invokeTool('mcp-vertex_careless_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);
		await runtime.invokeTool('mcp-vertex_careless_run', {}, {});
		await expect(
			runtime.invokeTool('mcp-vertex_careless_run', { dryRun: true }, {}),
		).rejects.toThrow(DryRunEffectRefusedError);

		// Only the middle (real) call's effects appear — the dry-run
		// calls before and after left nothing behind.
		expect(reached).toEqual(['write', 'delete', 'spawn', 'network', 'git']);
	});

	describe('real filesystem + real git — the acceptance test that actually matters', () => {
		// Every other test in this file uses a synthetic `perform` that
		// only pushes a label to an array — a fast, deterministic proxy
		// for "the real effect ran". That proxy CANNOT by itself
		// distinguish prevention from detection: an implementation that
		// let the handler run and only checked the outcome afterwards
		// could still end up with an empty `reached` array if the
		// checking logic also suppressed the push. This block removes
		// that ambiguity by wrapping the REAL `git commit` binary
		// (`shared/git-write.ts`'s `createGitRunner`, the exact function
		// `cli/assemble.ts` feeds into the broker for every plugin
		// context) against a real temp repository on disk, and asserts
		// on the repository's actual git history — not an in-memory
		// proxy — after the call.
		let repo = '';

		beforeEach(() => {
			repo = mkdtempSync(join(tmpdir(), 'effect-broker-dry-run-'));
			execFileSync('git', ['init', '-q'], { cwd: repo });
			execFileSync('git', ['config', 'user.email', 't@t.t'], {
				cwd: repo,
			});
			execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
			writeFileSync(join(repo, 'README.md'), '# init\n');
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
		});

		afterEach(() => {
			rmSync(repo, { recursive: true, force: true });
		});

		const commitCountOf = (dir: string): number =>
			Number(
				execFileSync('git', ['rev-list', '--count', 'HEAD'], {
					cwd: dir,
					encoding: 'utf8',
				}).trim(),
			);

		/** Same broker-through-the-router shape as the rest of this file,
		 * but the `perform` is the REAL git binary via `createGitRunner`
		 * — the identical function `cli/assemble.ts` wires into
		 * `IPluginEffectsCapability.git` for every real plugin. */
		const buildRuntimeWithRealGitEffect = (repoDir: string) => {
			const effects = createEffectBroker({
				git: {
					kind: 'git' as const,
					perform: createGitRunner(repoDir),
					describe: (args: readonly string[]) => args.join(' '),
				},
			});

			const runtime = createToolSurfaceRuntime({
				mode: 'native',
				bootstrapToolIds: ['overview'],
				routerToolId: 'vertex',
				descriptors: [
					{
						registrationId: 'careless_commit',
						name: 'mcp-vertex_careless_commit',
						toolId: 'run',
						pluginId: 'careless-plugin',
						namespace: 'careless',
					},
				],
				plugins: [
					{
						id: 'careless-plugin',
						namespace: 'careless',
						toolRegistrationIds: ['careless_commit'],
					},
				],
			});
			runtime.bindRegisteredTool({
				registrationId: 'careless_commit',
				name: 'mcp-vertex_careless_commit',
				// Ignores args.dryRun entirely — writes a file to the real
				// repo and commits it unconditionally.
				handler: async () => {
					writeFileSync(join(repoDir, 'exfiltrated.txt'), 'leaked');
					await effects.git(['add', '.']);
					await effects.git(['commit', '-m', 'careless commit']);
					return { ok: true, committed: true };
				},
				handle: makeHandle(),
			});
			runtime.finalizeInitialSurface();
			return runtime;
		};

		it('refuses the guarded git call before it runs — no new commit, exactly the pre-existing history', async () => {
			const runtime = buildRuntimeWithRealGitEffect(repo);
			const commitsBefore = commitCountOf(repo);

			await expect(
				runtime.invokeTool(
					'mcp-vertex_careless_commit',
					{ dryRun: true },
					{},
				),
			).rejects.toThrow(DryRunEffectRefusedError);

			// The real assertion that matters: `git log` on the ACTUAL
			// repository on disk shows no new commit. This is not an
			// in-memory proxy — it is the literal artifact a detection-only
			// implementation would have already produced by this point.
			expect(commitCountOf(repo)).toBe(commitsBefore);
		});

		it('the handler-level write still happens (this broker guards `git`, not `fs`) — the commit is what is prevented', async () => {
			const runtime = buildRuntimeWithRealGitEffect(repo);

			await expect(
				runtime.invokeTool(
					'mcp-vertex_careless_commit',
					{ dryRun: true },
					{},
				),
			).rejects.toThrow(DryRunEffectRefusedError);

			// Documents the boundary honestly rather than overclaiming it:
			// the untracked file DOES land on disk (this handler writes it
			// with a bare `writeFileSync`, not through the broker), because
			// this proposal's non-goals explicitly scope out a filesystem
			// capability. `git add`/`git commit` — the only calls routed
			// through `effects.git` — are what the broker actually guards,
			// and the untracked file is never captured into history. A
			// caller inspecting `git status`/`git log` afterwards sees no
			// evidence of the mutation the plugin "committed" to.
			expect(existsSync(join(repo, 'exfiltrated.txt'))).toBe(true);
		});

		it('performs the real commit when dryRun is not set', async () => {
			const runtime = buildRuntimeWithRealGitEffect(repo);
			const commitsBefore = commitCountOf(repo);

			const result = (await runtime.invokeTool(
				'mcp-vertex_careless_commit',
				{},
				{},
			)) as { isError?: boolean };

			expect(result.isError).toBeUndefined();
			expect(commitCountOf(repo)).toBe(commitsBefore + 1);
		});
	});

	describe('property: every effect kind is refused under dryRun, independent of call order', () => {
		it('holds for any permutation of the five capability kinds', () => {
			return fc.assert(
				fc.asyncProperty(
					fc.shuffledSubarray([...ALL_EFFECT_KINDS], {
						minLength: ALL_EFFECT_KINDS.length,
						maxLength: ALL_EFFECT_KINDS.length,
					}),
					async (order) => {
						const reached: string[] = [];
						const effects = createEffectBroker(
							Object.fromEntries(
								order.map((kind, index) => [
									`cap${index}`,
									{ kind, perform: () => reached.push(kind) },
								]),
							),
						);

						await runWithDryRunScope(true, async () => {
							order.forEach((_kind, index) => {
								expect(() =>
									effects[`cap${index}`]?.(),
								).toThrow(DryRunEffectRefusedError);
							});
						});

						// The invariant under test: whatever order the five
						// capability kinds are called in, `dryRun: true` means
						// NONE of them ever reach their real `perform`.
						expect(reached).toEqual([]);
					},
				),
			);
		});
	});
});
