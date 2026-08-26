/**
 * index.ts — the `@mcp-vertex/commit-policy` plugin entry point.
 */

import { createWriteGitRunner, definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

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

const OptionsSchema = CommitPolicyOptionsSchema;

export default definePlugin({
	name: 'commit-policy',
	version: '0.1.0',
	describe:
		'Commit-authority plugin wrapping @mcp-vertex/git primitives with configurable identity, cadence, audit and push policies. Off by default.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`commit-policy plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const policy = parsed.data;

		// x00261 (AUD-CP-003): every timer + listener the plugin
		// creates gets a teardown appended here so the host's
		// `dispose()` cleans up exactly once on unload / hot-reload.
		const disposables: Array<() => void> = [];

		const run = createWriteGitRunner(ctx.workspace.root);

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
			}),
			buildPushToolRegistration({
				namespacePrefix: ctx.namespacePrefix,
				policy,
				run,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
			}),
			buildRunToolRegistration({
				...sharedDriver,
				namespacePrefix: ctx.namespacePrefix,
				policy,
				workspaceRoot: ctx.workspace.root,
				docsDir: ctx.docsDir,
				locale: process.env.MCP_VERTEX_LOCALE ?? 'en',
			}),
		];

		const sliceTrigger = policy.cadence.triggers.find(
			(t): t is Extract<typeof t, { kind: 'slice' }> =>
				t.kind === 'slice',
		);
		if (sliceTrigger !== undefined) {
			// x00260 (AUD-CP-002): wire the listener to the engine via a
			// handler. The full `CommitPolicyEngine` is delivered by
			// f00182; until that lands we ack every event so the
			// listener still progresses (no events are silently lost).
			const handler = async (
				event: ITriggerEvent,
			): Promise<ITriggerAck> => {
				// Future: dispatch through `commitPolicyEngine.handle(event)`.
				// For now, the slice trigger is observational — every
				// emitted event is acked OK so the listener drains its
				// pending queue.
				return { ack: 'OK' };
			};
			const listener = createSliceListener(
				ctx.workspace.root,
				ctx.docsDir,
				sliceTrigger,
				handler,
			);
			listener.start();
			// x00261 (AUD-CP-003): track every listener/timer the
			// plugin owns so `dispose()` can tear them down on
			// host unload. Until x00266 lands the interval
			// scheduler, the slice listener is the only one.
			disposables.push(() => listener.stop());
		}

		return {
			tools,
			knowledge: [
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
			],
			// x00261 (AUD-CP-003): the host calls `dispose()` on unload
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
		};
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
