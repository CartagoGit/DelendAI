/**
 * index.ts — the `@mcp-vertex/commit-policy` plugin entry point.
 */

import {
	createWriteGitRunner,
	definePlugin,
	type IPluginConfigurationIssue,
	type IPluginConfigurationValidationInput,
	type IPluginRuntime,
} from '@mcp-vertex/core/public';

import { hostname } from 'node:os';

import { CommitPolicyOptionsSchema } from './lib/contracts/options';
import { DEFAULT_AGENT_LOCK_STALE_MINUTES } from './lib/contracts/constants/agent-lock.constant';
import {
	createAgentLockForeignLockProvider,
	deriveAgentLockPath,
} from './lib/services/agent-lock-foreign-locks';
import type { IIdentityResolverContext } from './lib/identity/resolver';
import {
	computeSliceTriggerEventId,
	createSliceListener,
	type ITriggerAck,
	type ITriggerEvent,
} from './lib/triggers/slice-listener';
import { createIntervalTimer } from './lib/triggers/interval-timer';
import { buildCommitToolRegistration } from './lib/tools/commit-tool';
import { buildPushToolRegistration } from './lib/tools/push-tool';
import { buildRunToolRegistration } from './lib/tools/run-tool';
import { buildStormsToolRegistration } from './lib/tools/storms-tool';
import { createPushScheduler } from './lib/services/push-scheduler';
import { createCommitPolicyEngine, type IEngineResult } from './lib/engine';
import { createProcessedEventsStore } from './lib/processed-events';
import { createBranchProtectionAdapter } from './lib/services/branch-protection-adapter';
import { StormDetector } from './lib/services/storm-detector';
import { StormLog } from './lib/services/storm-log';
import { fileRepairProposals } from './lib/services/repair-proposer';

const OptionsSchema = CommitPolicyOptionsSchema;

type ConfiguredForgeProvider = 'github' | 'gitlab' | 'unknown';

const resolveConfiguredProvider = (
	providers: Readonly<Record<string, ConfiguredForgeProvider>>,
	host: string,
): ConfiguredForgeProvider => {
	const normalizedHost = host.toLowerCase();
	for (const [configuredHost, provider] of Object.entries(providers)) {
		if (configuredHost.toLowerCase() === normalizedHost) return provider;
	}
	return normalizedHost === 'github.com'
		? 'github'
		: normalizedHost === 'gitlab.com'
			? 'gitlab'
			: 'unknown';
};

export const validateCommitPolicyConfiguration = (
	input: IPluginConfigurationValidationInput,
): readonly IPluginConfigurationIssue[] => {
	const raw = input.pluginOptions.get('commit-policy');
	if (raw === undefined) return [];
	const push = raw.push;
	if (typeof push !== 'object' || push === null) return [];
	const pushOptions = push as {
		readonly branch?: unknown;
		readonly enabled?: unknown;
		readonly protectedBranches?: unknown;
		readonly protectedPrefixes?: unknown;
	};
	const branch = pushOptions.branch;
	const protectedBranches = Array.isArray(pushOptions.protectedBranches)
		? pushOptions.protectedBranches
		: [];
	const protectedPrefixes = Array.isArray(pushOptions.protectedPrefixes)
		? pushOptions.protectedPrefixes.filter(
				(prefix): prefix is string => typeof prefix === 'string',
			)
		: [];
	const matchesProtectedBranch =
		typeof branch === 'string' && protectedBranches.includes(branch);
	const matchesProtectedPrefix =
		typeof branch === 'string' &&
		protectedPrefixes.some((prefix) => branch.startsWith(prefix));
	if (
		pushOptions.enabled === true &&
		typeof branch === 'string' &&
		(matchesProtectedBranch || matchesProtectedPrefix)
	) {
		return [
			{
				code: 'PUSH_TARGET_IS_PROTECTED',
				message:
					'Automatic push is enabled, but push.branch is listed in push.protectedBranches. The configured push can never succeed; choose another branch or remove the branch from the protected list.',
				keys: [
					'plugins.commit-policy.options.push.enabled',
					'plugins.commit-policy.options.push.branch',
					...(matchesProtectedBranch
						? [
								'plugins.commit-policy.options.push.protectedBranches',
							]
						: []),
					...(matchesProtectedPrefix
						? [
								'plugins.commit-policy.options.push.protectedPrefixes',
							]
						: []),
				],
				values: {
					enabled: pushOptions.enabled,
					branch,
					protectedBranches,
					protectedPrefixes,
				},
				precedence:
					'Protected-branch policy wins over automatic push; the host must make the target and protection list compatible.',
				suggestedConfig: {
					plugins: {
						'commit-policy': {
							options: { push: { branch: 'wip/agent-work' } },
						},
					},
				},
			},
		];
	}
	if (typeof branch !== 'string' || !branch.includes(':')) return [];
	const [, suggestedBranch] = branch.split(':', 2);
	if (suggestedBranch === undefined || suggestedBranch.length === 0)
		return [];
	return [
		{
			code: 'INVALID_PUSH_BRANCH_TARGET',
			message:
				'push.branch must be a branch name only. Refspec syntax such as HEAD:wip/example belongs in a git push command, not in plugins.commit-policy.options.push.branch.',
			keys: ['plugins.commit-policy.options.push.branch'],
			values: { branch },
			precedence:
				'The persisted plugin configuration is authoritative; the runtime does not reinterpret refspec syntax.',
			suggestedConfig: {
				plugins: {
					'commit-policy': {
						options: { push: { branch: suggestedBranch } },
					},
				},
			},
		},
	];
};

