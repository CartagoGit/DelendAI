import { join } from 'node:path';

import {
	toolJsonBounded,
	writeFileAtomic,
	type IToolRegistration,
} from '@delendai/core/public';
import { allocateNextProposalId } from '@delendai/proposals/public';
import z from 'zod';

import { analyzeIssue, titleForIssue } from '../analysis.helper';
import { withBotNotice } from '../bot-notice.constant';
import type { ITriageToolsOptions } from '../contracts/interfaces/triage-tools.interface';
import {
	addComment,
	addLabels,
	fetchIssue,
	listOpenIssues,
} from '../github.service';
import { buildProposalDraft } from '../proposal-draft.builder';

const MAX_SLUG_LENGTH = 40;
const ISO_DATE_PREFIX_LENGTH = 10;

const slugify = (title: string): string => {
	const slug = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH);
	return slug === '' ? 'auto-triage' : slug;
};

const isoDatePrefix = (): string =>
	new Date().toISOString().slice(0, ISO_DATE_PREFIX_LENGTH);

// --- triage_list ----------------------------------------------------------

const TriageListInputSchema = z.object({}).strict();

const TriageListOutputSchema = z
	.object({
		repo: z.string(),
		open: z.array(
			z
				.object({
					number: z.number(),
					title: z.string(),
					labels: z.array(z.string()),
					updatedAt: z.string(),
				})
				.strict(),
		),
	})
	.strict();

export const buildTriageListRegistration = (
	options: ITriageToolsOptions,
): IToolRegistration => ({
	id: 'triage_list',
	tags: ['issues-triage', 'github', 'network'],
	effects: ['network'],
	summary: 'List open GitHub issues on the triage repository.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_triage_list`,
			{
				description:
					'List open GitHub issues on the configured triage repository (internal delendai issue bot).',
				inputSchema: TriageListInputSchema,
				outputSchema: TriageListOutputSchema,
			},
			async () => {
				const result = await listOpenIssues(options.repo, options.exec);
				if (!result.ok) {
					return toolJsonBounded({
						ok: false,
						error: { reason: result.reason },
					});
				}
				return toolJsonBounded(
					TriageListOutputSchema.parse({
						repo: options.repo,
						open: result.data.map((issue) => ({
							number: issue.number,
							title: issue.title,
							labels: [...issue.labels],
							updatedAt: issue.updatedAt,
						})),
					}),
				);
			},
		);
	},
});

// --- triage_run -----------------------------------------------------------

const TriageRunInputSchema = z
	.object({
		number: z.number().int().positive(),
		writeProposal: z.boolean().optional(),
		comment: z.boolean().optional(),
		addLabel: z.boolean().optional(),
	})
	.strict();

const TriageRunOutputSchema = z
	.object({
		ok: z.boolean(),
		issueNumber: z.number(),
		category: z.string(),
		severity: z.string(),
		proposalId: z.string().optional(),
		proposalWritten: z.boolean(),
		commentPosted: z.boolean(),
		commentUrl: z.string().optional(),
		labelsApplied: z.array(z.string()),
		summary: z.string(),
	})
	.strict();

