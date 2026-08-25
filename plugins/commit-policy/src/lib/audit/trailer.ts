/**
 * trailer.ts — format the audit trail that gets appended to commit
 * messages produced by `commit_policy_commit`.
 *
 * Three trailer kinds:
 *   - 'none'           → no trailer at all (commit body untouched)
 *   - 'co-authored-by' → append `Co-authored-by: <formatted-agent>`
 *                        in the canonical trailer form
 *   - 'body-metadata'  → append a fenced `[agent-meta]` block at the
 *                        end of the body with the raw host + model
 *                        (parseable by internal scripts without
 *                        breaking trailer-aware tooling)
 *
 * The function is pure over `(message, kind, format, agent)`.
 */

import type { AuditTrailerKind } from '../contracts/options';

/** Raw agent context the formatter needs. */
export interface IAuditAgent {
	readonly host: string;
	readonly model: string;
	/** Optional ISO-8601 instant the trailer is being emitted at. */
	readonly now?: string;
}

const interpolate = (template: string, agent: IAuditAgent): string =>
	template
		.replace(/\$\{host\}/g, agent.host)
		.replace(/\$\{model\}/g, agent.model)
		.replace(/\$\{date\}/g, agent.now ?? new Date().toISOString());

/**
 * Strip a trailing `Co-authored-by:` block from an existing commit
 * message — used when `_commit` runs twice for the same slice (the
 * second invocation reuses the same body but should not stack
 * trailers). Fenced-block trailers (`body-metadata`) are always
 * stripped and rewritten; we never have a duplicate.
 */
const stripTrailers = (body: string, kind: AuditTrailerKind): string => {
	const lines = body.split('\n');
	if (kind === 'co-authored-by') {
		// git trailer convention: trailers come after a blank line at
		// the end of the message. We strip ALL trailing `Key: value`
		// lines that look like co-authored-by / agent-metadata so we
		// never accumulate duplicates when a slice re-closes.
		let end = lines.length;
		while (end > 0) {
			const last = lines[end - 1];
			if (last === undefined) break;
			if (
				/^[A-Za-z][\w-]*:\s/.test(last) ||
				last.trim() === '' ||
				last.startsWith('# ')
			) {
				end -= 1;
				continue;
			}
			break;
		}
		return lines.slice(0, end).join('\n').trimEnd();
	}
	if (kind === 'body-metadata') {
		// Strip a trailing ``` block (fenced) if present.
		let end = lines.length;
		while (end > 0) {
			const last = lines[end - 1];
			if (last === undefined) break;
			if (
				last.trim() === '' ||
				last.startsWith('```') ||
				last.startsWith('# ')
			) {
				end -= 1;
				continue;
			}
			break;
		}
		return lines.slice(0, end).join('\n').trimEnd();
	}
	return body.trimEnd();
};

/**
 * Append the configured trailer to `originalMessage`. Returns the
 * original string when `kind === 'none'` (or when no agent info is
 * available — the trailer would be empty otherwise).
 */
export const appendAuditTrailer = (
	originalMessage: string,
	kind: AuditTrailerKind,
	format: string,
	agent: IAuditAgent | null,
): string => {
	if (kind === 'none') return originalMessage;
	if (agent === null) return originalMessage;
	const clean = stripTrailers(originalMessage, kind);
	if (kind === 'co-authored-by') {
		const formatted = interpolate(format, agent);
		// trailer convention requires a blank line between body and
		// the trailer block.
		return `${clean}\n\nCo-authored-by: ${formatted}\n`;
	}
	// body-metadata: fenced block, parseable by external tooling.
	const formatted = interpolate(format, agent);
	const stamp = interpolate('${date}', agent);
	return `${clean}\n\n<!-- agent-metadata:begin -->\n\`\`\`json\n{ "host": "${agent.host}", "model": "${agent.model}", "format": "${formatted}", "stamp": "${stamp}" }\n\`\`\`\n<!-- agent-metadata:end -->\n`;
};
