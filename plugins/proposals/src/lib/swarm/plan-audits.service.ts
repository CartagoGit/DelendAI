/**
 * plan-audits.service.ts — what a plan's closure reads of the audits it
 * contains: each audit's findings, from its own document, and the plan's
 * ledger (f00764).
 *
 * Read from the documents, not the index: the projection can still be
 * rebuilding when a transition asks, and an empty answer would let an
 * audit close behind the plan that settles it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import type { IProposalFrontmatter } from '../proposals/proposal-document';

/** The ids a plan's `contains.audits` names, as strings or `{ id }` entries. */
export const containedAuditIds = (
	frontmatter: IProposalFrontmatter,
): readonly string[] =>
	(frontmatter.contains?.audits ?? [])
		.map((entry) =>
			typeof entry === 'string' ? (entry as string) : (entry.id ?? ''),
		)
		.map((id) => id.trim())
		.filter((id) => id.length > 0);

/** Every proposal document under `proposalsDirAbs`, by id, with its folder. */
const documentsById = async (
	proposalsDirAbs: string,
): Promise<
	ReadonlyMap<string, { readonly path: string; readonly done: boolean }>
> => {
	const found = new Map<string, { path: string; done: boolean }>();
	const entries = await readdir(proposalsDirAbs, {
		recursive: true,
		withFileTypes: true,
	}).catch(() => []);
	for (const entry of entries) {
		const id = /^([a-z]\d{5})-.*\.md$/u.exec(entry.name)?.[1];
		if (!entry.isFile() || id === undefined) continue;
		const path = join(entry.parentPath, entry.name);
		const folder = path.slice(proposalsDirAbs.length + 1).split('/')[0];
		found.set(id, { path, done: folder === 'done' });
	}
	return found;
};

const frontmatterOf = (markdown: string): IProposalFrontmatter | undefined => {
	const block = extractYamlBlock(markdown);
	return block === null
		? undefined
		: (parseFrontmatterBlock(block) as unknown as IProposalFrontmatter);
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
			parseAuditFindings(await readFile(document.path, 'utf8')).findings,
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
			await readFile(document.path, 'utf8'),
		);
		if (
			frontmatter !== undefined &&
			containedAuditIds(frontmatter).includes(input.auditId)
		)
			plans.push(id);
	}
	return plans;
};
