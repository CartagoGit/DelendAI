import { relative } from 'node:path';
import { toolError } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	type IProposalKind,
	type IProposalStatus,
} from '../../contracts/constants/proposal-glossary.constant';
import {
	proposalFolderFor,
	type IProposalFolderPolicy,
} from '../../contracts/proposal-folder-policy';
import type { ILocatedProposal } from '../../proposals/locate';
import { readFrontmatterField } from '../../proposals/proposal-frontmatter-writer';
import {
	invalidTransitionOutcome,
	lifecycleEntity,
} from '../../services/lifecycle-outcome';
import type { IProposalTransitionArgs } from '../../contracts/proposal-transition-input.contract';
import type { IProposalTransitionSourceStatus } from '../../contracts/interfaces/proposal-transition-tool.interface';
import { KNOWN_KINDS } from '../../contracts/constants/proposal-transition-schema.constant';

export const isKnownStatus = (value: string): value is IProposalStatus =>
	value in PROPOSAL_STATUSES;

const isKnownKind = (value: string): value is IProposalKind =>
	KNOWN_KINDS.has(value);

const isPendingAliasEligible = (input: {
	readonly proposalId: string;
	readonly absPath: string;
}): boolean => {
	const filename = input.absPath.split('/').pop() ?? '';
	const prefix = (filename[0] ?? input.proposalId[0] ?? '').toLowerCase();
	return prefix !== 'p' && prefix in PROPOSAL_KIND_BY_PREFIX;
};

/**
 * Resolve the folder a transition should land in.
 *
 * For terminal `done`, the convention (f00042 + f00016 §4.1) is
 * `done/<kind-subfolder>/` — `done/feats/`, `done/fixes/`, … — so the
 * closure view scales. For every other status the folder is the plain
 * status folder. The kind is read from the file's frontmatter on disk
 * (not from the index snapshot) because the index entry may predate a
 * kind field added later, and the on-disk source of truth is the file
 * itself. A missing or unknown kind falls back to `done/` itself — same
 * safe behaviour the engine had before f00042 landed.
 *
 * Pure I/O: reads the file once, no other side effects.
 */
export const resolveTargetFolder = async (
	to: IProposalStatus,
	found: ILocatedProposal,
	proposalsDirAbs: string,
	folderPolicy?: IProposalFolderPolicy,
): Promise<string> => {
	const raw = await new SafeWorkspaceReader(proposalsDirAbs)
		.readText(relative(proposalsDirAbs, found.absPath))
		.then((value) => value.content)
		.catch(() => '');
	const kindRaw =
		readFrontmatterField(raw, 'kind') ?? readFrontmatterField(raw, 'type');
	const kind =
		kindRaw !== undefined && isKnownKind(kindRaw) ? kindRaw : undefined;
	const folder = proposalFolderFor(to, kind, folderPolicy);
	void proposalsDirAbs;
	return folder;
};

// ---------------------------------------------------------------------------
// Step 1 — Validate args (cheap, no I/O).
// ---------------------------------------------------------------------------

export const validateTransitionArgs = (
	args: IProposalTransitionArgs,
): ReturnType<typeof toolError> | null => {
	if (args.reason === '') {
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
	return null;
};

// ---------------------------------------------------------------------------
// Step 2 — Reject legacy / off-state-machine proposals.
// Returns the narrowed status on success, or a toolError on failure.
// ---------------------------------------------------------------------------

export const validateCurrentStatus = (
	id: string,
	found: ILocatedProposal,
): IProposalTransitionSourceStatus | ReturnType<typeof toolError> => {
	if (isKnownStatus(found.status)) return found.status;
	if (
		found.status === 'pending' &&
		isPendingAliasEligible({ proposalId: id, absPath: found.absPath })
	) {
		return 'pending';
	}
	return toolError(
		`"${id}" has current status "${found.status}", which is not on the new state machine yet`,
		'This proposal predates f00016 (legacy 8-status union) — it is migrated by S11/S12, not transitioned by this tool.',
	);
};

// ---------------------------------------------------------------------------
// Step 3 — Validate the DFA edge (status → status transition allowed?).
// ---------------------------------------------------------------------------

export const validateTransition = (
	id: string,
	from: IProposalStatus,
	to: IProposalStatus,
): ReturnType<typeof toolError> | null => {
	const legalTargets = PROPOSAL_STATUS_TRANSITIONS[from];
	if (legalTargets.has(to)) return null;
	const nextHops = [...legalTargets].sort();
	const lifecycle = invalidTransitionOutcome({
		entity: lifecycleEntity({
			id,
			entity: 'proposal',
			status: from,
		}),
		reason: `illegal transition: "${from}" → "${to}"`,
		currentStatus: from,
		nextHops,
	});
	const nextAction =
		nextHops.length > 0
			? `From "${from}", the only legal targets are: ${nextHops.join(', ')}.`
			: `"${from}" is terminal — no transitions out.`;
	// Surface nextHops as a machine-readable field so agents do
	// not have to re-parse the prose. toolError only takes reason/nextAction,
	// so we build the envelope manually (same shape + structuredContent).
	const envelope = {
		ok: false as const,
		...lifecycle,
		error: {
			reason: lifecycle.reason,
			nextAction,
			nextHops,
		},
	};
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		isError: true,
	};
};
