/**
 * registry-entry.helper.ts — how a proposal's parsed frontmatter becomes
 * its registry entry.
 *
 * Pure, so the entry is the same whether the frontmatter comes from a
 * scan of the markdown (`sync-proposal-registry.ts`) or from the
 * database that projected it (the registry exported from the
 * database); there is one definition of the defaults (`unspecified`,
 * `unknown`, the kind an id prefix names) and of the extras.
 */
import { sep } from 'node:path';

import { normalizeProposalKind } from '@delendai/proposals-sqlite';

import { PROPOSAL_KIND_BY_PREFIX } from '../contracts/constants/proposal-glossary.constant';
import type {
	IProposalEntry,
	IProposalExtras,
	IRegistryEntryOutcome,
	IRegistryProposalStatus,
} from '../contracts/interfaces/registry-entry.interface';
import type {
	IAcceptanceCriterion,
	IProposalBudget,
} from './proposal-document';
import type { IContinuityPolicy, ISwarmBudget } from '../swarm/swarm-types';
import {
	isProposalContinuityPolicy,
	isProposalSwarmBudget,
} from './proposal-policy-guards';

const VALID_STATUSES: ReadonlySet<IRegistryProposalStatus> = new Set([
	'pending',
	'in_progress',
	'ready',
	'blocked',
	'done',
	'retired',
	'paused',
	'deferred',
	'in-progress',
	'review',
]);

export const isProposalStatus = (
	s: string | undefined,
): s is IRegistryProposalStatus =>
	s !== undefined && VALID_STATUSES.has(s as IRegistryProposalStatus);

/** A proposal's id when its frontmatter names none: its file name. */
export const buildId = (filename: string): string =>
	filename.replace(/\.md$/, '');

const extractExtras = (
	parsed: Record<string, unknown>,
): IProposalExtras | undefined => {
	const rawBudget = parsed.budget;
	const budget =
		rawBudget !== null &&
		typeof rawBudget === 'object' &&
		!Array.isArray(rawBudget)
			? (rawBudget as IProposalBudget)
			: undefined;
	const rawAC = parsed.acceptanceCriteria;
	const acceptanceCriteria = Array.isArray(rawAC)
		? (rawAC as IAcceptanceCriterion[])
		: undefined;
	const rawOwnership = parsed.ownership;
	const ownership = Array.isArray(rawOwnership)
		? rawOwnership.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawReserved = parsed.reservedFiles;
	const reservedFiles = Array.isArray(rawReserved)
		? rawReserved.filter((v): v is string => typeof v === 'string')
		: undefined;
	const rawAgentClosureReportPath = parsed.agentClosureReportPath;
	const agentClosureReportPath =
		typeof rawAgentClosureReportPath === 'string'
			? rawAgentClosureReportPath
			: undefined;
	const rawSwarmBudget = parsed.swarmBudget;
	const swarmBudget = isProposalSwarmBudget(rawSwarmBudget)
		? (rawSwarmBudget as ISwarmBudget)
		: undefined;
	const rawContinuityPolicy = parsed.continuityPolicy;
	const continuityPolicy = isProposalContinuityPolicy(rawContinuityPolicy)
		? (rawContinuityPolicy as IContinuityPolicy)
		: undefined;
	const rawTaskQueue = parsed.taskQueue;
	const taskQueue = rawTaskQueue === true;
	if (
		!budget &&
		!acceptanceCriteria &&
		!ownership &&
		!reservedFiles &&
		!agentClosureReportPath &&
		!swarmBudget &&
		!continuityPolicy &&
		!taskQueue
	) {
		return undefined;
	}
	return {
		...(budget ? { budget } : {}),
		...(acceptanceCriteria ? { acceptanceCriteria } : {}),
		...(ownership ? { ownership } : {}),
		...(reservedFiles ? { reservedFiles } : {}),
		...(agentClosureReportPath ? { agentClosureReportPath } : {}),
		...(swarmBudget ? { swarmBudget } : {}),
		...(continuityPolicy ? { continuityPolicy } : {}),
		...(taskQueue ? { taskQueue } : {}),
	};
};

/**
 * The registry entry of one proposal file. `name` is its file name,
 * `relPath` its path relative to the proposals directory.
 */
export const registryEntryFrom = (input: {
	readonly name: string;
	readonly relPath: string;
	readonly parsed: Readonly<Record<string, unknown>>;
}): IRegistryEntryOutcome => {
	const { name, relPath, parsed } = input;
	if (typeof parsed.status !== 'string') {
		return {
			ok: false,
			reason: 'invalid_frontmatter_shape',
			detail: `${name}: missing string 'status' frontmatter key`,
		};
	}
	if (!isProposalStatus(parsed.status)) {
		return {
			ok: false,
			reason: 'invalid_status',
			detail: `${name}: invalid 'status' frontmatter value '${parsed.status}'`,
		};
	}
	const extras = extractExtras(parsed);
	// A proposal under `legacy/closed/` is archived: a location marker,
	// not a workflow status.
	const isArchived = relPath.startsWith(`legacy${sep}closed${sep}`);
	const entry: IProposalEntry = {
		id: typeof parsed.id === 'string' ? parsed.id : buildId(name),
		// proposalsDir-relative, so `join(proposalsDir, file)` stays right
		// wherever the index itself is stored.
		file: relPath,
		track: typeof parsed.track === 'string' ? parsed.track : 'unspecified',
		type: typeof parsed.type === 'string' ? parsed.type : 'unspecified',
		kind:
			normalizeProposalKind(
				typeof parsed.kind === 'string' ? parsed.kind : undefined,
			) ??
			PROPOSAL_KIND_BY_PREFIX[name[0] ?? ''] ??
			'unspecified',
		status: parsed.status,
		date: typeof parsed.date === 'string' ? parsed.date : 'unknown',
		...(extras ? { extras } : {}),
		...(isArchived ? { archived: true } : {}),
	};
	return { ok: true, entry };
};

/**
 * An entry as the registry file lists it: the fields in a fixed order,
 * the extras flattened into the entry, `archived` only when true. The
 * semantic hash is taken over this shape, so it is the one serialisation.
 */
export const toIndexEntry = (entry: IProposalEntry) => ({
	id: entry.id,
	file: entry.file,
	track: entry.track,
	type: entry.type,
	kind: entry.kind,
	status: entry.status,
	date: entry.date,
	...(entry.extras !== undefined
		? Object.fromEntries(
				Object.entries(entry.extras as Record<string, unknown>),
			)
		: {}),
	...(entry.archived === true ? { archived: true } : {}),
});
