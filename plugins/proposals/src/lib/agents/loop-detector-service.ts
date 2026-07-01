import { mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
	writeFileAtomic,
	redactSecrets,
	type IMcpPluginContext,
} from '@mcp-vertex/core/public';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import { detectAgentLoop } from './agent-loop-detector';
import type { IToolCall as IDetectorToolCall } from './agent-loop-detector';
import type { TCallOutcome } from './agent-loop-detector';
import { createHash } from 'node:crypto';
import {
	LOOP_DETECTOR_DEFAULTS_FOR,
	createFsConfigFileReader,
	parseLoopDetectorCliOverrides,
	resolveLoopDetectorConfig,
} from './loop-detector-config';
import type {
	IConfigFileReader,
	ILoopDetectorServiceOptions,
} from './loop-detector-config';
import { buildSwarmPaths } from '../contracts/constants/default-path-layout.constant';

export type { ILoopDetectorServiceOptions } from './loop-detector-config';

export interface IExtendedToolCall {
	readonly tool: string;
	readonly args: unknown;
	readonly agent: string;
	readonly timestamp: number;
	readonly isModifying: boolean;
	readonly madeProgress: boolean;
	/**
	 * x00074 S1: outcome derived from the tool call's `_result` /
	 * `_error` at the time of the call. Always populated by
	 * `onToolCall`; the pure detector treats `'unknown'` as the
	 * legacy "count every repeat" fallback when callers do not
	 * explicitly set outcome on `IToolCall`.
	 */
	readonly outcome: TCallOutcome;
	/**
	 * x00074 S3: short hash of the observable state touched by this
	 * call (lock file + proposal index). Two consecutive calls on a
	 * PROGRESS_REQUIRED_TOOL with the same progressHash are
	 * considered a no-op repeat and do not count. Optional —
	 * defaults to `null` (legacy behaviour) so existing tests do
	 * not break.
	 */
	readonly progressHash: string | null;
}

export class AgentLoopDetectorService {
	private options: ILoopDetectorServiceOptions;
	private readonly gitRunner: IGitRunner;
	private configReader!: IConfigFileReader;
	private readonly lockPath: string;
	private readonly proposalIndexPath: string;
	private readonly roundContextDigestPath: string;
	private handoffDirAbs: string;

	// Memory sliding window of calls per agent
	private readonly windowMap = new Map<string, IExtendedToolCall[]>();
	private lastKnownDiff = '';
	private initialized = false;

	// Keep track of active stuck status per agent
	private readonly stuckAgents = new Map<
		string,
		{ handoffPath: string; suggestedAction: string }
	>();

	// Lock-file lookup cache (H1 mitigation). `isAgentStuck` is called
	// inline on every tool call from core (`IMcpVertexHostConfig`), so a
	// sync read on that hot path is forbidden by AGENTS.md rule 3. The
	// lock file only changes when `agent_lock` claims/releases — both
	// are routed through this service, which invalidates the cache. For
	// non-proposals tools (the vast majority of calls in a swarm) the
	// 50ms window covers ~hundreds of calls, so the sync path reduces
	// to a `Date.now()` comparison + a Map read.
	private lockCache: { agent: string; mtimeMs: number } | undefined;
	private static readonly LOCK_CACHE_TTL_MS = 50;
	private configLoadPromise: Promise<void> | undefined;

	constructor(private readonly ctx: IMcpPluginContext) {
		const layout = buildSwarmPaths(ctx.cacheDir, ctx.docsDir);
		this.lockPath = ctx.workspace.resolve(layout.lockFile);
		this.proposalIndexPath = ctx.workspace.resolve(
			layout.proposalIndexFile,
		);
		this.roundContextDigestPath = ctx.workspace.resolve(
			layout.roundContextDigestFile,
		);
		this.gitRunner = createGitRunner(ctx.workspace.root);

		// Solid-SRP: config resolution lives in `loop-detector-config.ts`.
		// Start with defaults + CLI synchronously for the core's sync
		// `isAgentStuck` contract; on-disk config loads async on first use.
		// x00054: the default handoffDir is derived from the host's
		// `cacheDir` via `LOOP_DETECTOR_DEFAULTS_FOR(ctx.cacheDir)`, so
		// a host that reconfigures the cache root gets the handoff
		// under that root (not the historical `.cache/mcp-vertex/handoff`
		// literal). Tests that need the legacy default pass an
		// explicit `ctx.cacheDir` in the mock.
		this.options = {
			...LOOP_DETECTOR_DEFAULTS_FOR(ctx.cacheDir),
			...parseLoopDetectorCliOverrides(ctx.args),
		};
		// this.configReader = createFsConfigFileReader(ctx.workspace);

		this.handoffDirAbs = ctx.workspace.resolve(this.options.handoffDir);
	}

