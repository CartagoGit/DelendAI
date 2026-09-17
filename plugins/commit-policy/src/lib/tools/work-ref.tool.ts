/**
 * work-ref.tool.ts — `commit_policy_work_ref`.
 *
 * The shared-checkout-pr model has one safe persistence primitive: a WIP ref
 * built by the core WIP engine. This tool is the host-neutral bridge to that
 * primitive. It deliberately accepts only policy-derived ref identities and
 * never exposes a branch, checkout or generic git command escape hatch.
 */

import { validateScopePaths } from '@delendai/core/plugin';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	anchorFromPolicy,
	anchorRefusal,
	compactOutputSchema,
	observeAnchor,
	type IToolRegistration,
	toolError,
	toolOk,
} from '@delendai/core/public';
import type { IWorkRefToolOptions } from '../contracts/interfaces/work-ref-tool.interface';
import { WORK_REF_INPUT_SCHEMA } from '../contracts/constants/work-ref.constant';
import {
	publishCheckpoint,
	recoverCheckpoint,
	verifyCheckpoint,
} from '../services/work-ref-checkpoint.service';
import { validatePolicyAndRef } from '../services/work-ref-policy.service';
import {
	assertContainedParent,
	assertContainedPath,
	cleanToBase,
	expandClaimedScope,
	integrationBase,
	lstatUnder,
	readBaseEntry,
	runOutput,
	snapshot,
	snapshotUnchanged,
} from '../services/work-ref-repo.service';

export type { IWorkRefToolOptions } from '../contracts/interfaces/work-ref-tool.interface';

const refusal = (reason: string, nextAction: string) =>
	toolError(reason, nextAction);

