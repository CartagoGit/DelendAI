// effect-boundary-authorized: lists the proposals tree under a contained root
/**
 * The audit evidence contract, inventory and consensus: pure checks over the parsed
 * reports, plus the proposal inventory read from the proposals tree.
 */
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import {
	ACTIVE_PROPOSAL_STATUS_DIRS,
	AUDIT_EVIDENCE_FIELDS,
	AUDIT_STATE_WORDS,
	PROPOSAL_HEAD_BYTES,
} from '../contracts/constants/audit-protocol.constant';
import type {
	IAuditDocument,
	IConsolidation,
} from '../contracts/interfaces/audit.interface';
import type {
	IFindingConsensus,
	IFindingContractReport,
	IInventoryRow,
	IInventoryState,
	IProposalInventoryRow,
} from '../contracts/interfaces/audit-protocol.interface';

const escapeRe = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const stripAccents = (text: string): string =>
	text.normalize('NFD').replace(/\p{M}/gu, '');

const hasLabel = (text: string, labels: readonly string[]): boolean => {
	const plain = stripAccents(text);
	return labels.some((l) =>
		new RegExp(`(?:^|[\\s*_>-])${escapeRe(l)}\\s*\\**\\s*:`, 'iu').test(
			plain,
		),
	);
};

/** Findings that miss required evidence fields (G76, G74). Complete ones are not listed. */
export const checkEvidenceContract = (
	documents: readonly IAuditDocument[],
): IFindingContractReport[] =>
	documents.flatMap((d) =>
		d.findings.flatMap((f) => {
			const text = `${f.title}\n${f.detail}`;
			const missing = AUDIT_EVIDENCE_FIELDS.filter(
				(field) => !hasLabel(text, field.labels),
			).map((field) => field.key);
			return missing.length === 0
				? []
				: [{ source: d.path, findingId: f.id, missing }];
		}),
	);

const stateOf = (detail: string): IInventoryState => {
	const m = /(?:Estado|State|Status)\s*\**\s*:\s*([^\n]*)/iu.exec(detail);
	const value = m?.[1] ?? '';
	return AUDIT_STATE_WORDS.find((w) => w.re.test(value))?.state ?? 'open';
};

/** One row per reported finding with its normalised state (G77). */
export const buildInventory = (
	documents: readonly IAuditDocument[],
): IInventoryRow[] =>
	documents.flatMap((d) =>
		d.findings.map((f) => ({
			findingId: f.id,
			source: d.path,
			state: stateOf(f.detail),
		})),
	);

export const renderInventoryMarkdown = (
	rows: readonly IInventoryRow[],
	proposals: readonly IProposalInventoryRow[],
): string =>
	[
		'## Finding inventory',
		'| finding | source | state |',
		'|---|---|---|',
		...rows.map((r) => `| ${r.findingId} | ${r.source} | ${r.state} |`),
		'',
		'## Active proposals',
		'| id | status | title |',
		'|---|---|---|',
		...proposals.map((p) => `| ${p.id} | ${p.status} | ${p.title} |`),
	].join('\n');

const frontmatterValue = (body: string, key: string): string | undefined =>
	new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'mu').exec(body)?.[1]?.trim();

const walkMarkdown = async (dir: string): Promise<string[]> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const out: string[] = [];
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...(await walkMarkdown(p)));
		else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
			out.push(p);
	}
	return out;
};

/** The inventory of active proposals (G150), read from the front matter of each file. */
export const buildProposalInventory = async (
	proposalsRoot: string,
): Promise<IProposalInventoryRow[]> => {
	const reader = new SafeWorkspaceReader(proposalsRoot);
	const rows: IProposalInventoryRow[] = [];
	for (const status of ACTIVE_PROPOSAL_STATUS_DIRS) {
		for (const file of await walkMarkdown(
			path.join(proposalsRoot, status),
		)) {
			const head = (
				await reader.readText(path.relative(proposalsRoot, file))
			).content.slice(0, PROPOSAL_HEAD_BYTES);
			const id = frontmatterValue(head, 'id');
			if (id === undefined) continue;
			rows.push({
				id,
				status,
				title: frontmatterValue(head, 'title') ?? '',
			});
		}
	}
	return rows.sort((a, b) => a.id.localeCompare(b.id));
};

/** Per finding, the share of reviewers that reported it against the threshold (G78). */
export const computeConsensus = (
	consolidation: IConsolidation,
	reviewers: number,
	threshold: number,
): IFindingConsensus[] =>
	consolidation.findings.map((f) => {
		const ratio = reviewers === 0 ? 0 : f.seenBy.length / reviewers;
		return {
			id: f.id,
			seenBy: [...f.seenBy],
			reviewers,
			ratio,
			threshold,
			consensus: ratio > threshold,
		};
	});
