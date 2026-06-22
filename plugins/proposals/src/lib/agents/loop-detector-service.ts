import { readFileSync, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
	writeFileAtomic,
	redactSecrets,
	parseConfigFile,
} from '@mcp-vertex/core/public';
import type {
	IMcpVertexConfigFile,
	IMcpPluginContext,
} from '@mcp-vertex/core/public';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';
import { detectAgentLoop } from './agent-loop-detector';
import type { IToolCall as IDetectorToolCall } from './agent-loop-detector';
import { buildSwarmPaths } from '../contracts/constants/default-path-layout.constant';

export interface ILoopDetectorServiceOptions {
	enabled: boolean;
	repeatThreshold: number;
	nearRepeatThreshold: number;
	similarityThreshold: number;
	idleThreshold: number;
	noProgressThreshold: number;
	ringSize: number;
	gitCheckTools: readonly string[];
	handoffDir: string;
	handoffTtlDays: number;
	notifyOnDetect: boolean;
	/**
	 * Agent names or glob patterns the detector MUST ignore. The
	 * detector was originally tuned for swarm runs where the same
	 * `edit_file` call 3 times in a row is unambiguous stuck. But
	 * interactive host sessions (`copilot-default`, `cursor-default`,
	 * etc.) legitimately invoke the same orient tool multiple times —
	 * the threshold that catches a swarm stall produces false
	 * positives for the human in the loop. Defaults to the common
	 * `*-default` / `default-*` / `host` / `interactive` patterns;
	 * set to `[]` in the config to opt back into universal monitoring.
	 */
	interactiveAgentPatterns: readonly string[];
}

export interface IExtendedToolCall {
	readonly tool: string;
	readonly args: unknown;
	readonly agent: string;
	readonly timestamp: number;
	readonly isModifying: boolean;
	readonly madeProgress: boolean;
}

export class AgentLoopDetectorService {
	private readonly options: ILoopDetectorServiceOptions;
	private readonly gitRunner: IGitRunner;
	private readonly lockPath: string;
	private readonly proposalIndexPath: string;
	private readonly roundContextDigestPath: string;
	private readonly handoffDirAbs: string;

	// Memory sliding window of calls per agent
	private readonly windowMap = new Map<string, IExtendedToolCall[]>();
	private lastKnownDiff = '';
	private initialized = false;

	// Keep track of active stuck status per agent
	private readonly stuckAgents = new Map<
		string,
		{ handoffPath: string; suggestedAction: string }
	>();

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

		// 1. Resolve configuration: defaults -> config file -> CLI args overrides
		const defaults: ILoopDetectorServiceOptions = {
			enabled: true,
			// 8 is empirically high enough that interactive re-orient calls
			// (`continue_proposal`, `round_context`) do not trip it, while a
			// swarm agent that calls the same edit_file 8 times in a row is
			// unambiguously stuck. Hosts can still tune per environment.
			repeatThreshold: 8,
			nearRepeatThreshold: 5,
			similarityThreshold: 0.9,
			idleThreshold: 3,
			noProgressThreshold: 3,
			ringSize: 50,
			gitCheckTools: [
				'edit_file',
				'write_file',
				'multi_replace_string_in_file',
				'replace_string_in_file',
			],
			handoffDir: '.mcp-vertex/handoff',
			handoffTtlDays: 7,
			notifyOnDetect: true,
			// Universal host-session shapes — Copilot, Cursor, Windsurf and
			// any host that calls its user-facing session `*-default`. Hosts
			// whose interactive session is named differently can extend this
			// list from the config file (`loopDetector.interactiveAgentPatterns`).
			interactiveAgentPatterns: [
				'*-default',
				'default-*',
				'host',
				'interactive',
			],
		};

		const globalConfigPath = ctx.workspace.resolve(
			'mcp-vertex.config.json',
		);
		let globalConfig: IMcpVertexConfigFile = {};
		if (existsSync(globalConfigPath)) {
			try {
				globalConfig = parseConfigFile(
					readFileSync(globalConfigPath, 'utf8'),
				);
			} catch {
				// Ignored
			}
		}

		const cliConfig = this.parseCliOverrides(ctx.args);

		this.options = {
			enabled:
				cliConfig.enabled ??
				globalConfig.loopDetector?.enabled ??
				defaults.enabled,
			repeatThreshold:
				cliConfig.repeatThreshold ??
				globalConfig.loopDetector?.repeatThreshold ??
				defaults.repeatThreshold,
			nearRepeatThreshold:
				cliConfig.nearRepeatThreshold ??
				globalConfig.loopDetector?.nearRepeatThreshold ??
				defaults.nearRepeatThreshold,
			similarityThreshold:
				cliConfig.similarityThreshold ??
				globalConfig.loopDetector?.similarityThreshold ??
				defaults.similarityThreshold,
			idleThreshold:
				cliConfig.idleThreshold ??
				globalConfig.loopDetector?.idleThreshold ??
				defaults.idleThreshold,
			noProgressThreshold:
				cliConfig.noProgressThreshold ??
				globalConfig.loopDetector?.noProgressThreshold ??
				defaults.noProgressThreshold,
			ringSize:
				cliConfig.ringSize ??
				globalConfig.loopDetector?.ringSize ??
				defaults.ringSize,
			gitCheckTools:
				cliConfig.gitCheckTools ??
				globalConfig.loopDetector?.gitCheckTools ??
				defaults.gitCheckTools,
			handoffDir:
				cliConfig.handoffDir ??
				globalConfig.loopDetector?.handoffDir ??
				defaults.handoffDir,
			handoffTtlDays:
				cliConfig.handoffTtlDays ??
				globalConfig.loopDetector?.handoffTtlDays ??
				defaults.handoffTtlDays,
			notifyOnDetect:
				cliConfig.notifyOnDetect ??
				globalConfig.loopDetector?.notifyOnDetect ??
				defaults.notifyOnDetect,
			interactiveAgentPatterns:
				cliConfig.interactiveAgentPatterns ??
				globalConfig.loopDetector?.interactiveAgentPatterns ??
				defaults.interactiveAgentPatterns,
		};