export const buildTriageRunRegistration = (
	options: ITriageToolsOptions,
): IToolRegistration => ({
	id: 'triage_run',
	tags: ['issues-triage', 'github', 'network', 'write'],
	effects: ['network', 'write'],
	summary:
		'Analyse one GitHub issue, draft a fix proposal and reply on the issue as the automated bot.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_triage_run`,
			{
				description:
					'Internal issue bot: mechanically analyse a GitHub issue, draft a complete fix proposal (optionally write it under proposals/ready), and post an automated reply on the issue. Requires confirm:true.',
				inputSchema: TriageRunInputSchema,
				outputSchema: TriageRunOutputSchema,
			},
			async (args) => {
				const number = args.number;
				const fetched = await fetchIssue(
					options.repo,
					number,
					options.exec,
				);
				if (!fetched.ok) {
					return toolJsonBounded({
						ok: false,
						error: { reason: fetched.reason },
					});
				}
				const issue = fetched.data;
				const analysis = analyzeIssue(issue.title, issue.body);
				const title = titleForIssue(issue.title);

				let proposalId = 'pending';
				let proposalWritten = false;
				const _draft = buildProposalDraft({
					id: proposalId,
					issueNumber: issue.number,
					issueUrl: `https://github.com/${options.repo}/issues/${issue.number}`,
					repo: options.repo,
					title,
					body: issue.body,
					analysis,
					date: isoDatePrefix(),
				});

				if (
					args.writeProposal === true &&
					options.proposals !== undefined
				) {
					proposalId = await allocateNextProposalId('x', {
						proposalsDirAbs: options.proposals.proposalsDirAbs,
						counterPathAbs: options.proposals.counterPathAbs,
					});
					const withId = buildProposalDraft({
						id: proposalId,
						issueNumber: issue.number,
						issueUrl: `https://github.com/${options.repo}/issues/${issue.number}`,
						repo: options.repo,
						title,
						body: issue.body,
						analysis,
						date: isoDatePrefix(),
					});
					await writeFileAtomic(
						join(
							options.proposals.proposalsDirAbs,
							'ready',
							`${proposalId}-${slugify(title)}.md`,
						),
						withId,
					);
					proposalWritten = true;
				}

				let commentPosted = false;
				let commentUrl: string | undefined;
				if (args.comment !== false) {
					const commentBody = withBotNotice(
						[
							'## Triaged',
							'',
							`- Category: \`${analysis.category}\``,
							`- Severity: \`${analysis.severity}\``,
							`- Summary: ${analysis.summary}`,
							'',
							proposalWritten
								? `- Proposal: \`${proposalId}\` (written to \`proposals/ready/\`)`
								: '- Proposal: draft ready — pass it to `proposals_create_proposal` to materialise.',
							'',
							'The fix will be tracked in the linked proposal; progress',
							'will be posted here as new automated comments.',
						].join('\n'),
					);
					const posted = await addComment(
						options.repo,
						number,
						commentBody,
						options.exec,
					);
					if (posted.ok) {
						commentPosted = true;
						commentUrl = posted.data.url;
					}
				}

				const labelsApplied: string[] = [];
				if (args.addLabel === true) {
					const labelled = await addLabels(
						options.repo,
						number,
						['triaged'],
						options.exec,
					);
					if (labelled.ok) labelsApplied.push(...labelled.data);
				}

				return toolJsonBounded(
					TriageRunOutputSchema.parse({
						ok: true,
						issueNumber: issue.number,
						category: analysis.category,
						severity: analysis.severity,
						...(proposalWritten ? { proposalId } : {}),
						proposalWritten,
						commentPosted,
						...(commentUrl !== undefined ? { commentUrl } : {}),
						labelsApplied,
						summary: analysis.summary,
					}),
				);
			},
		);
	},
});

// --- triage_comment -------------------------------------------------------

const TriageCommentInputSchema = z
	.object({
		number: z.number().int().positive(),
		body: z.string().min(1),
	})
	.strict();

const TriageCommentOutputSchema = z
	.object({
		ok: z.boolean(),
		number: z.number(),
		url: z.string().optional(),
		reason: z.string().optional(),
	})
	.strict();

export const buildTriageCommentRegistration = (
	options: ITriageToolsOptions,
): IToolRegistration => ({
	id: 'triage_comment',
	tags: ['issues-triage', 'github', 'network', 'write'],
	effects: ['network', 'write'],
	summary: 'Post an automated progress comment on a triaged issue.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_triage_comment`,
			{
				description:
					'Internal issue bot: post an automated progress/update comment on a GitHub issue. The machine-disclosure notice is prepended automatically. Requires confirm:true.',
				inputSchema: TriageCommentInputSchema,
				outputSchema: TriageCommentOutputSchema,
			},
			async (args) => {
				const posted = await addComment(
					options.repo,
					args.number,
					withBotNotice(args.body),
					options.exec,
				);
				if (!posted.ok) {
					return toolJsonBounded({
						ok: false,
						number: args.number,
						reason: posted.reason,
					});
				}
				return toolJsonBounded(
					TriageCommentOutputSchema.parse({
						ok: true,
						number: posted.data.number,
						...(posted.data.url !== undefined
							? { url: posted.data.url }
							: {}),
					}),
				);
			},
		);
	},
});

/** All three triage tool registrations, in deterministic order. */
export const buildTriageToolRegistrations = (
	options: ITriageToolsOptions,
): readonly IToolRegistration[] => [
	buildTriageListRegistration(options),
	buildTriageRunRegistration(options),
	buildTriageCommentRegistration(options),
];
