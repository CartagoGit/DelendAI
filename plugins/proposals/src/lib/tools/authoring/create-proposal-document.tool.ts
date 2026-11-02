import type z from 'zod';
import { join } from 'node:path';
import { redactSecrets } from '@delendai/core/public';
import { writeFileAtomic } from '@delendai/core/runtime';
import { syncProposalRegistry } from '../../proposals/sync-proposal-registry';
import {
	allocateNextProposalId,
	prefixForKind,
} from '../../proposals/proposal-id-allocator';
import {
	PROPOSAL_KIND_BY_PREFIX,
	type IProposalKind,
} from '../../contracts/constants/proposal-glossary.constant';
import { proposalFolderFor } from '../../contracts/proposal-folder-policy';
import {
	kindMatchesId,
	newProposalIdSchema,
} from '../../contracts/schemas/proposal-kind.schema';
import { findExistingProposal } from '../../proposals/existing-proposal';
import { slugFromTitle } from '../../shared/string-helpers';
import { planDisjointnessIssues } from '../../swarm/proposal-slice-plan';
import type { IAuthoringToolOptions } from '../authoring-options';
import type { SLICE_IN } from '../../contracts/constants/create-proposal-schema.constant';
import { canonicalSliceId, canonicalStatus } from './slice-block.tool';
import type {
	IFrontmatterPrimitive,
	ICreateProposalRequest,
	ICreateProposalWriteResult,
	ICreateProposalWriteError,
} from '../../contracts/interfaces/authoring-tool.interface';

const ISO_DATE_LENGTH = 10;

const renderSlice = (s: z.infer<typeof SLICE_IN>): string => {
	const lines = [
		`### ${canonicalSliceId(s.sliceId)} — ${s.title ?? s.sliceId}`,
	];
	lines.push('- **Status**: pending');
	if (s.dependsOn && s.dependsOn.length > 0) {
		lines.push(
			`- **DependsOn**: [${s.dependsOn.map(canonicalSliceId).join(', ')}]`,
		);
	}
	lines.push(`- **Files**: ${s.files.map((f) => `\`${f}\``).join(', ')}`);
	lines.push(`- **Gate**: ${s.gate ?? 'none'}`);
	if (s.acceptance && s.acceptance.length > 0) {
		lines.push('- acceptance:');
		for (const a of s.acceptance) lines.push(`  - "${a}"`);
	}
	return lines.join('\n');
};

const serializeFrontmatterValue = (value: IFrontmatterPrimitive): string =>
	typeof value === 'string' ? JSON.stringify(value) : String(value);

const renderExtraFrontmatter = (
	frontmatter: Readonly<Record<string, IFrontmatterPrimitive>> | undefined,
): string[] =>
	Object.entries(frontmatter ?? {})
		.filter(([, value]) => value !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`);

