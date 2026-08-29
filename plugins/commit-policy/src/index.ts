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

import { CommitPolicyOptionsSchema } from './lib/contracts/options';
import type { IIdentityResolverContext } from './lib/identity/resolver';
import {
	createSliceListener,
	type ITriggerAck,
	type ITriggerEvent,
} from './lib/triggers/slice-listener';
import { buildCommitToolRegistration } from './lib/tools/commit-tool';
import { buildPushToolRegistration } from './lib/tools/push-tool';
import { buildRunToolRegistration } from './lib/tools/run-tool';
import { buildStatusToolRegistration } from './lib/tools/status-tool';
import { createPushScheduler } from './lib/services/push-scheduler';
import { createCommitPolicyEngine } from './lib/engine';
import { createProcessedEventsStore } from './lib/processed-events';

const OptionsSchema = CommitPolicyOptionsSchema;

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
	};
	const branch = pushOptions.branch;
	if (
		pushOptions.enabled === true &&
		typeof branch === 'string' &&
		Array.isArray(pushOptions.protectedBranches) &&
		pushOptions.protectedBranches.includes(branch)
	) {
		return [
			{
				code: 'PUSH_TARGET_IS_PROTECTED',
				message:
					'Automatic push is enabled, but push.branch is listed in push.protectedBranches. The configured push can never succeed; choose another branch or remove the branch from the protected list.',
				keys: [
					'plugins.commit-policy.options.push.enabled',
					'plugins.commit-policy.options.push.branch',
					'plugins.commit-policy.options.push.protectedBranches',
				],
				values: {
					enabled: pushOptions.enabled,
					branch,
					protectedBranches: pushOptions.protectedBranches,
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

		const sharedDriver = { run, policy, identityCtx, auditAgent };

		// The push scheduler unifies the
		// three modes (`onCommit`, `everyNCommits`, `everyNMinutes`)
		// and is the single source of automatic-push decisions. The
		// explicit `commit_policy_push` tool still wins — it calls
		// `runPushDriver` directly, bypassing the scheduler.
		const pushScheduler = createPushScheduler({
			run,
			policy: policy.push,
			workspaceRoot: ctx.workspace.root,
		});
		pushScheduler.start();
		disposables.push(() => pushScheduler.stop());

		const tools = [
			buildStatusToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				options: policy,
				identityCtx,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
			}),
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
				identityCtx,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
			}),
			buildRunToolRegistration({
				...sharedDriver,
				namespacePrefix: ctx.namespacePrefix,
				policy,
				workspaceRoot: ctx.workspace.root,
				docsDir: ctx.docsDir,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
				onCommitSucceeded: () => pushScheduler.onCommitSucceeded(),
			}),
		];

		// The idempotency store lives at
		// `<workspaceRoot>/.commit-policy/processed-events.jsonl`.
		// Created BEFORE the engine so the engine constructor
		// can receive a reference; disposed by `engine.dispose()`.
		const processedEvents = createProcessedEventsStore({
			workspaceRoot: ctx.workspace.root,
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
				const result = await engine.handle({
					kind: 'slice',
					proposalId: event.proposalId,
					sliceId: event.sliceId,
					files: event.files.paths,
					eventId: `${event.proposalId}-${event.sliceId}`,
				});
				// `ALREADY_PROCESSED` is the idempotency win: the
				// replay produced no commit but the listener must
				// still ack OK so the pending queue clears.
				if (result.ack === 'OK' || result.ack === 'ALREADY_PROCESSED') {
					return { ack: 'OK' };
				}
				return { ack: 'ERR', reason: result.reason };
			};
			const listener = createSliceListener(
				ctx.workspace.root,
				ctx.docsDir,
				sliceTrigger,
				handler,
			);
			listener.start();
			disposables.push(() => listener.stop());
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
					'- `push.protectedBranches` defaults to `main` + `master`; `push.force` defaults to `with-lease`.',
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
					'        "identity": { "mode": "global" }',
					'      }',
					'    }',
					'  }',
					'}',
					'```',
					'',
					'When configured, the slice listener polls the proposals registry',
					'and commits one slice per `done` transition; the push policy then',
					'fires per commit when `push.onCommit` is on. For dogfooding on',
					'this repo, identity resolves to the workstation global git user.',
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
				for (const teardown of disposables) {
					try {
						teardown();
					} catch {
						// best-effort cleanup — a leaked listener is
						// better than a refused dispose.
					}
				}
				disposables.length = 0;
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
