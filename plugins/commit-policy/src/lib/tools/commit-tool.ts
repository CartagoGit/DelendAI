/**
 * commit-tool.ts — `commit_policy_commit`.
 *
 * Thin tool wrapper over the pure `runCommitDriver`. Composes the
 * tool envelope (zod schemas, `toolOk`/`toolError`, structured
 * result) and nothing else. The driver owns all policy logic so the
 * triggers can re-use the exact same surface.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson, toolOk } from '@delendai/core/public';

import {
	BRANCH_PROTECTED_REFUSAL_CODE,
	classifyRefusal,
	refusalHasCode,
} from '../contracts/branch';
import type { ICommitPolicyOptions } from '../contracts/options';
import {
	localizedScopeRefusalTip,
	localizedString,
} from '../contracts/i18n-types';
import {
	runCommitDriver,
	type ICommitDriverInput,
	type ICommitDriverOptions,
} from '../services/commit-driver';
import type { IPushDriverResult } from '../services/push-driver';

const commitToolFallbackNextAction = (refusal: string): string => {
	if (refusal.includes('HEAD is detached')) {
		return 'Check out a feature/agent branch and retry the commit.';
	}
	if (refusal.includes('nothing to commit')) {
		return 'Stage or edit at least one allowed file and retry the commit.';
	}
	if (refusal.includes('SLICE_HAS_NO_FILES')) {
		return 'Attach files to the slice or disable slice scoping before retrying.';
	}
	if (refusal.includes('TRIGGER_HAS_NO_FILES')) {
		return 'Only fire the trigger when it has concrete dirty files to commit.';
	}
	return 'Inspect the refusal detail, fix the local precondition, and retry the commit.';
};

export interface ICommitToolOptions extends ICommitDriverOptions {
	readonly namespacePrefix: string;
	readonly policy: ICommitPolicyOptions;
	readonly locale?: string | undefined;
	/**
	 * x00266 (AUD-CP-008): hook fired after a successful commit
	 * so the push scheduler can decide whether the configured
	 * mode (`onCommit` / `everyNCommits`) wants to push now.
	 * Defaults to a no-op so the tool still works in tests and
	 * in setups that prefer to invoke `commit_policy_push` by
	 * hand.
	 */
	readonly onCommitSucceeded?:
		| (() => Promise<IPushDriverResult | null>)
		| undefined;
}

const InputSchema = z.object({
	message: z.string().min(1, 'commit message must not be empty'),
	files: z.array(z.string()).optional(),
	slice: z
		.object({
			proposalId: z.string().min(1),
			sliceId: z.string().min(1),
			files: z.array(z.string()),
		})
		.optional(),
});

const OutputSchema = z.object({
	ok: z.boolean(),
	committed: z.boolean(),
	pushed: z.boolean(),
	hash: z.string().optional(),
	reason: z.string().optional(),
	refusal: z.string().optional(),
	code: z.string().optional(),
	resolvedAuthor: z
		.object({
			displayName: z.string(),
			email: z.string(),
			label: z.string(),
		})
		.optional(),
});

