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
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type {
	IDelegationManifestOptions,
	IDelegationSource,
} from '../contracts/interfaces/delegation-manifest.interface.js';
import type { IPlanStep, ITask } from '../policy/types.js';

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
				} catch {
					// A file the task names but the workspace lacks is not context.
				}
			}
			return items;
		},
	};
};

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
		for (const source of options.sources) {
			for (const item of await source.items(task)) {
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
			allowedTools: options.allowedTools,
			acceptance: options.acceptance,
			inputBudget: options.inputBudget,
			moreContext: options.moreContext ?? { allowed: false },
		};
	};
};
