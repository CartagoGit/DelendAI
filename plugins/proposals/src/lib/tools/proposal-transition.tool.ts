/**
 * f113 S3 — `<prefix>_proposal_transition`: move a proposal to a new
 * status, validating the move against the DFA (f113 §4.2) and keeping
 * the folder (f113 §4.1) and frontmatter `status` in sync via one
 * atomic operation (`withFileMutex` + `writeFileAtomic` + `git mv`).
 *
 * Only operates on proposals whose CURRENT frontmatter status is
 * already one of the new 7 (`IProposalStatus`) — the 14 legacy files
 * still use the old 8-status union and are untouched by this tool
 * until S11/S12 migrate them (see S1's note on `sync-proposal-registry.ts`).
 * A legacy file's current status simply won't be found in
 * `PROPOSAL_STATUS_TRANSITIONS`, so the tool refuses cleanly instead of
 * needing a separate feature flag to stay safe.
 */
import { mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalStatus } from '../contracts/constants/proposal-glossary.constant';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { createGitRunner } from '../shared/git-runner';
import type { IGitRunner } from '../shared/git-runner';

export interface IProposalTransitionToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path to `docs/proposals/` (the 7 status folders live here). */
	readonly proposalsDirAbs: string;
	readonly workspaceRoot: string;
	/** Injectable for tests; defaults to a real `git mv` in `workspaceRoot`. */
	readonly gitRunner?: IGitRunner;
}

export interface IProposalTransitionArgs {
	readonly id: string;
	readonly to: string;
	readonly reason: string;
}

const isKnownStatus = (value: string): value is IProposalStatus =>
	value in PROPOSAL_STATUSES;

const TOOL_ERROR_SCHEMA = z.object({
	reason: z.string(),
	nextAction: z.string().optional(),
});

const PROPOSAL_TRANSITION_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: TOOL_ERROR_SCHEMA.optional(),
	id: z.string().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	reason: z.string().optional(),
	movedFrom: z.string().optional(),
	movedTo: z.string().optional(),
	warning: z.string().optional(),
});

interface ILocatedProposal {
	readonly absPath: string;
	readonly relPath: string;
	readonly folder: string;
	readonly raw: string;
	readonly status: string;
}

/** Walks the 7 status folders (plus any stray top-level `.md`) for the file whose frontmatter `id` matches. */
const locateProposal = async (
	proposalsDirAbs: string,
	id: string,
): Promise<ILocatedProposal | null> => {
	const folders = [...Object.values(STATUS_TO_FOLDER), '.'];
	for (const folder of folders) {
		const dirAbs = join(proposalsDirAbs, folder);
		const entries = await readdir(dirAbs, { withFileTypes: true }).catch(
			() => null,
		);
		if (entries === null) continue;
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
			const absPath = join(dirAbs, entry.name);
			const raw = await readFile(absPath, 'utf8');
			const block = extractYamlBlock(raw);
			if (block === null) continue;
			const fm = parseFrontmatterBlock(block);
			if (fm.id !== id) continue;
			return {
				absPath,
				relPath: relative(proposalsDirAbs, absPath),
				folder: folder === '.' ? '' : folder,
				raw,
				status: typeof fm.status === 'string' ? fm.status : '',
			};
		}
	}
	return null;
};

/** Replaces the frontmatter's `status:` line in place; leaves everything else byte-identical. */
const setFrontmatterStatus = (raw: string, newStatus: string): string => {
	const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---)/);
	if (!m) return raw;
	const block = m[1] ?? '';
	const replaced = block.replace(/^status:.*$/m, `status: ${newStatus}`);
	return replaced + raw.slice(block.length);
};

export const runProposalTransition = async (
	args: IProposalTransitionArgs,
	options: IProposalTransitionToolOptions,
) => {
	if (args.reason.trim() === '') {
		return toolError(
			'reason is required',
			'Call proposal_transition with a non-empty reason (audit trail).',
		);
	}
	if (!isKnownStatus(args.to)) {
		return toolError(
			`"${args.to}" is not one of the 7 known statuses`,
			`Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		);
	}

	const found = await locateProposal(options.proposalsDirAbs, args.id);
	if (found === null) {
		return toolError(
			`no proposal with id "${args.id}" found under ${options.proposalsDirAbs}`,
			'Check the id, or run sync_proposals first.',
		);
	}

	if (!isKnownStatus(found.status)) {
		return toolError(
			`"${args.id}" has current status "${found.status}", which is not on the new state machine yet`,
			'This proposal predates f113 (legacy 8-status union) — it is migrated by S11/S12, not transitioned by this tool.',
		);
	}

	const legalTargets = PROPOSAL_STATUS_TRANSITIONS[found.status];
	if (!legalTargets.has(args.to)) {
		return toolError(
			`illegal transition: "${found.status}" → "${args.to}"`,
			legalTargets.size > 0
				? `From "${found.status}", the only legal targets are: ${[...legalTargets].join(', ')}.`
				: `"${found.status}" is terminal — no transitions out.`,
		);
	}

	const gitRunner =
		options.gitRunner ?? createGitRunner(options.workspaceRoot);
	const newFolder = STATUS_TO_FOLDER[args.to];
	const filename = found.relPath.split('/').pop() ?? found.relPath;
	const newAbsPath = join(options.proposalsDirAbs, newFolder, filename);
	const moved = newAbsPath !== found.absPath;

	let gitWarning: string | undefined;
	await withFileMutex(found.absPath, async () => {
		const current = await readFile(found.absPath, 'utf8');
		const updated = setFrontmatterStatus(current, args.to);
		await writeFileAtomic(found.absPath, updated);

		if (moved) {
			// The 7 status folders are expected to already exist (this repo
			// seeds them with .gitkeep), but a host project adopting f113
			// fresh, or a stray custom folder, might not have created the
			// target yet — never fail the transition over a missing dir.
			await mkdir(dirname(newAbsPath), { recursive: true });
			const result = await gitRunner(['mv', found.absPath, newAbsPath]);
			if (!result.ok) {
				// Best-effort: git mv failing (no git, file untracked, dirty
				// tree) must not strand the frontmatter mid-update. A plain
				// rename still gets the folder/status pair consistent; blame
				// preservation is lost, surfaced as a warning, not an error.
				await rename(found.absPath, newAbsPath);
				gitWarning = `git mv failed (${result.reason ?? 'unknown'}); fell back to a plain rename — blame history for this file was not preserved by git.`;
			}
		}
	});

	return toolOk({
		id: args.id,
		from: found.status,
		to: args.to,
		reason: args.reason,
		movedFrom: found.relPath,
		movedTo: relative(options.proposalsDirAbs, newAbsPath),
		...(gitWarning ? { warning: gitWarning } : {}),
	});
};

/** Registration for `<prefix>_proposal_transition`. */
export const buildProposalTransitionRegistration = (
	options: IProposalTransitionToolOptions,
): IToolRegistration => ({
	id: 'proposal_transition',
	effects: ['write'],
	summary:
		'Move a proposal to a new status; validated, folder+frontmatter kept in sync.',
	tags: ['work'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_proposal_transition`,
			{
				outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
				description:
					'Move a proposal to a new status. Validates against the DFA, updates frontmatter + git mv. Requires reason.',
				inputSchema: z.object({
					id: z.string().min(1),
					to: z.string().min(1),
					reason: z.string().min(1),
				}),
			},
			async (args: IProposalTransitionArgs) =>
				runProposalTransition(args, options),
		);
	},
});
