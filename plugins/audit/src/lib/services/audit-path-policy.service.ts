/** Canonical filesystem policy for audit evidence. */

const AUDIT_DIR_RE =
	/^(?:.+\/)?proposals\/(?:done|in-progress|ready|review|paused|blocked|retired)\/audits(?:\/|$)/u;

export const isCanonicalAuditDir = (relativePath: string): boolean =>
	AUDIT_DIR_RE.test(relativePath.replace(/^\.\//u, ''));

export const canonicalAuditPathMessage =
	'Audit reports must be stored under <docsDir>/proposals/<status>/audits/. Use the filename emitted by audit_plan; legacy reports must be adopted into proposals before consolidation.';