export default definePlugin({
	name: 'commit-policy',
	version: '0.1.0',
	legacyCachePaths: [
		{ source: '.commit-policy/processed-events.jsonl' },
		{ source: '.cache/mcp-vertex/commit-policy', destination: '.' },
	],
	describe:
		'Commit-authority plugin wrapping @mcp-vertex/git primitives with configurable identity, cadence, audit and push policies. Off by default.',
	optionsSchema: OptionsSchema,
	validateConfiguration: validateCommitPolicyConfiguration,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`commit-policy plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const policy = parsed.data;
		const branchProtectionAdapter = createBranchProtectionAdapter({
			workspaceRoot: ctx.workspace.root,
			policy: policy.push,
			...(policy.push.providerByHost !== undefined
				? {
						resolveProvider: (host: string) =>
							resolveConfiguredProvider(
								policy.push.providerByHost as Readonly<
									Record<string, ConfiguredForgeProvider>
								>,
								host,
							),
					}
				: {}),
		});
		if (
			process.env
				.MCP_VERTEX_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER ===
			'true'
		) {
			void branchProtectionAdapter
				.refresh()
				.then((result) => {
					if (!result.ok) {
						console.warn(
							`[commit-policy] remote branch protection ${result.state}: ${result.reason}`,
						);
					}
				})
				.catch((error: unknown) => {
					console.warn(
						`[commit-policy] remote branch protection refresh failed: ${error instanceof Error ? error.message : String(error)}`,
					);
				});
		}

		// Every timer + listener the plugin
		// creates gets a teardown appended here so the host's
		// `dispose()` cleans up exactly once on unload / hot-reload.
		const disposables: Array<() => void> = [];

		const run = createWriteGitRunner(
			ctx.workspace.root,
			policy.gitTimeoutMs,
		);

		const identityCtx: IIdentityResolverContext = {
			run,
			envVars: Object.freeze({
				...(process.env.GIT_AUTHOR_NAME !== undefined
					? { GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME }
					: {}),
				...(process.env.GIT_AUTHOR_EMAIL !== undefined
					? { GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL }
					: {}),
			}),
			hostIdentity:
				ctx.hostIdentity !== undefined
					? {
							...(ctx.hostIdentity.host !== undefined
								? { host: ctx.hostIdentity.host }
								: {}),
							...(ctx.hostIdentity.model !== undefined
								? { model: ctx.hostIdentity.model }
								: {}),
						}
					: undefined,
		};

		const auditAgent =
			identityCtx.hostIdentity?.host !== undefined &&
			identityCtx.hostIdentity?.model !== undefined
				? {
						host: identityCtx.hostIdentity.host,
						model: identityCtx.hostIdentity.model,
					}
				: null;

		// Consult the shared agent lock before staging anything. This is
		// a file read at a well-known path, not a dependency on the
		// proposals plugin: with no such file the provider reports
		// nothing held and every commit behaves exactly as it did. It is
		// what keeps a sweep-everything policy safe in a swarm — a file
		// another agent is midway through writing is an unfinished edit,
		// not "foreign changes the operator opted into".
		const foreignLocks = createAgentLockForeignLockProvider({
			lockFileAbs: deriveAgentLockPath(ctx.workspace.root),
			policy: {
				staleAfterMinutes: DEFAULT_AGENT_LOCK_STALE_MINUTES,
				host: hostname(),
			},
		});

		const sharedDriver = {
			run,
			policy,
			identityCtx,
			auditAgent,
			pluginCacheDir: ctx.pluginCacheDir,
			foreignLocks,
			...(identityCtx.hostIdentity?.host !== undefined
				? { selfAgent: identityCtx.hostIdentity.host }
				: {}),
		};
		const configuredInterval = policy.cadence.triggers.find(
			(t): t is Extract<typeof t, { kind: 'interval' }> =>
				t.kind === 'interval',
		);
		let intervalHandle: ReturnType<typeof setInterval> | undefined;
		let sliceListener: ReturnType<typeof createSliceListener> | undefined;
		let disposed = false;
		const intervalTimer =
			configuredInterval === undefined
				? undefined
				: (() => {
						const baseIntervalTimer = createIntervalTimer(
							run,
							configuredInterval,
						);
						return {
							check: (sinceMs: number) =>
								baseIntervalTimer.check(sinceMs),
							reset: () => baseIntervalTimer.reset(),
							stop: () => {
								if (intervalHandle !== undefined) {
									clearInterval(intervalHandle);
									intervalHandle = undefined;
								}
								baseIntervalTimer.reset();
							},
						};
					})();

		// The push scheduler unifies the
		// three modes (`onCommit`, `everyNCommits`, `everyNMinutes`)
		// and is the single source of automatic-push decisions. The
		// explicit `commit_policy_push` tool still wins — it calls
		// `runPushDriver` directly, bypassing the scheduler.
		const pushScheduler = createPushScheduler({
			run,
			policy: policy.push,
			workspaceRoot: ctx.workspace.root,
			pluginCacheDir: ctx.pluginCacheDir,
		});
		pushScheduler.start();
		disposables.push(() => pushScheduler.stop());

		// x00419 S2+S3+S4: shared StormDetector so the host boot hook
		// (S5) and the storms-tool see the same in-memory buckets.
		// S4: the StormLog persists entries under
		// `<pluginCacheDir>/storms/<key>.json` and replays them
		// on the next host boot so the count survives a restart.
		const stormDetector = new StormDetector({
			windowSeconds: 30,
			threshold: 5,
			maxSamplesPerStorm: 5,
		});
		const stormLog = new StormLog({
			cacheDir: ctx.pluginCacheDir,
		});
		stormLog.ensureDir();
		stormLog.replayInto(stormDetector);

		// x00419 S5: file a `kind: repair` proposal for any storm
		// that crossed the threshold. Idempotent — a proposal with
		// the same slug is not re-created. The host boot step runs
		// after plugin registration, so by the time `register()`
		// runs the in-memory detector has already been seeded from
		// the on-disk log; storms detected at boot feed into the
		// next `auto_work` cycle.
		const repairResults = fileRepairProposals(
			stormDetector.snapshot().storms,
			{ docsDir: ctx.docsDir },
		);
		for (const r of repairResults) {
			if (r.proposed) {
				console.warn(
					JSON.stringify({
						event: 'commit-policy.repair-proposed',
						code: r.storm.code,
						trigger: r.storm.trigger,
						file: r.filePath,
						sampleProposalIds: r.storm.sampleProposalIds,
					}),
				);
			}
		}

		const tools = [
			buildCommitToolRegistration({
				...sharedDriver,
				namespacePrefix: ctx.namespacePrefix,
				policy,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
				onCommitSucceeded: () => pushScheduler.onCommitSucceeded(),
			}),
			buildPushToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				policy,
				run,
				workspaceRoot: ctx.workspace.root,
				pluginCacheDir: ctx.pluginCacheDir,
				identityCtx,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
			}),
			buildRunToolRegistration({
				...sharedDriver,
				namespacePrefix: ctx.namespacePrefix,
				policy,
				workspaceRoot: ctx.workspace.root,
				docsDir: ctx.docsDir,
				...(intervalTimer !== undefined ? { intervalTimer } : {}),
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
				onCommitSucceeded: () => pushScheduler.onCommitSucceeded(),
			}),
			// x00419 S3: surface the engine's stderr as a structured
			// snapshot agents can read. The detector is shared with
			// the host boot hook (S5) so a storm detected at boot
			// is visible to agents calling this tool.
			buildStormsToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				detector: stormDetector,
				stormLog,
				onSnapshot: () => {
					// Persist the current state to disk. Cheap
					// (max 256 files × ~1KB), bounded by maxAgeMs
					// on the next read.
					const snap = stormDetector.snapshot();
					stormLog.write(
						snap.storms.map((s) => ({
							trigger: s.trigger,
							code: s.code,
							firstSeenAt: s.firstSeenAt,
							lastSeenAt: s.lastSeenAt,
							timestamps: snap.storms.find(
								(storm) =>
									storm.code === s.code &&
									storm.trigger === s.trigger,
							)
								? Array.from(
										{ length: s.count },
										(_, i) =>
											s.lastSeenAt -
											(s.count - i - 1) * 1000,
									)
								: [],
							sampleProposalIds: [...s.sampleProposalIds],
							...(s.suggestedFix !== undefined
								? { suggestedFix: s.suggestedFix }
								: {}),
						})),
					);
				},
			}),
		];

		// The idempotency store lives at
		// `<pluginCacheDir>/processed-events.jsonl`.
		// Created BEFORE the engine so the engine constructor
		// can receive a reference; disposed by `engine.dispose()`.
		const processedEvents = createProcessedEventsStore({
			workspaceRoot: ctx.workspace.root,
			path: `${ctx.pluginCacheDir}/processed-events.jsonl`,
		});

		// The central
		// orchestrator. Every trigger dispatches into the engine
		// via the IEngineEvent interface; the engine owns the
		// pipeline (selector → branch → conventional → files →
		// stage → commit → push).
		const engine = createCommitPolicyEngine({
			driver: sharedDriver,
			branchPolicy: {
				protected: policy.push.protectedBranches,
				...(policy.push.protectedPrefixes !== undefined
					? { protectedPrefixes: policy.push.protectedPrefixes }
					: {}),
			},
			onCommitSucceeded: () => pushScheduler.onCommitSucceeded(),
			processedEvents,
		});
		disposables.push(() => engine.dispose());

		const sliceTrigger = policy.cadence.triggers.find(
			(t): t is Extract<typeof t, { kind: 'slice' }> =>
				t.kind === 'slice',
		);
		if (sliceTrigger !== undefined) {
			// The listener dispatches every
			// emitted event into the engine. The engine decides
			// what (if anything) gets committed; the ack flows
			// back so the listener can drain its pending queue.
			const handler = async (
				event: ITriggerEvent,
			): Promise<ITriggerAck> => {
				if (event.files === undefined) {
					// Refusal already surfaced via the listener's
					// `drainRefusals()`; ack OK so the queue
					// clears.
					return { ack: 'OK' };
				}
				if (
					event.kind !== 'slice' ||
					event.proposalId === undefined ||
					event.sliceId === undefined
				) {
					return { ack: 'OK' };
				}
				let result: IEngineResult;
				try {
					result = await engine.handle({
						kind: 'slice',
						proposalId: event.proposalId,
						sliceId: event.sliceId,
						files: event.files.paths,
						eventId: computeSliceTriggerEventId(event),
					});
				} catch (error) {
					console.warn(
						JSON.stringify({
							event: 'slice.detected',
							proposalId: event.proposalId,
							sliceId: event.sliceId,
							engine: 'RETRY',
						}),
					);
					throw error;
				}
				console.warn(
					JSON.stringify({
						event: 'slice.detected',
						proposalId: event.proposalId,
						sliceId: event.sliceId,
						engine:
							result.ack === 'OK' ||
							result.ack === 'ALREADY_PROCESSED'
								? 'OK'
								: 'ERR',
					}),
				);
				// `ALREADY_PROCESSED` is the idempotency win: the
				// replay produced no commit but the listener must
				// still ack OK so the pending queue clears.
				if (result.ack === 'OK' || result.ack === 'ALREADY_PROCESSED') {
					return { ack: 'OK' };
				}
				return { ack: 'ERR', reason: result.reason };
			};
			sliceListener = createSliceListener(
				ctx.workspace.root,
				ctx.cacheDir,
				sliceTrigger,
				handler,
				undefined,
				ctx.docsDir,
			);
			sliceListener.start();
		}

		if (configuredInterval !== undefined && intervalTimer !== undefined) {
			const intervalMs = configuredInterval.minutes * 60_000;
			let intervalCheckInFlight = false;
			let intervalEventSequence = 0;
			let lastIntervalRefusal: { key: string; at: number } | undefined;
			const reportIntervalRefusal = (reason: string): void => {
				const normalized = reason.replace(/\s+/gu, ' ').trim();
				const key = normalized.length > 0 ? normalized : 'unknown';
				const now = Date.now();
				if (
					lastIntervalRefusal?.key === key &&
					now - lastIntervalRefusal.at < intervalMs
				)
					return;
				lastIntervalRefusal = { key, at: now };
				console.warn(
					`[commit-policy] interval snapshot refused\n  cause: ${key}\n  action: automatic commit\n  next check: ${configuredInterval.minutes} minute(s)`,
				);
			};
			const checkInterval = async (): Promise<void> => {
				if (intervalCheckInFlight) return;
				intervalCheckInFlight = true;
				try {
					const event = await intervalTimer.check(intervalMs);
					if (event === null || event.files === undefined) return;
					intervalEventSequence += 1;
					const result = await engine.handle({
						kind: 'interval',
						files: event.files.paths,
						dirtyCount:
							event.dirtyCount ?? event.files.paths.length,
						eventId: `interval-${intervalEventSequence}`,
					});
					if (result.ack === 'ERR') {
						reportIntervalRefusal(result.reason);
					}
				} catch (error) {
					reportIntervalRefusal(
						error instanceof Error ? error.message : String(error),
					);
				} finally {
					intervalCheckInFlight = false;
				}
			};
			intervalHandle = setInterval(() => {
				void checkInterval();
			}, intervalMs);
			if (typeof intervalHandle.unref === 'function')
				intervalHandle.unref();
		}

		const knowledge = [
			{
				id: 'commit-policy',
				title: 'Commit policy',
				body: [
					'# Commit policy',
					'',
					'Wraps `git_commit` / `git_push` with three configurable policies:',
					'',
					'- `identity.mode` — `explicit | agent | repo | global | env | auto` (default `global`).',
					'- `cadence.triggers` — `slice | threshold | interval | manual` (default `[]`, so no automatic commits).',
					'- `audit.trailer` — `none | co-authored-by | body-metadata` (default `co-authored-by`).',
					'- `push.enabled` / `push.onCommit` / `push.everyNCommits` / `push.everyNMinutes` — all default `false`.',
					'- `push.protectedBranches` and `push.protectedPrefixes` default to empty lists; `push.force` defaults to `with-lease`.',
					'',
					'**Branch rules (read before committing or pushing):**',
					'- Branches listed in `push.protectedBranches` are protected: automatic commit/push is refused and changes must go through the repository review flow.',
					'- Branches matching `push.protectedPrefixes` are protected too; no prefixes are assumed when the list is empty.',
					'- Any other branch permits direct commit and push when `commit.enabled` and `push.enabled` are true. The configured lists are the only local protection source.',
					'- Call `commit_policy_status` before an automatic operation to inspect `branchPolicy.current`, the effective protected lists, and `directCommitPushAllowed`.',
					'- Remote branch protection refresh is manual by default via `commit_policy_refresh_branch_protection`; set `MCP_VERTEX_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER=true` only when the host explicitly opts into that spawn/network side effect at register time.',
					'',
					'**Off by default.** Hosts must opt in:',
					'',
					'```jsonc',
					'// mcp-vertex.config.json',
					'{',
					'  "plugins": {',
					'    "commit-policy": {',
					'      "options": {',
					'        "commit": { "enabled": true },',
					'        "push":   { "enabled": true, "onCommit": true },',
					'        "cadence": { "triggers": [{ "kind": "slice" }] },',
					'        "identity": { "mode": "explicit", "owner": { "name": "Cartago", "email": "owner@example.com" } },',
					'      }',
					'    }',
					'  }',
					'}',
					'```',
					'',
					'When configured, the slice listener polls the proposals registry',
					'and commits one slice per `done` transition; the push policy then',
					'fires per commit when `push.onCommit` is on. For dogfooding on',
					'this repo, identity uses the explicitly configured Cartago owner',
					'and the configured interval trigger runs every 5 minutes.',
				].join('\n'),
			},
		];

		const runtime: IPluginRuntime<{
			readonly tools: typeof tools;
			readonly knowledge: typeof knowledge;
		}> = {
			registrations: {
				tools,
				knowledge,
			},
			// The host calls `dispose()` on unload
			// or hot-reload. The plugin tears down every listener and
			// timer it created during `register`. Idempotent: a second
			// call is a no-op.
			dispose: () => {
				if (disposed) return;
				disposed = true;
				try {
					sliceListener?.stop();
				} catch {
					// best-effort cleanup — a leaked listener is
					// better than a refused dispose.
				}
				try {
					intervalTimer?.stop();
				} catch {
					// best-effort cleanup — a leaked timer is
					// better than a refused dispose.
				}
				sliceListener = undefined;
				intervalHandle = undefined;
				for (const teardown of disposables.splice(0)) {
					try {
						teardown();
					} catch {
						// best-effort cleanup — a leaked listener is
						// better than a refused dispose.
					}
				}
			},
			abortable: true,
		};
		return runtime;
	},
});

export { CommitPolicyOptionsSchema };
export type {
	ICommitPolicyOptions,
	ICommitPolicyIdentity,
	ICommitPolicyAudit,
	ICommitPolicyCadence,
	ICommitPolicyCommit,
	ICommitPolicyPush,
	CommitPolicyIdentityMode,
	AuditTrailerKind,
	TriggerKind,
	ForceMode,
} from './lib/contracts/options';