	private async ensureConfigLoaded(): Promise<void> {
		this.configLoadPromise ??= (async () => {
			if (!this.configReader)
				this.configReader = await createFsConfigFileReader(
					this.ctx.workspace,
				);
			return resolveLoopDetectorConfig({
				configReader: this.configReader,
				cliArgs: this.ctx.args,
				cacheDir: this.ctx.cacheDir,
			});
		})().then((options) => {
			this.options = options;
			this.handoffDirAbs = this.ctx.workspace.resolve(options.handoffDir);
		});
		await this.configLoadPromise;
	}

	private async initializeGitDiff() {
		if (this.initialized) return;
		try {
			const res = await this.gitRunner(['diff', '--stat']);
			this.lastKnownDiff = res.ok ? res.output.trim() : '';
		} catch {
			this.lastKnownDiff = '';
		}
		this.initialized = true;
	}

	private async getActiveAgent(): Promise<string> {
		try {
			const raw = await readFile(this.lockPath, 'utf8');
			const locks = JSON.parse(raw);
			if (Array.isArray(locks.in_flight) && locks.in_flight.length > 0) {
				const agent = locks.in_flight[0].agent;
				// Refresh the sync-path cache as a side effect so
				// `isAgentStuck` (called inline from core on every tool
				// call) can serve from memory within the TTL window.
				this.lockCache = { agent, mtimeMs: Date.now() };
				return agent;
			}
		} catch {
			// missing/corrupt lock file → no active agent to report
		}
		return 'default-agent';
	}

	private isModifying(toolName: string): boolean {
		const baseName = toolName.includes('_')
			? toolName.split('_').slice(1).join('_')
			: toolName;
		return (
			this.options.gitCheckTools.includes(toolName) ||
			this.options.gitCheckTools.includes(baseName)
		);
	}

	/**
	 * Match `agent` against the configured interactive patterns. A pattern
	 * without wildcard characters is an exact-match string; a pattern with
	 * `*` or `?` is a wildcard where `*` matches any run of characters
	 * and `?` matches any single character. Mirrors the contract of
	 * minimatch without pulling the dep — the patterns we expect are
	 * trivially small (typically 4-5 entries from the default config).
	 */
	private isInteractiveAgent(agent: string): boolean {
		if (!agent || !this.options.interactiveAgentPatterns?.length) {
			return false;
		}
		for (const pattern of this.options.interactiveAgentPatterns) {
			if (!pattern) continue;
			if (!pattern.includes('*') && !pattern.includes('?')) {
				if (agent === pattern) return true;
				continue;
			}
			const regex = new RegExp(
				'^' +
					pattern
						.split('*')
						.map((part) =>
							part
								.split('?')
								.map((p) =>
									p.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
								)
								.join('.'),
						)
						.join('.*') +
					'$',
			);
			if (regex.test(agent)) return true;
		}
		return false;
	}

