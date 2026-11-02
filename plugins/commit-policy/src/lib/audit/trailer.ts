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

const TRAILER_LINE = /^[A-Za-z][\w-]*:\s/u;

/** Index of the first line of the message's last paragraph. */
const lastParagraphStart = (lines: readonly string[]): number => {
	let start = lines.length;
	while (start > 0 && (lines[start - 1] ?? '').trim() !== '') start -= 1;
	return start;
};

/**
 * Drop earlier copies of the exact trailer about to be added from the last
 * paragraph (never the subject), so a slice that closes twice does not
 * stack the same `Co-authored-by:` line. Every other line — body, other
 * co-authors, `Signed-off-by:` — stays.
 */
const stripTrailers = (
	body: string,
	kind: AuditTrailerKind,
	trailerLine = '',
): string => {
	if (kind === 'co-authored-by') {
		const lines = body.trimEnd().split('\n');
		const start = Math.max(lastParagraphStart(lines), 1);
		const wanted = trailerLine.toLowerCase();
		const kept = lines.filter(
			(line, index) =>
				index < start || line.trimEnd().toLowerCase() !== wanted,
		);
		return kept.join('\n').trimEnd();
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
	if (kind === 'co-authored-by') {
		const trailer = `Co-authored-by: ${interpolate(format, agent)}`;
		const clean = stripTrailers(originalMessage, kind, trailer);
		const lines = clean.split('\n');
		const start = lastParagraphStart(lines);
		// Join an existing trailer block; otherwise the convention wants a
		// blank line between body and the trailer block.
		const inTrailerBlock =
			start > 0 &&
			lines.slice(start).every((line) => TRAILER_LINE.test(line));
		return `${clean}${inTrailerBlock ? '\n' : '\n\n'}${trailer}\n`;
	}
	const clean = stripTrailers(originalMessage, kind);
	// body-metadata: fenced block, parseable by external tooling.
	const formatted = interpolate(format, agent);
	const stamp = interpolate('${date}', agent);
	const metadata = JSON.stringify({
		host: agent.host,
		model: agent.model,
		format: formatted,
		stamp,
	});
	return `${clean}\n\n<!-- agent-metadata:begin -->\n\`\`\`json\n${metadata}\n\`\`\`\n<!-- agent-metadata:end -->\n`;
};