		this.handoffDirAbs = ctx.workspace.resolve(this.options.handoffDir);

		if (!this.options.enabled) {
			ctx.workspace.resolve('.mcp-vertex'); // Touch to keep lint clean if needed
		}
	}

	private parseCliOverrides(
		args: Readonly<Record<string, string>>,
	): Partial<ILoopDetectorServiceOptions> {
		const out: Partial<ILoopDetectorServiceOptions> = {};
		if (
			args['no-loop-detector'] === 'true' ||
			args['loop-detector'] === 'false'
		) {
			out.enabled = false;
		} else if (args['loop-detector'] === 'true') {
			out.enabled = true;
		}
		for (const [key, val] of Object.entries(args)) {
			if (key.startsWith('loop-detector.')) {
				const subKey = key.slice('loop-detector.'.length);
				if (
					subKey === 'repeat-threshold' ||
					subKey === 'repeatThreshold'
				) {
					out.repeatThreshold = Number(val);
				} else if (
					subKey === 'near-repeat-threshold' ||
					subKey === 'nearRepeatThreshold'
				) {
					out.nearRepeatThreshold = Number(val);
				} else if (
					subKey === 'similarity-threshold' ||
					subKey === 'similarityThreshold'
				) {
					out.similarityThreshold = Number(val);
				} else if (
					subKey === 'idle-threshold' ||
					subKey === 'idleThreshold'
				) {
					out.idleThreshold = Number(val);
				} else if (
					subKey === 'no-progress-threshold' ||
					subKey === 'noProgressThreshold'
				) {
					out.noProgressThreshold = Number(val);
				} else if (subKey === 'ring-size' || subKey === 'ringSize') {
					out.ringSize = Number(val);
				} else if (
					subKey === 'handoff-dir' ||
					subKey === 'handoffDir'
				) {
					out.handoffDir = val;
				} else if (
					subKey === 'handoff-ttl-days' ||
					subKey === 'handoffTtlDays'
				) {
					out.handoffTtlDays = Number(val);
				} else if (
					subKey === 'notify-on-detect' ||
					subKey === 'notifyOnDetect'
				) {
					out.notifyOnDetect = val === 'true' || val === '1';
				} else if (
					subKey === 'interactive-agent-patterns' ||
					subKey === 'interactiveAgentPatterns'
				) {
					// CLI accepts a comma-separated list. Empty list ("")
					// is treated as "explicit opt-out of all ignore rules".
					out.interactiveAgentPatterns =
						val === '' ? [] : val.split(',').map((s) => s.trim());
				}
			}
		}
		return out;
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
				// Default to the first active lock agent
				return locks.in_flight[0].agent;
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
		if (!this.options.enabled) return;

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
		};

		let window = this.windowMap.get(agent) ?? [];
		window.push(callRecord);
		if (window.length > this.options.ringSize) {
			window = window.slice(-this.options.ringSize);
		}
		this.windowMap.set(agent, window);

		// Run detection
		const detectorCalls: IDetectorToolCall[] = window.map((c) => ({
			tool: c.tool,
			args: c.args,
			agent: c.agent,
			timestamp: c.timestamp,
		}));

		const verdict = detectAgentLoop(detectorCalls, {
			ringSize: this.options.ringSize,
			exactRepeatThreshold: this.options.repeatThreshold,
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
	 * l00008 s1: this method is intentionally synchronous, not a hot-path
	 * oversight. `IMcpVertexHostConfig.isAgentStuck` (packages/core
	 * host-config.interface.ts) declares a sync return type and is
	 * invoked inline — without `await` — right after every tool call in
	 * `create-mcp-project.ts`. Making this `async` would require widening
	 * that core contract to `Promise<...> | ...`, which ripples to every
	 * host config consumer — out of scope for a contained fix. The sync
	 * read below is a deliberate, narrow exception to invariant 3,
	 * bounded by this one call site; `onToolCall`'s `getActiveAgent` (the
	 * other path that needs the same lookup) already uses the async
	 * primitive since it runs inside an `async` hook with no such
	 * constraint.
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
			try {
				if (existsSync(this.lockPath)) {
					const raw = readFileSync(this.lockPath, 'utf8');
					const locks = JSON.parse(raw);
					if (
						Array.isArray(locks.in_flight) &&
						locks.in_flight.length > 0
					) {
						agent = locks.in_flight[0].agent;
					}
				}
			} catch {
				// Ignore
			}
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