	/** Hook triggered after every tool execution */
	public async onToolCall(
		toolName: string,
		args: unknown,
		_result: unknown,
		_error?: unknown,
	): Promise<void> {
		await this.ensureConfigLoaded();
		if (!this.options.enabled) return;

		const outcome = deriveOutcomeFromResult(_result, _error);

		// x00074 S3: compute progressHash from observable state.
		// The hash is what the detector consults when the gate is
		// enabled — two consecutive PROGRESS_REQUIRED_TOOL calls
		// with the same progressHash are a no-op repeat. We hash
		// the lock file content (cheap, frequently updated) plus
		// the git dirty summary so a fresh commit clears the gate
		// even if the lock file is unchanged.
		const progressHash = await computeProgressHash(
			this.lockPath,
			this.gitRunner,
		);

		await this.initializeGitDiff();

		// Determine agent: check if args contains agent, otherwise fetch from lock
		let agent = '';
		if (args && typeof args === 'object') {
			agent = (args as { agent?: string }).agent ?? '';
		}
		if (!agent) {
			agent = await this.getActiveAgent();
		}

		// Interactive host sessions (Copilot/Cursor/Windsurf user-facing
		// tabs etc.) legitimately re-call orient tools a handful of times;
		// they are not swarm agents and the detector should not police
		// them. Skip both the sliding-window accumulation and the verdict
		// so a future stuck swarm agent is not poisoned by interactive
		// calls that happened to share the lock file.
		if (this.isInteractiveAgent(agent)) {
			return;
		}

		// Calculate progress via git diff
		const isMod = this.isModifying(toolName);
		let madeProgress = true;
		let currentDiff = this.lastKnownDiff;

		if (isMod) {
			try {
				const diffRes = await this.gitRunner(['diff', '--stat']);
				if (diffRes.ok) {
					currentDiff = diffRes.output.trim();
					madeProgress = currentDiff !== this.lastKnownDiff;
					this.lastKnownDiff = currentDiff;
				}
			} catch {
				// Fallback to progress assumed
			}
		}

		const callRecord: IExtendedToolCall = {
			tool: toolName,
			args,
			agent,
			timestamp: Date.now(),
			isModifying: isMod,
			madeProgress,
			outcome,
			progressHash,
		};

		let window = this.windowMap.get(agent) ?? [];
		window.push(callRecord);
		if (window.length > this.options.ringSize) {
			window = window.slice(-this.options.ringSize);
		}
		this.windowMap.set(agent, window);

		// Run detection
		const detectorCalls: IDetectorToolCall[] = window.map((c) => {
			const call: IDetectorToolCall = {
				tool: c.tool,
				args: c.args,
				agent: c.agent,
				timestamp: c.timestamp,
				outcome: c.outcome,
			};
			if (c.progressHash) {
				return { ...call, progressHash: c.progressHash };
			}
			return call;
		});

		const verdict = detectAgentLoop(detectorCalls, {
			ringSize: this.options.ringSize,
			exactRepeatThreshold: this.options.repeatThreshold,
			cooldownMs: this.options.cooldownMs ?? 30_000,
			progressHashGate: true,
		});

		// Check no-progress count
		let noProgressCount = 0;
		let noProgressStuck = false;
		for (let i = window.length - 1; i >= 0; i--) {
			const c = window[i];
			if (c?.isModifying) {
				if (!c.madeProgress) {
					noProgressCount++;
					if (noProgressCount >= this.options.noProgressThreshold) {
						noProgressStuck = true;
						break;
					}
				} else {
					break;
				}
			}
		}

		const isStuck = verdict.isStuck || noProgressStuck;
		if (isStuck && !this.stuckAgents.has(agent)) {
			// Trigger stuck flow: write handoff and store verdict
			const _ts = new Date().toISOString();
			const sanitizedAgent = agent.replace(/[^a-zA-Z0-9_-]/g, '_');
			const handoffFileName = `${sanitizedAgent}-${Date.now()}.json`;
			const handoffPathRel = join(
				this.options.handoffDir,
				handoffFileName,
			);
			const handoffPathAbs = this.ctx.workspace.resolve(handoffPathRel);

			const reason = verdict.isStuck ? 'exact-repeat' : 'no-progress';
			const suggestedAction = `STOP — stuck detected due to ${reason}. Another agent should take over. Review handoff packet at ${handoffPathRel}.`;

			this.stuckAgents.set(agent, {
				handoffPath: handoffPathRel,
				suggestedAction,
			});

			// Write handoff packet
			try {
				await this.writeHandoffPacket(
					handoffPathAbs,
					agent,
					verdict.repeatCount,
					noProgressCount,
					reason,
					window,
				);
			} catch {
				// Ignore
			}

			// Clean up old handoffs
			try {
				await this.pruneOldHandoffs();
			} catch {
				// Ignore
			}

			// Notification
			if (this.options.notifyOnDetect) {
				// We can't access mcpServer easily here, but we can write to stderr
				// which the host reads, and notify via event.
				process.stderr.write(
					`[mcp-vertex] loop-detector: agent "${agent}" is stuck (${reason}). Handoff written to ${handoffPathRel}\n`,
				);
			}
		}
	}