export const runCommitPolicyCommit = async (
	args: z.infer<typeof InputSchema>,
	options: ICommitToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const input: ICommitDriverInput =
		args.slice !== undefined
			? {
					message: args.message,
					...(args.files !== undefined ? { files: args.files } : {}),
					sliceContext: {
						proposalId: args.slice.proposalId,
						sliceId: args.slice.sliceId,
						files: args.slice.files,
					},
				}
			: {
					message: args.message,
					...(args.files !== undefined ? { files: args.files } : {}),
				};

	const result = await runCommitDriver(input, options);
	const parseResult = OutputSchema.safeParse({
		ok: result.committed && !result.refusal,
		committed: result.committed,
		pushed: result.pushed,
		...(result.hash !== undefined ? { hash: result.hash } : {}),
		...(result.reason !== undefined ? { reason: result.reason } : {}),
		...(result.refusal !== undefined ? { refusal: result.refusal } : {}),
		...(result.refusal !== undefined
			? { code: result.code ?? classifyRefusal(result.refusal) }
			: {}),
		...(result.resolvedAuthor !== undefined
			? { resolvedAuthor: result.resolvedAuthor }
			: {}),
	});
	if (!parseResult.success) {
		return toolError(
			`commit_policy_commit output schema mismatch: ${parseResult.error.message}`,
			'Report this as a plugin bug.',
		);
	}

	if (result.refusal !== undefined) {
		const refusal = result.refusal;
		const localized = localizedString(options.locale, (catalog) => {
			if (refusal.includes('commit.enabled')) {
				return {
					summary: catalog.tools.commit.refuseDisabled,
					nextAction: catalog.tools.commit.nextActionCommit,
				};
			}
			if (
				refusal.includes('protected branch') ||
				refusalHasCode(refusal, BRANCH_PROTECTED_REFUSAL_CODE)
			) {
				return {
					summary: catalog.tools.commit.refuseProtectedBranch({
						branch: refusal.match(/"([^"]+)"/)?.[1] ?? '',
					}),
					nextAction: catalog.tools.commit.nextActionProtected,
				};
			}
			if (refusal.includes('NON_CONVENTIONAL_MESSAGE')) {
				const conventionalCode = refusal.includes('EMPTY_HEADER')
					? 'EMPTY_HEADER'
					: refusal.includes('UNKNOWN_TYPE')
						? 'UNKNOWN_TYPE'
						: 'MALFORMED_HEADER';
				return {
					summary: refusal,
					nextAction: localizedScopeRefusalTip(
						options.locale,
						conventionalCode,
					),
				};
			}
			if (
				refusal.includes('HEAD is detached') ||
				refusal.includes('nothing to commit') ||
				refusal.includes('SLICE_HAS_NO_FILES') ||
				refusal.includes('TRIGGER_HAS_NO_FILES')
			) {
				return {
					summary: refusal,
					nextAction: commitToolFallbackNextAction(refusal),
				};
			}
			return {
				summary: refusal.includes('identity.mode')
					? catalog.tools.commit.refuseNoIdentity({
							mode: options.policy.identity.mode,
						})
					: refusal,
				nextAction: refusal.includes('identity.mode')
					? catalog.tools.commit.nextActionIdentity
					: commitToolFallbackNextAction(refusal),
			};
		});
		const code = result.code ?? classifyRefusal(refusal);
		const error = {
			ok: false as const,
			error: {
				reason: localized.summary,
				nextAction: localized.nextAction,
				code,
			},
		};
		return { ...toolJson(error), isError: true };
	}

	if (!result.committed) {
		return toolError(
			result.reason ?? 'commit failed',
			'Check there are staged/changed files and the message is valid.',
		);
	}

	// x00298/S4: onCommit is part of the persistence contract. Await it
	// before reporting success so committed=true,pushed=false cannot be
	// mistaken for a completed commit-and-push operation.
	if (options.onCommitSucceeded !== undefined) {
		let pushResult: IPushDriverResult | null;
		try {
			pushResult = await options.onCommitSucceeded();
		} catch (error) {
			return toolError(
				JSON.stringify({
					committed: true,
					pushed: false,
					hash: result.hash,
					reason:
						error instanceof Error ? error.message : String(error),
				}),
				'Commit completed locally but the configured push failed; inspect the reason and retry push.',
			);
		}
		if (pushResult !== null && !pushResult.ok) {
			return toolError(
				JSON.stringify({
					committed: true,
					pushed: false,
					hash: result.hash,
					reason: pushResult.refusal,
				}),
				'Commit completed locally but the configured push was refused or failed; inspect the reason and retry push.',
			);
		}
	}

	const successMessage = localizedString(options.locale, (catalog) =>
		catalog.tools.commit.success({
			hash: result.hash ?? '(unknown)',
			author: result.resolvedAuthor?.displayName ?? '(unknown)',
		}),
	);

	return toolOk({
		...parseResult.data,
		message: successMessage,
	});
};

export const buildCommitToolRegistration = (
	options: ICommitToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_commit',
	summary:
		'Commit through the policy engine: resolves identity, appends audit trail, refuses protected branches + disabled commit.',
	tags: ['commit-policy', 'commit', 'write'],
	effects: ['write'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_commit`,
			{
				description:
					'Stages `files` (or whatever the slice context provides) and creates a Conventional Commit. The author is resolved from `identity` (default: `global` git config). An audit trailer (`Co-authored-by` by default) is appended when `audit.trailer !== "none"`. Refuses when commit.enabled is false, identity cannot resolve, or the slice would commit onto a protected branch. Write effect.',
				outputSchema: OutputSchema,
				inputSchema: InputSchema,
			},
			async (args) => runCommitPolicyCommit(args, options),
		);
	},
});
