// effect-boundary-authorized: lists audit reports under a contained directory
/** Canonical filesystem policy for audit evidence. */

import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
	type IContainedPath,
	resolveExistingWorkspaceContained,
	resolveWorkspaceContainedEffective,
} from '@delendai/core/public';

const DEFAULT_PROPOSALS_DIR = 'docs/delendai/proposals/ready';

const AUDIT_DIR_RE =
	/^(?:.+\/)?proposals\/(?:done|in-progress|ready|review|paused|blocked|retired)\/audits(?:\/|$)/u;

export const isCanonicalAuditDir = (relativePath: string): boolean =>
	AUDIT_DIR_RE.test(relativePath.replace(/^\.\//u, ''));

export const canonicalAuditPathMessage =
	'Audit reports must be stored under <docsDir>/proposals/<status>/audits/. Use the filename emitted by audit_plan; legacy reports must be adopted into proposals before consolidation.';

/**
 * Where auto-scaffolded proposals are written, contained physically: a
 * `..` or absolute path, or a symlink out of the workspace, is refused
 * before anything is written.
 */
export const resolveProposalsDir = (
	workspaceRoot: string,
	requested: string | undefined,
): Promise<IContainedPath> =>
	resolveWorkspaceContainedEffective(
		workspaceRoot,
		requested ?? DEFAULT_PROPOSALS_DIR,
	);

/** An audit dir that is canonical and physically inside the workspace, or why not. */
export const resolveAuditDir = async (
	workspaceRoot: string,
	requested: string,
): Promise<
	| { readonly ok: true; readonly abs: string; readonly rel: string }
	| { readonly ok: false; readonly error: string; readonly hint: string }
> => {
	const rel = requested.replace(/^\.\//u, '');
	if (!isCanonicalAuditDir(rel)) {
		return {
			ok: false,
			error: `audit dir "${rel}" is not allowed: not canonical`,
			hint: canonicalAuditPathMessage,
		};
	}
	// Physical: a symlinked audit dir would read another tree.
	const contained = await resolveExistingWorkspaceContained(
		workspaceRoot,
		rel,
	);
	return contained.ok
		? { ok: true, abs: contained.abs, rel }
		: {
				ok: false,
				error: `audit dir "${rel}" is not allowed`,
				hint:
					contained.reason ??
					'Path must stay inside the workspace root.',
			};
};

/** Every report (`*.md`, README excluded) under `root`, relative and sorted. */
export const collectMarkdownFiles = async (
	root: string,
	relative = '',
): Promise<readonly string[]> => {
	const entries = await readdir(path.join(root, relative), {
		withFileTypes: true,
	});
	const files: string[] = [];
	for (const entry of entries) {
		const child =
			relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(root, child)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith('.md') &&
			entry.name !== 'README.md'
		) {
			files.push(child);
		}
	}
	return files.sort();
};