	/**
	 * l00008 s1 + audit-h1-fix: this method is intentionally synchronous,
	 * not a hot-path oversight. `IMcpVertexHostConfig.isAgentStuck`
	 * (packages/core host-config.interface.ts) declares a sync return
	 * type and is invoked inline — without `await` — right after every
	 * tool call in `create-mcp-project.ts`. Making this `async` would
	 * widen the core contract to `Promise<...> | ...`, which ripples to
	 * every host config consumer — out of scope for a contained fix.
	 *
	 * The previous implementation did a `readFileSync` here (forbidden by
	 * AGENTS.md rule 3). The audit (2026-06-23) replaced that with a
	 * 50ms TTL cache populated by the async `getActiveAgent` (which is
	 * called from `onToolCall` and runs after every proposals_* tool).
	 * Inside the TTL window the sync path is a Map read + Date.now().
	 * When the cache is cold AND a non-proposals tool is the caller, the
	 * refresh is kicked off in the background — the sync path returns
	 * `'default-agent'` as a safe fallback. `agent-lock` claim/release
	 * routes through `invalidateLockCache()` (declared on this class) so
	 * the cache can never go stale by more than the TTL.
	 */
	public isAgentStuck(
		_toolName: string,
		args: unknown,
	): { handoffPath: string; suggestedAction: string } | null {
		if (!this.options.enabled) return null;

		let agent = '';
		if (args && typeof args === 'object') {
			agent = (args as { agent?: string }).agent ?? '';
		}
		if (!agent) {
			agent = this.readCachedLockAgent();
		}
		if (!agent) agent = 'default-agent';

		// Same skip as onToolCall: an interactive session can never be
		// stuck. This is the sync read path used by `create-mcp-project`'s
		// per-call inline check, so it must mirror the async behaviour
		// exactly to avoid injecting a spurious `__stuck_detected` into
		// the response of an otherwise-legitimate orient call.
		if (this.isInteractiveAgent(agent)) {
			return null;
		}

		return this.stuckAgents.get(agent) ?? null;
	}

	/**
	 * Sync read of the lock file's first in-flight agent, served from a
	 * 50ms TTL cache. When the cache is cold, kicks off an async
	 * refresh and returns `''` (caller falls back to `'default-agent'`).
	 * This is the only sync path that touches the lock file in the
	 * whole service; everything else goes through the async
	 * `getActiveAgent`, which updates this cache as a side effect.
	 */
	private readCachedLockAgent(): string {
		const now = Date.now();
		const cached = this.lockCache;
		if (
			cached !== undefined &&
			now - cached.mtimeMs < AgentLoopDetectorService.LOCK_CACHE_TTL_MS
		) {
			return cached.agent;
		}
		// Cold path: refresh in the background, do not block.
		void this.refreshLockCache();
		return '';
	}

	private async refreshLockCache(): Promise<void> {
		const agent = await this.getActiveAgent();
		this.lockCache = { agent, mtimeMs: Date.now() };
	}

	/**
	 * Called by the agent-lock engine after a successful claim/release
	 * so the in-memory cache never serves a stale agent for longer than
	 * the TTL window.
	 */
	public invalidateLockCache(): void {
		this.lockCache = undefined;
	}

	private async writeHandoffPacket(
		pathAbs: string,
		agent: string,
		repeatCount: number,
		noProgressCount: number,
		reason: string,
		window: IExtendedToolCall[],
	): Promise<void> {
		let activeLocks = [];
		let currentProposal = null;

		try {
			const raw = await readFile(this.lockPath, 'utf8');
			const locks = JSON.parse(raw);
			activeLocks = locks.in_flight ?? [];
		} catch {
			// missing/corrupt lock file → no active locks to report
		}

		try {
			const raw = await readFile(this.proposalIndexPath, 'utf8');
			const index = JSON.parse(raw);
			// Find matching active proposal
			const activeTaskIds = new Set(
				activeLocks.map((l: any) => l.task_id),
			);
			if (Array.isArray(index.proposals)) {
				currentProposal =
					index.proposals.find((p: any) => activeTaskIds.has(p.id)) ??
					null;
			}
		} catch {
			// missing/corrupt proposal index → no matching proposal to report
		}

		let gitHead = '';
		let gitDirtySummary = '';
		try {
			const headRes = await this.gitRunner(['rev-parse', 'HEAD']);
			gitHead = headRes.ok ? headRes.output.trim() : '';

			const statusRes = await this.gitRunner(['status', '--short']);
			gitDirtySummary = statusRes.ok ? statusRes.output.trim() : '';
		} catch {
			// Ignore
		}

		// Sanitize/redact secrets in recent calls
		const recentCalls = window.map((c) => {
			let redactedArgs = c.args;
			try {
				const res = redactSecrets(JSON.stringify(c.args));
				redactedArgs = JSON.parse(res.text);
			} catch {
				// Ignore
			}
			return {
				ts: new Date(c.timestamp).toISOString(),
				tool: c.tool,
				args: redactedArgs,
			};
		});

		const packet = {
			schema: 'mcp-vertex/handoff/1',
			createdAt: new Date().toISOString(),
			reason,
			signals: {
				repeatCount,
				nearRepeatCount: 0,
				idleCount: 0,
				noProgressCount,
			},
			from: {
				agent,
				model: 'unknown',
			},
			workspaceRoot: this.ctx.workspace.root,
			activeLocks,
			currentProposal,
			roundContextDigestPath: this.roundContextDigestPath,
			recentToolCalls: recentCalls,
			gitHead,
			gitDirtySummary,
			instructionsForNextAgent: '',
		};

		await mkdir(join(pathAbs, '..'), { recursive: true });
		await writeFileAtomic(
			pathAbs,
			`${JSON.stringify(packet, null, '\t')}\n`,
		);
	}

