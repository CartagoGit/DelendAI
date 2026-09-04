import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

import {
	readFrontmatterField,
	setFrontmatterStatus,
} from '../proposals/proposal-frontmatter-writer';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';

export interface IAutoTransitionRepairEntry {
	readonly proposalId: string;
	readonly path: string;
	readonly reason: string;
	readonly ts: string;
}

export interface IAutoTransitionRepairDeps {
	readonly ensureDir: (path: string) => Promise<void>;
	readonly now: () => string;
	readonly readText: (path: string) => Promise<string>;
	readonly withLock?: <T>(path: string, work: () => Promise<T>) => Promise<T>;
	readonly writeText: (path: string, text: string) => Promise<void>;
}

export const AUTO_TRANSITION_REPAIRS_RELATIVE_PATH = join(
	'.cache',
	'mcp-vertex',
	'proposals',
	'auto-transition-repairs.json',
);

export const shouldAutoTransitionProposal = (
	proposalId: string,
	markdown: string,
	options: { readonly requirePeerReview?: boolean } = {},
): boolean => {
	const status = readFrontmatterField(markdown, 'status')
		?.trim()
		.toLowerCase();
	const type = readFrontmatterField(markdown, 'type')?.trim().toLowerCase();
	if (type === 'plan') return false;
	if (
		options.requirePeerReview !== false
			? status !== 'review'
			: status === 'done' || status === undefined
	)
		return false;
	const plan = parseProposalSlicePlan(proposalId, markdown);
	if (plan === null || plan.slices.length === 0) return false;
	return plan.slices.every((slice) => slice.status === 'done');
};

export const markProposalDoneForAutoTransition = (
	proposalId: string,
	markdown: string,
	options: { readonly requirePeerReview?: boolean } = {},
): { readonly changed: boolean; readonly markdown: string } => {
	if (!shouldAutoTransitionProposal(proposalId, markdown, options)) {
		return { changed: false, markdown };
	}
	return {
		changed: true,
		markdown: setFrontmatterStatus(markdown, 'done'),
	};
};

const createAutoTransitionRepairDeps = (): IAutoTransitionRepairDeps => ({
	ensureDir: async (path) => {
		await mkdir(path, { recursive: true });
	},
	now: () => new Date().toISOString(),
	readText: async (path) =>
		new SafeWorkspaceReader(dirname(path))
			.readText(basename(path))
			.then((value) => value.content)
			.catch((error: unknown) => {
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					return '';
				}
				throw error;
			}),
	withLock: async (path, work) => withFileMutex(path, work),
	writeText: async (path, text) => {
		await writeFileAtomic(path, text);
	},
});

export const readAutoTransitionRepairs = async (
	workspaceRoot: string,
	deps: IAutoTransitionRepairDeps = createAutoTransitionRepairDeps(),
): Promise<readonly IAutoTransitionRepairEntry[]> => {
	const path = join(workspaceRoot, AUTO_TRANSITION_REPAIRS_RELATIVE_PATH);
	const raw = await deps.readText(path);
	if (raw.trim() === '') return [];
	try {
		const parsed = JSON.parse(raw) as Partial<{
			entries: IAutoTransitionRepairEntry[];
		}>;
		return Array.isArray(parsed.entries) ? parsed.entries : [];
	} catch {
		return [];
	}
};

export const recordAutoTransitionRepair = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly path: string;
	readonly reason: string;
	readonly deps?: IAutoTransitionRepairDeps;
}): Promise<readonly IAutoTransitionRepairEntry[]> => {
	const deps = input.deps ?? createAutoTransitionRepairDeps();
	const path = join(
		input.workspaceRoot,
		AUTO_TRANSITION_REPAIRS_RELATIVE_PATH,
	);
	await deps.ensureDir(dirname(path));
	const write = async (): Promise<readonly IAutoTransitionRepairEntry[]> => {
		const current = await readAutoTransitionRepairs(
			input.workspaceRoot,
			deps,
		);
		const nextEntry: IAutoTransitionRepairEntry = {
			proposalId: input.proposalId,
			path: input.path,
			reason: input.reason,
			ts: deps.now(),
		};
		const deduped = current.filter(
			(entry) =>
				!(
					entry.proposalId === nextEntry.proposalId &&
					entry.path === nextEntry.path &&
					entry.reason === nextEntry.reason
				),
		);
		const entries = [...deduped, nextEntry];
		await deps.writeText(
			path,
			`${JSON.stringify({ entries }, null, '    ')}\n`,
		);
		return entries;
	};
	if (deps.withLock !== undefined) {
		return deps.withLock(path, write);
	}
	return write();
};
