/**
 * audit-run-probes.service.ts — read-only "probe" helpers used by
 * the `audit_run` e2e spec (and any external script that wants to
 * peek at the just-written audits + proposals dirs without
 * re-implementing the read/parse contract).
 *
 * Extracted from `audit-run.tool.ts` so the tool file stays
 * focused on its registration + handler plumbing (x00091 / s2).
 *
 * The two helpers are still re-exported from `audit-run.tool.ts`
 * (and through it from the audit plugin's public barrel) so the
 * existing e2e spec's import paths keep working unchanged.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { parseAuditFiles } from './parse-audit.service';

/**
 * Probe helper exported for the e2e spec (S4). Lists the audit
 * files currently in a directory and parses them through the same
 * pipeline the tool uses. Lets the test assert on the final state
 * of the disk without re-implementing the read/parse contract.
 */
export const probeAudits = async (
	auditDirAbs: string,
): Promise<{ auditsFound: number; paths: string[] }> => {
	let entries: readonly string[];
	try {
		entries = await readdir(auditDirAbs);
	} catch {
		return { auditsFound: 0, paths: [] };
	}
	const md = entries
		.filter((n) => n.endsWith('.md') && n !== 'README.md')
		.sort();
	const docs: { path: string; body: string }[] = [];
	for (const name of md) {
		try {
			const body = await readFile(path.join(auditDirAbs, name), 'utf8');
			docs.push({ path: name, body });
		} catch {
			/* skip — same tolerance as the consolidate tool */
		}
	}
	return {
		auditsFound: parseAuditFiles(docs).length,
		paths: md,
	};
};

/**
 * Lightweight helper exported for tests and external scripts that
 * want to peek at the just-written proposals directory. Returns the
 * proposal ids found in `*.md` filenames inside `proposalsDirAbs`.
 */
export const probeProposals = async (
	proposalsDirAbs: string,
): Promise<readonly string[]> => {
	let entries: readonly string[];
	try {
		entries = await readdir(proposalsDirAbs);
	} catch {
		return [];
	}
	const ids: string[] = [];
	for (const name of entries) {
		const m = /^([a-z])(\d{5})-/u.exec(name);
		if (m) ids.push(`${m[1]}${m[2]}`);
	}
	return ids.sort();
};