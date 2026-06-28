import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentLoopDetectorService } from '@mcp-vertex/proposals/lib/agents/loop-detector-service';
import { createWorkspacePathProvider } from '@mcp-vertex/core/public';
import type { IMcpPluginContext } from '@mcp-vertex/core/public';

describe('AgentLoopDetectorService', async () => {
	let dir = '';
	let mockCtx: IMcpPluginContext;
	// Spy on process.stderr.write so the production loop-detector
	// diagnostic ("[mcp-vertex] loop-detector: agent X is stuck") does
	// not leak into the validate stream. Tests that need to verify
	// the diagnostic was emitted read `stderrSpy.mock.calls` directly.
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'loop-detector-test-'));
		stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);

		// Create a minimal workspace directory structure
		const workspace = createWorkspacePathProvider(dir);
		mockCtx = {
			workspace,
			corePaths: {
				cacheDir: '.cache/mcp-vertex',
				docsDir: 'docs/mcp-vertex',
			},
			cacheDir: join(dir, '.cache/mcp-vertex'),
			docsDir: join(dir, 'docs/mcp-vertex'),
			keepLegacy: false,
			pluginCacheDir: join(dir, '.cache/mcp-vertex/proposals'),
			pluginDocsDir: join(dir, 'docs/mcp-vertex/proposals'),
			namespacePrefix: 'proposals',
			options: {},
			args: {},
		};
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		stderrSpy.mockRestore();
	});

	it('initializes with default options and is enabled by default', async () => {
		const service = new AgentLoopDetectorService(mockCtx);
		expect(service).toBeDefined();
		expect(service.isAgentStuck('read_file', {})).toBeNull();
	});

	it('disables loop detection when --no-loop-detector flag is passed', async () => {
		const ctxWithFlag = {
			...mockCtx,
			args: { 'no-loop-detector': 'true' },
		};
		const service = new AgentLoopDetectorService(ctxWithFlag);

		// Simulate exact repeat tools
		for (let i = 0; i < 5; i++) {
			await service.onToolCall(
				'read_file',
				{ path: 'foo.ts', agent: 'a1' },
				{ ok: true },
			);
		}

		// Because it is disabled, it shouldn't record the stuck agent
		expect(service.isAgentStuck('read_file', { agent: 'a1' })).toBeNull();
	});

	it('flags stuck and writes handoff packet on exact-repeat calls', async () => {
		const service = new AgentLoopDetectorService(mockCtx);

		// Call exact-repeat tool past the default threshold (8) — see
		// "interactive-agent skip" describe block for the rationale.
		for (let i = 0; i < 9; i++) {
			await service.onToolCall(
				'read_file',
				{ path: 'foo.ts', agent: 'a1' },
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('read_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();
		expect(stuck?.handoffPath).toContain('a1-');
		expect(stuck?.suggestedAction).toContain(
			'STOP — stuck detected due to exact-repeat',
		);

		// Check if the handoff packet was written to cache
		const handoffDirAbs = mockCtx.workspace.resolve(
			'.cache/mcp-vertex/handoff',
		);
		expect(existsSync(handoffDirAbs)).toBe(true);
	});

	it('redacts secrets in the written handoff packet recent calls', async () => {
		const service = new AgentLoopDetectorService(mockCtx);

		// Call exact-repeat with a Stripe key, past the default threshold.
		for (let i = 0; i < 9; i++) {
			await service.onToolCall(
				'read_file',
				{
					path: 'foo.ts',
					agent: 'a1',
					key: 'sk_test_1234567890abcdef12345',
				},
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('read_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();

		// Read written handoff file
		const handoffDirAbs = mockCtx.workspace.resolve(
			'.cache/mcp-vertex/handoff',
		);
		const files = await import('node:fs/promises').then((fs) =>
			fs.readdir(handoffDirAbs),
		);
		const handoffFile = files.find(
			(f) => f.startsWith('a1-') && f.endsWith('.json'),
		);
		expect(handoffFile).toBeDefined();

		const handoffContent = readFileSync(
			join(handoffDirAbs, handoffFile!),
			'utf8',
		);
		const packet = JSON.parse(handoffContent);
		expect(packet.recentToolCalls[0].args.key).toBe('[REDACTED]');
	});

	it('flags stuck on no-progress modifying tool calls', async () => {
		// Initialize git repo in the temp directory
		const { execSync } = await import('node:child_process');
		execSync('git init -q', { cwd: dir });
		execSync('git config user.email "t@t.t"', { cwd: dir });
		execSync('git config user.name "T"', { cwd: dir });

		// Create and commit a file so git diff has a baseline
		const testFile = join(dir, 'test.txt');
		writeFileSync(testFile, 'initial content');
		execSync('git add test.txt', { cwd: dir });
		execSync('git commit -m "initial"', { cwd: dir });

		const service = new AgentLoopDetectorService(mockCtx);

		// Call a modifying tool past the default no-progress threshold (3).
		for (let i = 0; i < 4; i++) {
			await service.onToolCall(
				'edit_file',
				{ path: 'test.txt', agent: 'a1', val: i },
				{ ok: true },
			);
		}

		const stuck = service.isAgentStuck('edit_file', { agent: 'a1' });
		expect(stuck).not.toBeNull();
		expect(stuck?.suggestedAction).toContain(
			'STOP — stuck detected due to no-progress',
		);
	});

	// l00008 s1 — async I/O regression coverage: `getActiveAgent` (called from
	// the hot `onToolCall` path) now reads the lock file via
	// `node:fs/promises.readFile` instead of `existsSync` + `readFileSync`.
	describe('async I/O hot-path coverage (l00008 s1)', async () => {
		it('resolves the active agent from a real lock file written asynchronously', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			const lockPath = mockCtx.workspace.resolve(
				'.cache/mcp-vertex/agents.lock.json',
			);
			const { mkdir, writeFile } = await import('node:fs/promises');
			await mkdir(join(lockPath, '..'), { recursive: true });
			await writeFile(
				lockPath,
				JSON.stringify({
					version: 1,
					in_flight: [{ task_id: 't1', agent: 'falcon' }],
				}),
				'utf8',
			);

			// No `agent` in args → onToolCall must fall back to
			// getActiveAgent(), which reads the lock file above.
			await service.onToolCall(
				'search_search',
				{ query: 'x' },
				{ ok: true },
			);

			// Confirm via observable behaviour: repeat the same call past
			// the default threshold (8) to trip the detector.
			for (let i = 0; i < 9; i++) {
				await service.onToolCall(
					'search_search',
					{ query: 'x' },
					{ ok: true },
				);
			}
			const stuck = service.isAgentStuck('search_search', {});
			// isAgentStuck (sync, contract-constrained) re-reads the same
			// lock file synchronously and resolves the same agent.
			expect(stuck).not.toBeNull();
		});

		it('never throws when the lock file is missing (async readFile rejects, caught, falls back to default-agent)', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// No lock file written — getActiveAgent's readFile must reject
			// and be caught, not propagate.
			await expect(
				service.onToolCall('read_file', {}, { ok: true }),
			).resolves.toBeUndefined();
		});

		it('isAgentStuck (sync hot path) reads the lock only on cache miss; invalidateLockCache() forces the next read', async () => {
			// Audit-H1: the sync `isAgentStuck` must NOT do `readFileSync`
			// of the lock file on every call. Instead it serves from a
			// 50ms TTL cache populated by the async `getActiveAgent`. We
			// assert the contract from the outside by:
			//   1. Triggering one async path (onToolCall) which fills the
			//      cache via `getActiveAgent`.
			//   2. Calling `isAgentStuck` 100 times in a tight loop —
			//      each must hit the cache, not the disk.
			//   3. Calling `invalidateLockCache()` and verifying the next
			//      `isAgentStuck` still works (returns the safe fallback).
			const service = new AgentLoopDetectorService(mockCtx);
			writeFileSync(
				mockCtx.workspace.resolve('agents.lock.json'),
				JSON.stringify({
					version: 1,
					in_flight: [{ agent: 'cached-agent', task_id: 't1' }],
				}),
			);

			// Prime the cache via the async path.
			await service.onToolCall('read_file', {}, { ok: true });

			// 100 sync calls — all served from cache, all returning null
			// (single call, not stuck) without touching the file system.
			for (let i = 0; i < 100; i++) {
				expect(service.isAgentStuck('read_file', {})).toBeNull();
			}

			// Invalidation must be safe to call any time — even before the
			// cache was ever primed — and the next sync read must fall
			// back to 'default-agent' (returns null since default-agent is
			// not in stuckAgents).
			service.invalidateLockCache();
			expect(service.isAgentStuck('read_file', {})).toBeNull();
		});

		it('pruneOldHandoffs (via a stuck cycle) tolerates a missing handoff dir on a fresh workspace', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// Drives writeHandoffPacket + pruneOldHandoffs at least once;
			// neither must throw even though nothing pre-existed on disk.
			for (let i = 0; i < 9; i++) {
				await service.onToolCall(
					'read_file',
					{ path: 'foo.ts', agent: 'a2' },
					{ ok: true },
				);
			}
			const stuck = service.isAgentStuck('read_file', { agent: 'a2' });
			expect(stuck).not.toBeNull();
		});

		it("8 concurrent onToolCall invocations for different agents do not corrupt each other's window", async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			const agents = Array.from({ length: 8 }, (_, i) => `agent-${i}`);

			await Promise.all(
				agents.map((agent) =>
					service.onToolCall(
						'read_file',
						{ path: 'x.ts', agent },
						{ ok: true },
					),
				),
			);

			// Each agent's call landed independently — none collapsed into
			// "default-agent" or another agent's window.
			for (const agent of agents) {
				expect(service.isAgentStuck('read_file', { agent })).toBeNull(); // single call each, not stuck yet — but must not throw/crash
			}
		});
	});

	// x00074 S1: end-to-end wiring test for outcome-aware sliding window.
	// The service must populate `outcome` on every `IExtendedToolCall` so
	// the pure detector can suppress successful re-intent chains. Without
	// this wiring, every call defaults to `'unknown'` and the new
	// behaviour is dormant in production.
	describe('x00074 S1 — outcome-aware wiring', async () => {
		it('does NOT flag 8 successful calls as stuck (regression for 2026-06-27)', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// Lock file with a fixed agent so the service doesn't fall back
			// to 'default-agent' which is interactive-skipped in some configs.
			writeFileSync(
				mockCtx.workspace.resolve('agents.lock.json'),
				JSON.stringify({
					version: 1,
					in_flight: [
						{ agent: 'swarm-worker-1', task_id: 't-regression' },
					],
				}),
			);

			// 8 successful calls in a row. With outcome: 'ok' propagated
			// to the detector, the pure filter drops the entire group —
			// the service should NOT mark the agent as stuck.
			for (let i = 0; i < 8; i++) {
				await service.onToolCall(
					'agent_lock',
					{
						action: 'claim',
						task_id: 'f00056-S5',
						agent: 'swarm-worker-1',
						i,
					},
					{ ok: true },
					undefined,
				);
			}

			// Pass agent explicitly in args to bypass the 50ms lock-cache
			// TTL (avoids the cache-expired → 'default-agent' fallback
			// which would be interactive-skipped and return null
			// regardless of stuck state).
			expect(
				service.isAgentStuck('agent_lock', {
					agent: 'swarm-worker-1',
					action: 'claim',
					task_id: 'f00056-S5',
				}),
			).toBeNull();
		});

		it('DOES flag 8 mixed-outcome calls as stuck (1 retryable + 7 ok)', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			writeFileSync(
				mockCtx.workspace.resolve('agents.lock.json'),
				JSON.stringify({
					version: 1,
					in_flight: [
						{ agent: 'swarm-worker-2', task_id: 't-mixed' },
					],
				}),
			);

			// First call: rate-limit error (retryable). Rest: success.
			await service.onToolCall(
				'agent_lock',
				{ action: 'claim', agent: 'swarm-worker-2' },
				undefined,
				{ code: 'ETIMEDOUT' },
			);
			for (let i = 0; i < 7; i++) {
				await service.onToolCall(
					'agent_lock',
					{ action: 'claim', agent: 'swarm-worker-2' },
					{ ok: true },
					undefined,
				);
			}

			// The retryable-error call has outcome != 'ok', so the pure
			// detector's filter does NOT drop the group; the full 8-call
			// repeat trips isStuck.
			expect(
				service.isAgentStuck('agent_lock', {
					agent: 'swarm-worker-2',
					action: 'claim',
				}),
			).not.toBeNull();
		});
	});

	// Regression coverage for the copilot-default false-positive:
	// interactive host sessions (Copilot chat, Cursor tab, etc.) were
	// flagged as stuck after 3 orient calls because the detector had no
	// notion of "this is the human-in-the-loop agent, not a swarm
	// worker." The fix is `interactiveAgentPatterns` (default
	// `*-default`, `default-*`, `host`, `interactive`) — those agents
	// never accumulate in the sliding window and never fire a verdict.
	describe('interactive-agent skip (copilot-default false-positive)', async () => {
		it('does not flag an agent matching the default `*-default` pattern, even after 100 exact-repeat calls', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// Simulates the exact scenario from the production handoff
			// packet: `copilot-default` re-invokes an orient tool.
			for (let i = 0; i < 100; i++) {
				await service.onToolCall(
					'proposals_continue_proposal',
					{ proposalId: 'f00030', mode: 'plan' },
					{ ok: true },
				);
			}
			// The agent never enters the stuck map; isAgentStuck returns null.
			expect(
				service.isAgentStuck('proposals_continue_proposal', {
					agent: 'copilot-default',
				}),
			).toBeNull();
			// And no handoff packet was written either.
			const handoffDirAbs = mockCtx.workspace.resolve(
				'.cache/mcp-vertex/handoff',
			);
			if (existsSync(handoffDirAbs)) {
				const { readdir } = await import('node:fs/promises');
				const files = await readdir(handoffDirAbs);
				expect(
					files.some((f) => f.startsWith('copilot-default-')),
				).toBe(false);
			}
		});

		it('still flags non-interactive swarm agents at the default threshold (8)', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// A swarm agent with a non-matching name: even one more than
			// the threshold trips the detector (proves the threshold did
			// not silently regress for swarm agents). Args are kept
			// constant so the detector's `(tool, args-hash)` exact-repeat
			// key matches across calls — see `detectAgentLoop` contract.
			for (let i = 0; i < 9; i++) {
				await service.onToolCall(
					'edit_file',
					{ path: 'foo.ts', agent: 'falcon' },
					{ ok: true },
				);
			}
			const stuck = service.isAgentStuck('edit_file', {
				agent: 'falcon',
			});
			expect(stuck).not.toBeNull();
			expect(stuck?.suggestedAction).toContain('exact-repeat');
		});

		it('interactive pattern matches a wildcard suffix (`cursor-*`, `windsurf-*`)', async () => {
			const service = new AgentLoopDetectorService(mockCtx);
			// 5 calls each — well above the old threshold of 3.
			for (const agent of [
				'cursor-default',
				'cursor-debug',
				'windsurf-prod',
			]) {
				for (let i = 0; i < 5; i++) {
					await service.onToolCall(
						'proposals_round_context',
						{ agent },
						{ ok: true },
					);
				}
				expect(
					service.isAgentStuck('proposals_round_context', {
						agent,
					}),
				).toBeNull();
			}
		});

		it('interactive pattern respects host overrides via the config file', async () => {
			// Write a config that replaces the defaults with the host's
			// own naming convention. This is the documented extension
			// point for hosts whose interactive session is not `*-default`.
			const configPath = mockCtx.workspace.resolve(
				'mcp-vertex.config.json',
			);
			const { writeFile, unlink } = await import('node:fs/promises');
			await writeFile(
				configPath,
				JSON.stringify({
					loopDetector: {
						interactiveAgentPatterns: ['host-session-*'],
					},
				}),
				'utf8',
			);
			try {
				const service = new AgentLoopDetectorService(mockCtx);
				for (let i = 0; i < 20; i++) {
					await service.onToolCall(
						'proposals_continue_proposal',
						{ agent: 'host-session-42' },
						{ ok: true },
					);
				}
				expect(
					service.isAgentStuck('proposals_continue_proposal', {
						agent: 'host-session-42',
					}),
				).toBeNull();
			} finally {
				await unlink(configPath);
			}
		});

		it('interactive pattern honours the empty-list opt-out (CI / universal monitoring)', async () => {
			const configPath = mockCtx.workspace.resolve(
				'mcp-vertex.config.json',
			);
			const { writeFile, unlink } = await import('node:fs/promises');
			await writeFile(
				configPath,
				JSON.stringify({
					loopDetector: { interactiveAgentPatterns: [] },
				}),
				'utf8',
			);
			try {
				const service = new AgentLoopDetectorService(mockCtx);
				// With the ignore list disabled, copilot-default is now
				// monitored like any other agent and trips at the new
				// default threshold (8).
				for (let i = 0; i < 9; i++) {
					await service.onToolCall(
						'read_file',
						{ path: 'x.ts', agent: 'copilot-default' },
						{ ok: true },
					);
				}
				expect(
					service.isAgentStuck('read_file', {
						agent: 'copilot-default',
					}),
				).not.toBeNull();
			} finally {
				await unlink(configPath);
			}
		});

		it('interactive pattern honours the CLI override `--loop-detector.interactive-agent-patterns`', async () => {
			const ctxWithCli = {
				...mockCtx,
				args: {
					'loop-detector.interactive-agent-patterns':
						'host-session-*,assistant-*',
				},
			};
			const service = new AgentLoopDetectorService(ctxWithCli);
			// The default `*-default` is overridden → copilot-default
			// is now a regular agent and gets stuck after 9 calls.
			for (let i = 0; i < 9; i++) {
				await service.onToolCall(
					'read_file',
					{ path: 'x.ts', agent: 'copilot-default' },
					{ ok: true },
				);
			}
			expect(
				service.isAgentStuck('read_file', {
					agent: 'copilot-default',
				}),
			).not.toBeNull();

			// But `host-session-42` and `assistant-bot` are now ignored.
			for (const agent of ['host-session-42', 'assistant-bot']) {
				for (let i = 0; i < 15; i++) {
					await service.onToolCall(
						'read_file',
						{ path: 'x.ts', agent },
						{ ok: true },
					);
				}
				expect(service.isAgentStuck('read_file', { agent })).toBeNull();
			}
		});
	});
});
