/**
 * `proposals_edit` + `proposals_add_slice` (S10, f00020) — mutate the
 * BODY of an existing proposal document: replace a top-level section
 * (`## Goal` / `## Why` / `## Non-goals` / `## Acceptance` / `## risks
 * and mitigations`) or append a new slice to the `## Slices` section.
 *
 * This module only knows the proposal markdown FORMAT — disjointness
 * validation reuses `proposal-slice-plan.ts` (the same logic
 * `proposals_plan`/`proposal_board` use) rather than re-implementing it,
 * and writes go through `withFileMutex` + `writeFileAtomic` like every
 * other durable write in this plugin. It has no opinion on git.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	toolError,
	toolOk,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import type { IProposalIndexEntry } from '../proposals/index-reader';
import {
	FIELD_CANONICAL_HEADING,
	FIELD_HEADING_RE,
	renderSectionBody,
	replaceSection,
} from '../proposals/section-editor';
import type { IEditableField } from '../proposals/section-editor';
import {
	parseProposalSlicePlan,
	planDisjointnessIssues,
} from '../swarm/proposal-slice-plan';
import type { ISliceGate } from '../swarm/proposal-slice-plan';

export interface IMutateToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	readonly indexPathAbs: string;
	readonly layout?: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	readonly extraFolders?: readonly string[];
}

interface IIndexEntry extends IProposalIndexEntry {}

const locateProposalFile = async (
	options: IMutateToolOptions,
	proposalId: string,
): Promise<{
	readonly docPath: string;
	readonly entry: IIndexEntry;
} | null> => {
	const index = await readJsonOrNull<{ proposals: IIndexEntry[] }>(
		options.indexPathAbs,
	);
	if (index === null) return null;
	const entry = index.proposals.find(
		(p) => p.id === proposalId || p.id.startsWith(`${proposalId}-`),
	);
	if (entry === undefined) return null;
	return {
		docPath: join(dirname(options.indexPathAbs), entry.file),
		entry,
	};
};

const resync = async (options: IMutateToolOptions): Promise<void> => {
	await syncProposalRegistry(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? [],
	);
};

// ---------------------------------------------------------------------------
// proposals_edit — replace a top-level body section.
// ---------------------------------------------------------------------------

// Section semantics live in `proposals/section-editor.ts` (SOLID: SRP +
// DRY). The maps and helpers used to be inlined here; they were extracted
// so future section-aware tools (e.g. `proposals_remove_section`) can
// reuse them without duplicating the regexes or the heading logic.

export const buildProposalsEditRegistration = (
	options: IMutateToolOptions,
): IToolRegistration => ({
	id: 'edit',
	effects: ['write'],
	summary:
		'Replace a top-level body section (goal/why/nonGoals/acceptance/risk) of a proposal.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_edit`,
			{
				description:
					'Replace a top-level section of a proposal document — goal (## Goal), why (## Why), nonGoals (## Non-goals), acceptance (## Acceptance), or risk (## risks and mitigations) — preserving frontmatter, ## Slices and the rest of the body. `value` is a string for prose fields or a string[] for bullet-list fields (rendered as `- <item>` lines).',
				inputSchema: z.object({
					id: z.string(),
					field: z.enum([
						'goal',
						'why',
						'nonGoals',
						'acceptance',
						'risk',
					]),
					value: z.union([z.string(), z.array(z.string())]),
				}),
				outputSchema: z.object({
					ok: z.literal(true),
					proposalId: z.string(),
					field: z.string(),
				}),
			},
			async (args: {
				id: string;
				field: string;
				value: string | string[];
			}) => {
				if (!(args.field in FIELD_HEADING_RE)) {
					return toolError(
						`unknown field "${args.field}"`,
						'Pass one of: goal, why, nonGoals, acceptance, risk.',
					);
				}
				const field = args.field as IEditableField;
				const located = await locateProposalFile(options, args.id);
				if (located === null) {
					return toolError(
						`proposal "${args.id}" not found in the index`,
						'Run sync_proposals first, or pass an existing id.',
					);
				}
				const result = await withFileMutex(
					located.docPath,
					async () => {
						const md = await readTextOrNull(located.docPath);
						if (md === null) {
							return {
								ok: false as const,
								reason: 'file vanished',
							};
						}
						const next = replaceSection(
							md,
							FIELD_HEADING_RE[field],
							FIELD_CANONICAL_HEADING[field],
							renderSectionBody(args.value),
						);
						await writeFileAtomic(located.docPath, next);
						return { ok: true as const };
					},
				);
				if (!result.ok) {
					return toolError(result.reason ?? 'edit failed');
				}
				await resync(options);
				return toolOk({ proposalId: located.entry.id, field });
			},
		);
	},
});

// ---------------------------------------------------------------------------
// proposals_add_slice — append a slice to ## Slices, validating disjointness.
// ---------------------------------------------------------------------------

const SLICE_INPUT = z.object({
	sliceId: z.string().min(1),
	title: z.string().optional(),
	files: z.array(z.string()).min(1),
	acceptanceCriteria: z.array(z.string()).optional(),
	gate: z.enum(['lint', 'type', 'e2e', 'none']).optional(),
	dependsOn: z.array(z.string()).optional(),
});

const renderNewSlice = (slice: z.infer<typeof SLICE_INPUT>): string => {
	const lines = [`### ${slice.sliceId} — ${slice.title ?? slice.sliceId}`];
	for (const f of slice.files) lines.push(`- files: ${f}`);
	if (slice.dependsOn && slice.dependsOn.length > 0) {
		lines.push(`- depends_on: [${slice.dependsOn.join(', ')}]`);
	}
	lines.push(`- gate: ${slice.gate ?? 'none'}`);
	if (slice.acceptanceCriteria && slice.acceptanceCriteria.length > 0) {
		lines.push('- acceptance:');
		for (const a of slice.acceptanceCriteria) lines.push(`  - "${a}"`);
	}
	lines.push('- status: pending');
	return lines.join('\n');
};

/** Append `sliceBlock` at the end of the `## Slices` section (before the next `## `, if any). */
const appendSliceToSection = (markdown: string, sliceBlock: string): string => {
	const lines = markdown.split('\n');
	const slicesIndex = lines.findIndex((line) => /^## Slices\s*$/.test(line));
	if (slicesIndex === -1) {
		// No ## Slices section yet: create one at the end of the document.
		return [...lines, '', '## Slices', '', sliceBlock, ''].join('\n');
	}
	let endIndex = lines.length;
	for (let i = slicesIndex + 1; i < lines.length; i += 1) {
		if (/^## /.test(lines[i] ?? '')) {
			endIndex = i;
			break;
		}
	}
	// Trim trailing blank lines inside the section before appending, so we
	// don't accumulate blank-line drift on repeated inserts.
	let insertAt = endIndex;
	while (
		insertAt > slicesIndex + 1 &&
		(lines[insertAt - 1] ?? '').trim() === ''
	) {
		insertAt -= 1;
	}
	return [
		...lines.slice(0, insertAt),
		'',
		sliceBlock,
		'',
		...lines.slice(insertAt, endIndex),
		...lines.slice(endIndex),
	].join('\n');
};

export const buildProposalsAddSliceRegistration = (
	options: IMutateToolOptions,
): IToolRegistration => ({
	id: 'add_slice',
	effects: ['write'],
	summary:
		'Insert a new file-disjoint slice into a proposal’s ## Slices section.',
	tags: ['proposals'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_add_slice`,
			{
				description:
					'Insert a new slice into the ## Slices section of a proposal document. Validates the new slice is file-disjoint from every existing slice (same check `proposals_plan` uses) and that `dependsOn` only references existing slice ids; rejects on overlap, unknown dependsOn, or a duplicate sliceId.',
				inputSchema: z.object({
					id: z.string(),
					slice: SLICE_INPUT,
				}),
				outputSchema: z.object({
					ok: z.literal(true),
					proposalId: z.string(),
					sliceId: z.string(),
				}),
			},
			async (args: {
				id: string;
				slice: z.infer<typeof SLICE_INPUT>;
			}) => {
				const located = await locateProposalFile(options, args.id);
				if (located === null) {
					return toolError(
						`proposal "${args.id}" not found in the index`,
						'Run sync_proposals first, or pass an existing id.',
					);
				}

				const result = await withFileMutex(
					located.docPath,
					async () => {
						const md = await readTextOrNull(located.docPath);
						if (md === null) {
							return {
								ok: false as const,
								reason: 'file vanished',
								status: 404,
							};
						}
						const existingPlan = parseProposalSlicePlan(
							located.entry.id,
							md,
						);
						const existingSlices = existingPlan?.slices ?? [];

						if (
							existingSlices.some(
								(s) => s.sliceId === args.slice.sliceId,
							)
						) {
							return {
								ok: false as const,
								reason: `slice "${args.slice.sliceId}" already exists in ${located.entry.id}`,
								status: 409,
							};
						}

						const unknownDeps = (args.slice.dependsOn ?? []).filter(
							(dep) =>
								!existingSlices.some((s) => s.sliceId === dep),
						);
						if (unknownDeps.length > 0) {
							return {
								ok: false as const,
								reason: `dependsOn references unknown slice(s): ${unknownDeps.join(', ')}`,
								status: 422,
							};
						}

						const candidatePlan = {
							proposalId: located.entry.id,
							globalGate:
								existingPlan?.globalGate ??
								('none' as ISliceGate),
							slices: [
								...existingSlices,
								{
									proposalId: located.entry.id,
									sliceId: args.slice.sliceId,
									title:
										args.slice.title ?? args.slice.sliceId,
									owner: null,
									files: args.slice.files,
									dependsOn: args.slice.dependsOn ?? [],
									gate:
										args.slice.gate ??
										('none' as ISliceGate),
									status: 'pending' as const,
									acceptanceCriteria:
										args.slice.acceptanceCriteria ?? [],
								},
							],
						};
						const issues = planDisjointnessIssues(candidatePlan);
						const newIssues = issues.filter(
							(issue) =>
								issue.first === args.slice.sliceId ||
								issue.second === args.slice.sliceId,
						);
						if (newIssues.length > 0) {
							return {
								ok: false as const,
								reason: `slice "${args.slice.sliceId}" overlaps existing slice(s): ${newIssues
									.map((i) =>
										i.first === args.slice.sliceId
											? `${i.second}:${i.file}`
											: `${i.first}:${i.file}`,
									)
									.join(', ')}`,
								status: 409,
							};
						}

						const next = appendSliceToSection(
							md,
							renderNewSlice(args.slice),
						);
						await writeFileAtomic(located.docPath, next);
						return { ok: true as const };
					},
				);

				if (!result.ok) {
					return toolError(result.reason ?? 'add_slice failed');
				}
				await resync(options);
				return toolOk({
					proposalId: located.entry.id,
					sliceId: args.slice.sliceId,
				});
			},
		);
	},
});
