/**
 * trailer.ts — format the audit trail that gets appended to commit
 * messages produced by `commit_policy_commit`.
 *
 * Three trailer kinds:
 *   - 'none'           → no trailer at all (commit body untouched)  ← default
 *   - 'co-authored-by' → append `Co-authored-by: <formatted-agent>`
 *                        in the canonical trailer form
 *   - 'body-metadata'  → append a fenced `[agent-meta]` block at the
 *                        end of the body with the raw host + model
 *                        (parseable by internal scripts without
 *                        breaking trailer-aware tooling)
 *
 * Default behaviour: `none` (post-f00500). The previous default
 * `co-authored-by` leaked the agent's `host` and `model` (e.g.
 * `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`) onto every
 * commit the engine produced, which GitHub surfaces on the commit
 * page and — when the email resolves — adds the brand to the contributor
 * graph. The default now keeps LLM attribution off GitHub by default;
 * hosts that want the trailer back (e.g. for human-human Co-authored-by)
 * set `audit.trailer` explicitly in `delendai.config.json`.
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

/** The two markers that fence an agent-metadata block, written once. */
const BLOCK_BEGIN = '<!-- agent-metadata:begin -->';
const BLOCK_END = '<!-- agent-metadata:end -->';

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
		// Strip ALL previous agent-metadata blocks (begin→end).
		//
		// Scanned rather than matched: the pattern this replaced put a
		// `\n*` on both sides of a lazy `[\s\S]*?`, and each of those
		// restarts at every position of a run of newlines — polynomial in
		// the length of a commit message somebody else wrote
		// (`js/polynomial-redos`). `indexOf` finds the same two markers
		// once each.
		let result = '';
		let cursor = 0;
		for (;;) {
			const begin = body.indexOf(BLOCK_BEGIN, cursor);
			if (begin === -1) break;
			const end = body.indexOf(BLOCK_END, begin + BLOCK_BEGIN.length);
			if (end === -1) break;
			// The newlines hugging the block go with it, the way the
			// pattern's `\n*` did.
			let head = begin;
			while (head > cursor && body[head - 1] === '\n') head -= 1;
			let tail = end + BLOCK_END.length;
			while (tail < body.length && body[tail] === '\n') tail += 1;
			result += body.slice(cursor, head);
			cursor = tail;
		}
		result += body.slice(cursor);
		return result.trimEnd();
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
