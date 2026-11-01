/**
 * plan-audits.service.ts — what a plan's closure reads of the audits it
 * contains: each audit's findings, from its own document, and the plan's
 * ledger (f00764).
 *
 * Read from the documents, not the index: the projection can still be
 * rebuilding when a transition asks, and an empty answer would let an
 * audit close behind the plan that settles it.
 */
import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type {
	IAuditFinding,
	IPlanAudits,
} from '../contracts/interfaces/audit-findings.interface';
import {
	parseAuditFindings,
	parseAuditLedger,
} from '../proposals/audit-findings';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import { planBlocks } from '../proposals/plan-blocks';
import type { IProposalFrontmatter } from '../proposals/proposal-document';

/** A proposal document's text, read through the workspace reader. */
export const readDocumentText = async (absPath: string): Promise<string> =>
	(
		await new SafeWorkspaceReader(dirname(absPath)).readText(
			basename(absPath),
		)
	).content;

/** The ids a plan's `contains.audits` names. */
export const containedAuditIds = (
	frontmatter: Pick<IProposalFrontmatter, 'contains'>,
): readonly string[] =>
	(frontmatter.contains?.audits ?? [])
		.map((entry) => entry.id.trim())
		.filter((id) => id.length > 0);

/** Every proposal document under `proposalsDirAbs`, by id, with its folder. */
const documentsById = async (
	proposalsDirAbs: string,
): Promise<
	ReadonlyMap<string, { readonly path: string; readonly done: boolean }>
> => {
	const found = new Map<string, { path: string; done: boolean }>();
	// status/kind/file is three levels down; one more leaves room.
	const listed = await new SafeWorkspaceReader(proposalsDirAbs)
		.list('.', { recursive: true, maxDepth: 4 })
		.catch(() => undefined);
	for (const entry of listed?.entries ?? []) {
		const { absolutePath, relativePath } = entry.path;
		const id = /^([a-z]\d{5})-.*\.md$/u.exec(basename(relativePath))?.[1];
		if (!entry.stats.isFile() || id === undefined) continue;
		const folder = relativePath.split(/[\\/]/u)[0];
		found.set(id, { path: absolutePath, done: folder === 'done' });
	}
	return found;
};

const frontmatterOf = (
	markdown: string,
): Pick<IProposalFrontmatter, 'contains'> | undefined => {
	const block = extractYamlBlock(markdown);
	return block === null
		? undefined
		: planBlocks(parseFrontmatterBlock(block));
};

/**
 * The audits `frontmatter` contains, with their findings and the ledger
 * `planMarkdown` keeps; `undefined` for a plan that contains no audit.
 * An audit with no document contributes no finding: the ledger lint
 * reports every row naming it.
 */
export const readPlanAudits = async (input: {
	readonly frontmatter: IProposalFrontmatter;
	readonly planMarkdown: string;
	readonly proposalsDirAbs: string;
}): Promise<IPlanAudits | undefined> => {
	const ids = containedAuditIds(input.frontmatter);
	if (ids.length === 0) return undefined;
	const documents = await documentsById(input.proposalsDirAbs);
	const findingsByAudit = new Map<string, readonly IAuditFinding[]>();
	for (const id of ids) {
		const document = documents.get(id);
		if (document === undefined) continue;
		findingsByAudit.set(
			id,
			parseAuditFindings(await readDocumentText(document.path)).findings,
		);
	}
	return { findingsByAudit, ledger: parseAuditLedger(input.planMarkdown) };
};

/**
 * The open plans whose `contains.audits` names `auditId`. An audit a plan
 * settles closes with that plan; closing it on its own would leave the
 * plan's ledger pointing at findings nobody tracks any more.
 */
export const openPlansContaining = async (input: {
	readonly auditId: string;
	readonly proposalsDirAbs: string;
}): Promise<readonly string[]> => {
	const plans: string[] = [];
	for (const [id, document] of await documentsById(input.proposalsDirAbs)) {
		if (!id.startsWith('q') || document.done) continue;
		const frontmatter = frontmatterOf(
			await readDocumentText(document.path),
		);
		if (
			frontmatter !== undefined &&
			containedAuditIds(frontmatter).includes(input.auditId)
		)
			plans.push(id);
	}
	return plans;
};
