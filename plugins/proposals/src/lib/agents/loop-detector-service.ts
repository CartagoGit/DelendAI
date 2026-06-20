import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import {
	writeFileAtomic,
	withFileMutex,
	redactSecrets,
	parseConfigFile,
} from '@mcp-vertex/core/public';
import type {
	IMcpVertexConfigFile,
	IMcpVertexHostConfig,
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
			repeatThreshold: 3,
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
			if (existsSync(this.lockPath)) {
				const raw = readFileSync(this.lockPath, 'utf8');
				const locks = JSON.parse(raw);
				if (
					Array.isArray(locks.in_flight) &&
					locks.in_flight.length > 0
				) {
					// Default to the first active lock agent
					return locks.in_flight[0].agent;
				}
			}
		} catch {
			// Ignore
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

	/** Hook triggered after every tool execution */
	public async onToolCall(
		toolName: string,
		args: unknown,
		result: unknown,
		error?: unknown,
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
			if (c && c.isModifying) {
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
			const ts = new Date().toISOString();
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

	public isAgentStuck(
		toolName: string,
		args: unknown,
	): { handoffPath: string; suggestedAction: string } | null {
		if (!this.options.enabled) return null;

		let agent = '';
		if (args && typeof args === 'object') {
			agent = (args as { agent?: string }).agent ?? '';
		}
		if (!agent) {
			// Sync retrieve locks synchronously from memory since we can't await locks.json here
			// Or check the active locks file synchronously
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
			if (existsSync(this.lockPath)) {
				const raw = await readFileSync(this.lockPath, 'utf8');
				const locks = JSON.parse(raw);
				activeLocks = locks.in_flight ?? [];
			}
		} catch {
			// Ignore
		}

		try {
			if (existsSync(this.proposalIndexPath)) {
				const raw = await readFileSync(this.proposalIndexPath, 'utf8');
				const index = JSON.parse(raw);
				// Find matching active proposal
				const activeTaskIds = new Set(
					activeLocks.map((l: any) => l.task_id),
				);
				if (Array.isArray(index.proposals)) {
					currentProposal =
						index.proposals.find((p: any) =>
							activeTaskIds.has(p.id),
						) ?? null;
				}
			}
		} catch {
			// Ignore
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
			if (!existsSync(this.handoffDirAbs)) return;
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
			// Ignore
		}
	}
}
