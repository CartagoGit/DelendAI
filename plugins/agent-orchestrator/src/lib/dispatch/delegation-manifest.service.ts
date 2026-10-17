/**
 * delegation-manifest.service.ts — each delegated step goes with a
 * manifest of what it may open, compiled from the task, and not with the
 * orchestrator's session.
 *
 * Every source's items are kept in the artifact store and compiled by
 * context-compiler into one manifest of references by hash: the subagent
 * expands only what it opens. A step whose referenced context would take
 * more than its input budget is not sent whole; it is refused, so the
 * orchestrator splits or escalates it.
 */
import type { IDelegatedTask } from '@delendai/contracts';
import {
	createContextCompiler,
	createContextRef,
} from '@delendai/context-compiler';
import { createMemoDerivationEngine } from '@delendai/state';
import { agentToolProfile, SafeWorkspaceReader } from '@delendai/core/runtime';

import type {
	IDelegationManifestOptions,
	IDelegationSource,
} from '../contracts/interfaces/delegation-manifest.interface.js';
import type { IPlanStep, ITask, SubagentRole } from '../policy/types.js';

/**
 * The agent profile each subagent role works under: the tools a role may
 * use are core's, the one list every host's agents are written from.
 */
const ROLE_PROFILE: Readonly<
	Record<SubagentRole, Parameters<typeof agentToolProfile>[0]>
> = {
	scout: 'technical_investigator',
	implementer: 'implementation_runner',
	verifier: 'delivery_verifier',
	reviewer: 'delivery_verifier',
	scribe: 'implementation_runner',
};

/** The tools a step may use: the task's narrower list, else its role's. */
const toolsFor = (task: ITask, step: IPlanStep): readonly string[] =>
	task.allowedTools ??
	agentToolProfile(ROLE_PROFILE[step.subagentRole ?? 'implementer']).tools;

/** Bytes per token, the estimate a budget is checked against. */
const BYTES_PER_TOKEN = 4;

export class DelegationTooLargeError extends Error {
	constructor(
		readonly tokens: number,
		readonly budget: number,
	) {
		super(
			`the step's context is about ${String(tokens)} tokens, over its ${String(budget)}-token input budget: split the task or escalate it`,
		);
		this.name = 'DelegationTooLargeError';
	}
}

/** The files a task names, read inside the workspace. */
export const taskFilesSource = (workspaceRoot: string): IDelegationSource => {
	const reader = new SafeWorkspaceReader(workspaceRoot);
	return {
		name: 'files',
		items: async (task) => {
			const items = [];
			for (const path of task.files ?? []) {
				try {
					items.push({
						id: path,
						value: {
							path,
							text: (await reader.readText(path)).content,
						},
					});
				} catch (error) {
					// Named but not given: said, so the subagent does not look.
					items.push({
						id: path,
						missing:
							error instanceof Error
								? error.message
								: 'unreadable',
					});
				}
			}
			return items;
		},
	};
};

/**
 * The context context-for-change gathers for the files a task names: the
 * code around them, the docs that cover them and the facts memory holds,
 * one item per section. `read` is that plugin's own call, wired only when
 * the server has it loaded.
 */
export const changeContextSource = (
	read: (
		files: readonly string[],
	) => Promise<
		readonly { readonly source: string; readonly summary: string }[]
	>,
): IDelegationSource => ({
	name: 'context-for-change',
	items: async (task) => {
		if ((task.files ?? []).length === 0) return [];
		try {
			const sections = await read(task.files ?? []);
			return sections.map((section, index) => ({
				id: `${String(index)}:${section.source}`,
				value: section,
			}));
		} catch (error) {
			// What context-for-change cannot gather is said, not dropped.
			return [
				{
					id: 'context-for-change',
					missing: error instanceof Error ? error.message : 'failed',
				},
			];
		}
	},
});

/** Builds, for a task, the manifest each of its steps is delegated with. */
export const delegationFor = (
	options: IDelegationManifestOptions,
): ((task: ITask) => (step: IPlanStep) => Promise<IDelegatedTask>) => {
	const compiler = createContextCompiler({
		artifactStore: options.store,
		derivationEngine: createMemoDerivationEngine({
			store: options.store,
			scope: options.scope,
		}),
	});
	return (task) => async (step) => {
		const refs = [];
		const missingContext: { id: string; reason: string }[] = [];
		for (const source of options.sources) {
			for (const item of await source.items(task)) {
				if ('missing' in item) {
					missingContext.push({
						id: `${source.name}:${item.id}`,
						reason: item.missing,
					});
					continue;
				}
				const record = await options.store.put(
					{
						scope: options.scope,
						kind: 'artifact',
						id: `${source.name}:${item.id}`,
					},
					item.value,
				);
				refs.push(createContextRef(record));
			}
		}
		const manifest = await compiler.compile(refs);
		const tokens = Math.ceil(manifest.bytes / BYTES_PER_TOKEN);
		if (tokens > options.inputBudget) {
			throw new DelegationTooLargeError(tokens, options.inputBudget);
		}
		return {
			objective: step.instruction,
			contractHash: options.contractHash,
			manifestId: manifest.id,
			allowedTools: toolsFor(task, step),
			acceptance: task.acceptance ?? [],
			inputBudget: options.inputBudget,
			...(missingContext.length > 0 ? { missingContext } : {}),
			moreContext: options.moreContext ?? { allowed: false },
		};
	};
};
