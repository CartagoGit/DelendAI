/** Canonical filesystem policy for audit evidence. */

import {
	type IContainedPath,
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