export const createProposalDocument = async (
	args: ICreateProposalRequest,
	options: Pick<
		IAuthoringToolOptions,
		| 'workspaceRoot'
		| 'proposalsDirAbs'
		| 'counterPathAbs'
		| 'layout'
		| 'extraFolders'
		| 'folderPolicy'
	>,
): Promise<ICreateProposalWriteResult | ICreateProposalWriteError> => {
	let id: string;
	if (args.id !== undefined) {
		id = args.id;
		const idResult = newProposalIdSchema.safeParse(id);
		if (!idResult.success) {
			return {
				ok: false,
				reason: `invalid proposal id "${id}" — ${idResult.error.issues[0]?.message ?? 'malformed'}`,
				nextAction:
					'Use one lowercase family prefix followed by exactly five digits (for example f00001), or omit id and pass kind for race-safe allocation.',
			};
		}
		if (args.kind !== undefined) {
			const match = kindMatchesId(args.kind, id);
			if (!match.ok) {
				return {
					ok: false,
					reason: match.reason,
					nextAction:
						'Ensure the ID prefix matches the specified kind.',
				};
			}
		}
	} else if (args.kind !== undefined) {
		const prefix = prefixForKind(args.kind);
		if (prefix === null) {
			return {
				ok: false,
				reason: `unknown kind "${args.kind}"`,
				nextAction: 'Pass a recognised kind, or pass id explicitly.',
			};
		}
		// A repeated create (the first call's answer was lost to a timeout)
		// finds its own earlier write instead of minting a second id.
		const earlier = await findExistingProposal({
			proposalsDirAbs: options.proposalsDirAbs,
			prefix,
			slug: slugFromTitle(args.title, ''),
			title: args.title,
			status: canonicalStatus(args.status),
		});
		if (earlier !== undefined) {
			const sync = await syncProposalRegistry(
				options.workspaceRoot,
				options.layout,
				options.extraFolders ?? [],
				undefined,
				options.folderPolicy,
			);
			return {
				ok: true,
				id: earlier.id,
				file: earlier.file,
				path: join(options.proposalsDirAbs, ...earlier.file.split('/')),
				disjointnessIssues: [],
				indexCount: sync.count,
				redactedSecrets: 0,
				reused: true,
			};
		}
		id = await allocateNextProposalId(prefix, {
			proposalsDirAbs: options.proposalsDirAbs,
			counterPathAbs: options.counterPathAbs,
		});
	} else {
		return {
			ok: false,
			reason: 'either id or kind is required',
			nextAction:
				'Pass an explicit id, or pass kind to auto-allocate the next one (f00016 S13).',
		};
	}
	const slices = [...(args.slices ?? [])];
	const plan = {
		proposalId: id,
		globalGate: (args.globalGate ?? 'none') as
			| 'lint'
			| 'type'
			| 'e2e'
			| 'none',
		slices: slices.map((s) => ({
			proposalId: id,
			sliceId: s.sliceId,
			title: s.title ?? s.sliceId,
			owner: null,
			files: s.files,
			dependsOn: s.dependsOn ?? [],
			gate: (s.gate ?? 'none') as 'lint' | 'type' | 'e2e' | 'none',
			status: 'pending' as const,
			acceptanceCriteria: s.acceptance ?? [],
		})),
	};
	const issues = planDisjointnessIssues(plan);
	if (issues.length > 0) {
		return {
			ok: false,
			reason: `slices share files: ${issues.map((i) => `${i.first}/${i.second}:${i.file}`).join(', ')}`,
			nextAction: 'Make each slice edit a disjoint set of files.',
		};
	}
	const inferredKind: IProposalKind =
		args.kind !== undefined && prefixForKind(args.kind) !== null
			? (args.kind as IProposalKind)
			: (PROPOSAL_KIND_BY_PREFIX[id[0] ?? ''] ?? 'feat');
	const date = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
	const status = canonicalStatus(args.status);
	const acceptanceLines = slices.flatMap((s) =>
		(s.acceptance ?? []).map((acceptance) => `- ${acceptance}`),
	);
	const body = [
		'---',
		`id: ${id}`,
		`title: ${JSON.stringify(args.title)}`,
		`kind: ${inferredKind}`,
		`status: ${status}`,
		'type: proposal',
		`track: ${args.track ?? 'general'}`,
		`date: ${date}`,
		...renderExtraFrontmatter(args.extraFrontmatter),
		'---',
		'',
		`# ${id} — ${args.title}`,
		'',
		'## goal',
		'',
		args.goal ?? 'TODO: describe the goal.',
		'',
		'## why',
		'',
		args.why ?? 'TODO: why this work matters now.',
		'',
		'## non-goals',
		'',
		...(args.nonGoals && args.nonGoals.length > 0
			? args.nonGoals.map((goal) => `- ${goal}`)
			: ['- TODO: what this proposal deliberately skips.']),
		'',
		'## slices',
		'',
		`- global_gate: ${args.globalGate ?? 'none'}`,
		'',
		...(slices.length > 0
			? slices.map(renderSlice).join('\n\n').split('\n')
			: [
					'### S1 — TODO',
					'- **Status**: pending',
					'- **Files**: `TODO`',
					'- **Gate**: none',
				]),
		'',
		'## acceptance',
		'',
		...(acceptanceLines.length > 0
			? acceptanceLines
			: ['- TODO: observable acceptance criteria.']),
		'',
	].join('\n');
	const fileRel = `${proposalFolderFor(status, inferredKind, options.folderPolicy)}/${id}-${slugFromTitle(args.title, id)}.md`;
	const absPath = join(options.proposalsDirAbs, ...fileRel.split('/'));
	// Refuse to write a non-canonical
	// filename. Pre-fix, an exotic title that survived kebab() could
	// produce a filename that sync_proposals silently dropped. We
	// validate against the same regex filename-linter uses
	// (`^([a-z])(\d{5,})-[a-z0-9-]+\.md$`) and return ok:false if
	// anything is off, so the tool handler reports a `toolError(reason)`
	// instead of leaving an orphan on disk.
	const fileName = fileRel.split('/').pop() ?? '';
	if (!/^([a-z])(\d{5,})-[a-z0-9-]+\.md$/.test(fileName)) {
		return {
			ok: false,
			reason: `computed filename "${fileName}" does not match the canonical pattern \`<prefix><NNNNN>-<kebab-slug>.md\` — slug derived from "${args.title}" sanitised to a malformed string`,
			nextAction:
				'Pass a title whose kebab-case is non-empty (e.g. avoid punctuation-only / non-Latin titles) so the slug + id produce a canonical filename.',
		};
	}
	const { text: safeBody, redactions } = redactSecrets(body);
	await writeFileAtomic(absPath, safeBody);
	const sync = await syncProposalRegistry(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? [],
		undefined,
		options.folderPolicy,
	);
	const syncEntry = sync.proposals.find((proposal) => proposal.id === id);
	const finalFileRel = syncEntry ? syncEntry.file : fileRel;
	const finalAbsPath = syncEntry
		? join(options.proposalsDirAbs, ...finalFileRel.split('/'))
		: absPath;
	return {
		ok: true,
		id,
		file: finalFileRel,
		path: finalAbsPath,
		disjointnessIssues: issues,
		indexCount: sync.count,
		redactedSecrets: redactions,
	};
};