	private async pruneOldHandoffs(): Promise<void> {
		try {
			const files = await readdir(this.handoffDirAbs);
			const now = Date.now();
			const ttlMs = this.options.handoffTtlDays * 24 * 60 * 60 * 1000;
			for (const file of files) {
				if (!file.endsWith('.json')) continue;
				const p = join(this.handoffDirAbs, file);
				const s = await stat(p);
				if (now - s.mtimeMs > ttlMs) {
					await unlink(p);
				}
			}
		} catch {
			// missing handoff dir or transient I/O error → nothing to prune
		}
	}
}

/**
 * x00074 S1: classify a tool call's result into one of the four
 * TCallOutcome values. Used by `onToolCall` to populate the
 * `outcome` field on every `IExtendedToolCall` so the pure
 * detector's outcome-aware sliding window can suppress successful
 * re-intent chains.
 *
 * Heuristic (intentionally simple — richer classification belongs
 * in the host-config layer, not here):
 *   - `_error === undefined`  → `ok`
 *   - `_error.code` is one of the retryable codes below → `retryable-error`
 *   - any other non-undefined `_error` → `permanent-error`
 *   - `_result === undefined` AND `_error === undefined` → `ok` (no
 *     observable failure)
 *
 * Pure function; safe to test in isolation. Mirrors the level of
 * detail that the core host config surfaces via `IMcpVertexHostConfig`.
 */
export const RETRYABLE_ERROR_CODES: readonly string[] = [
	'ENOENT',
	'ETIMEDOUT',
	'ECONNRESET',
	'EAGAIN',
	'EBUSY',
	'ELOCKFAIL',
];

export const deriveOutcomeFromResult = (
	_result: unknown,
	_error?: unknown,
): TCallOutcome => {
	if (_error === undefined) return 'ok';
	if (_error === null) return 'permanent-error';
	if (typeof _error === 'object') {
		const code = (_error as { code?: unknown }).code;
		if (typeof code === 'string' && RETRYABLE_ERROR_CODES.includes(code)) {
			return 'retryable-error';
		}
	}
	return 'permanent-error';
};

/**
 * x00074 S3: derive a short hash of the observable state touched by
 * a call. Used as the `progressHash` on `IExtendedToolCall`; the
 * detector's S3 progress-aware filter consults it when
 * `progressHashGate: true`.
 *
 * Sources (cheap, frequently updated):
 *  - lock file content (per-agent) — most swarm-coordination calls
 *    change the lock file.
 *  - git dirty summary (`git diff --stat`) — fresh commits clear
 *    the hash even if the lock is unchanged.
 *
 * Both reads are best-effort: a transient I/O error returns
 * `null`, which the detector treats as "no progress signal" (the
 * call still counts toward the repeat threshold, so a real loop
 * still trips).
 */
export const computeProgressHash = async (
	lockPath: string,
	gitRunner: IGitRunner,
): Promise<string | null> => {
	try {
		const lockRaw = await readFile(lockPath, 'utf8');
		const diffRes = await gitRunner(['diff', '--stat']);
		if (!diffRes.ok) {
			throw new Error('git diff failed');
		}
		const diffSummary = diffRes.output.trim();
		return createHash('sha256')
			.update(`${lockRaw}|${diffSummary}`)
			.digest('hex')
			.slice(0, 16);
	} catch {
		return null;
	}
};
