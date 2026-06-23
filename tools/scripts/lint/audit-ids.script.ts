#!/usr/bin/env bun
/**
 * audit-ids.script.ts — f00050 S3.
 *
 * Hard rule (AGENTS.md §"Audits File Naming"): every audit file under
 * `docs/proposals/done/audits/` must follow the exact name structure
 *   {numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md
 * and every `numAuditoria` (`a00001`..`a99999`) must be unique across the folder.
 *
 * This script enforces the uniqueness half of the contract automatically — the
 * duplicate `a00034` collision was the S3 trigger. The naming-shape half is
 * already covered by `file-conventions.script.ts`.
 *
 * Usage:
 *   bun tools/scripts/lint/audit-ids.script.ts
 *   bun run lint:audit-ids
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const AUDITS_DIR = 'docs/proposals/done/audits';
const ID_RE = /^a(\d{4,5})-/;

interface IAuditFile {
	readonly file: string;
	readonly id: string;
}

interface ICollision {
	readonly id: string;
	readonly files: readonly string[];
}

const listAuditFiles = async (root: string): Promise<IAuditFile[]> => {
	const dir = join(root, AUDITS_DIR);
	const entries = await readdir(dir, { withFileTypes: true });
	const result: IAuditFile[] = [];
	for (const e of entries) {
		if (!e.isFile() || !e.name.endsWith('.md')) continue;
		const id = parseIdFromFilename(e.name);
		if (id === null) continue;
		result.push({ file: e.name, id });
	}
	return result;
};

/** Pure: extract the `aNNNNN` id from a canonical audit filename, or
 * return null if the filename does not match the convention. */
export const parseIdFromFilename = (filename: string): string | null => {
	const match = filename.match(ID_RE);
	if (!match || match[1] === undefined) return null;
	return `a${match[1]}`;
};

export const detectCollisions = (
	files: readonly IAuditFile[],
): ICollision[] => {
	const byId = new Map<string, string[]>();
	for (const f of files) {
		const list = byId.get(f.id);
		if (list) list.push(f.file);
		else byId.set(f.id, [f.file]);
	}
	const collisions: ICollision[] = [];
	for (const [id, list] of byId) {
		if (list.length > 1) collisions.push({ id, files: list });
	}
	collisions.sort((a, b) => a.id.localeCompare(b.id));
	return collisions;
};

export const collectAuditCollisions = async (
	root: string = REPO_ROOT,
): Promise<ICollision[]> => detectCollisions(await listAuditFiles(root));

export const main = async (): Promise<number> => {
	const collisions = await collectAuditCollisions();
	if (collisions.length === 0) {
		console.log(`✓ audit-ids: ${AUDITS_DIR}/ has no duplicate ids.`);
		return 0;
	}
	console.error(
		`✗ audit-ids: ${collisions.length} duplicate id(s) in ${AUDITS_DIR}/:`,
	);
	for (const c of collisions) {
		console.error(`  - ${c.id} appears in ${c.files.length} files:`);
		for (const f of c.files) console.error(`      • ${f}`);
	}
	console.error('  fix: rename all but one file to the next free aNNNNN id.');
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