export const runCommitPolicyWorkRef = async (
	args: unknown,
	options: IWorkRefToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const parsed = WORK_REF_INPUT_SCHEMA.safeParse(args ?? {});
	if (!parsed.success)
		return refusal(
			`WORK_REF_INVALID_INPUT: ${parsed.error.message}`,
			'Provide action, identity fields and an exact path scope.',
		);
	const input = parsed.data;
	const policyResult = validatePolicyAndRef(options, input);
	if ('reason' in policyResult)
		return refusal(
			policyResult.reason,
			'Inspect the resolved development policy and bind the WIP engine before retrying.',
		);
	const engine = options.wip;
	if (engine === undefined)
		return refusal(
			'WORK_REF_ENGINE_UNAVAILABLE: no WIP engine is bound',
			'Run this tool in a git workspace with a WIP-ref development policy.',
		);
	const scopeValidation = validateScopePaths(input.paths);
	if (scopeValidation.invalid.length > 0)
		return refusal(
			`WORK_REF_INVALID_SCOPE: ${scopeValidation.invalid.map((entry) => `${entry.path} (${entry.reason})`).join(', ')}`,
			'Use repository-relative paths without traversal or .git.',
		);
	const validPaths = scopeValidation.valid;
	const before = await snapshot(engine);
	try {
		const policy = options.policy;
		if (policy === undefined)
			return refusal(
				'WORK_REF_POLICY_REQUIRED: no resolved development policy is available',
				'Bind the resolved development policy before retrying.',
			);
		const anchor = anchorRefusal(
			await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
		);
		if (anchor !== undefined)
			return refusal(
				`WORK_REF_ANCHOR_REFUSED: ${anchor}`,
				'Keep the shared checkout attached to the policy integration branch.',
			);
		const baseSha = await integrationBase(engine, policy);
		if (baseSha === undefined)
			return refusal(
				'WORK_REF_BASE_UNRESOLVED: the policy integration branch could not be resolved.',
				'Fetch or create the configured integration branch, then retry.',
			);
		for (const path of validPaths)
			await assertContainedPath(engine.context.root, path);
		if (input.action === 'recover') {
			const commit = input.commit!;
			const publication = await recoverCheckpoint(
				engine,
				policy,
				options.remote,
				policyResult.ref,
				commit,
				validPaths,
			);
			const after = await snapshot(engine);
			if (!snapshotUnchanged(before, after))
				return refusal(
					'WORK_REF_INVARIANT_FAILED: recovery changed HEAD, branch or the real index.',
					'Stop and inspect the workspace before retrying.',
				);
			return toolOk({
				action: input.action,
				ref: policyResult.ref,
				commit,
				scope: validPaths,
				cleaned: [],
				restored: [],
				deleted: [],
				published: publication.published,
				remote: publication.remote,
				headMoved: false,
				indexTouched: false,
			});
		}
		if (input.action === 'materialize') {
			const result = await engine.restorePathsFromRef({
				ref: policyResult.ref,
				paths: validPaths,
			});
			if (result.status !== 'restored')
				return refusal(
					`WORK_REF_MATERIALIZE_REFUSED: ${result.reason ?? result.status}`,
					'Use only paths recorded in the checkpoint scope.',
				);
			const commit =
				(await runOutput(engine.context.run, [
					'rev-parse',
					'--verify',
					`${policyResult.ref}^{}`,
				])) ?? '';
			const after = await snapshot(engine);
			if (!snapshotUnchanged(before, after))
				return refusal(
					'WORK_REF_INVARIANT_FAILED: materialize changed HEAD, branch or the real index.',
					'Stop and inspect the workspace before retrying.',
				);
			return toolOk({
				action: input.action,
				ref: policyResult.ref,
				commit,
				scope: validPaths,
				cleaned: [],
				restored: result.restored,
				deleted: result.deleted,
				published: false,
				remote: '',
				headMoved: false,
				indexTouched: false,
			});
		}
		const expandedScope = await expandClaimedScope(
			engine,
			baseSha,
			validPaths,
		);
		if (input.cleanAfterCheckpoint === true) {
			// Preflight every target before reporting durability. A
			// type-conflicting directory or symlinked parent must not be
			// discovered halfway through cleanup.
			for (const path of expandedScope) {
				await assertContainedParent(engine.context.root, path);
				const info = await lstatUnder(engine.context.root, path);
				const entry = await readBaseEntry(
					engine.context.run,
					baseSha,
					path,
				);
				if (
					entry !== undefined &&
					info?.isDirectory() &&
					!info.isSymbolicLink()
				) {
					throw new Error(
						`refusing to clean directory ${path} as a base file`,
					);
				}
			}
		}
		const checkpoint = await engine.createOrUpdateWipRef({
			baseSha,
			paths: expandedScope,
			ref: policyResult.ref,
			message: input.message!,
		});
		if (
			checkpoint.status !== 'created' &&
			checkpoint.status !== 'unchanged'
		)
			return refusal(
				`WORK_REF_CHECKPOINT_REFUSED: ${checkpoint.reason ?? checkpoint.status}`,
				'Keep the complete claimed scope and retry the checkpoint.',
			);
		if (
			!(await verifyCheckpoint(
				engine,
				policyResult.ref,
				checkpoint.commit,
			))
		)
			return refusal(
				'WORK_REF_CHECKPOINT_UNVERIFIED: the work ref did not resolve to the checkpoint commit.',
				'Do not clean the worktree; inspect the WIP ref and retry.',
			);
		const publication = await publishCheckpoint(
			engine,
			policy,
			options.remote,
			policyResult.ref,
			checkpoint.commit,
			checkpoint.status === 'created'
				? checkpoint.parent
				: checkpoint.commit,
		);
		let cleaned: readonly string[] = [];
		let deleted: readonly string[] = [];
		if (input.cleanAfterCheckpoint === true) {
			const clean = await cleanToBase(engine, baseSha, checkpoint.scope);
			cleaned = clean.cleaned;
			deleted = clean.deleted;
		}
		const after = await snapshot(engine);
		if (!snapshotUnchanged(before, after))
			return refusal(
				'WORK_REF_INVARIANT_FAILED: checkpoint changed HEAD, branch or the real index.',
				'Stop and inspect the workspace before retrying.',
			);
		return toolOk({
			action: input.action,
			ref: policyResult.ref,
			commit: checkpoint.commit,
			scope: checkpoint.scope,
			cleaned,
			restored: [],
			deleted,
			published: publication.published,
			remote: publication.remote,
			headMoved: false,
			indexTouched: false,
		});
	} catch (error: unknown) {
		return refusal(
			`WORK_REF_FAILED: ${error instanceof Error ? error.message : String(error)}`,
			'No branch, checkout or direct git commit is permitted; inspect the contained failure and retry.',
		);
	}
};

export const buildWorkRefToolRegistration = (
	options: IWorkRefToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_work_ref',
	summary:
		'Checkpoint exact claimed files to a policy-derived non-head WIP ref or materialize them back without moving HEAD or the real index.',
	tags: ['commit-policy', 'wip-ref', 'write'],
	effects: ['write', 'destructive'],
	disclosure: 'contextual',
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_work_ref`,
			{
				description:
					'Policy-gated shared-checkout persistence. action=checkpoint writes only the exact paths to a non-head work ref, publishes it when policy requires durable remote recovery, and may clean those paths back to the integration base; action=materialize restores only paths recorded in that ref; action=recover reattaches and republishes a verified orphan checkpoint object. It never switches branches, changes HEAD, touches the real git index or commits the integration branch.',
				inputSchema: WORK_REF_INPUT_SCHEMA,
				outputSchema: compactOutputSchema(),
			},
			async (args) => runCommitPolicyWorkRef(args, options),
		);
	},
});
