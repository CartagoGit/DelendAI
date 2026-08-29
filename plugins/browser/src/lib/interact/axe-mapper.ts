/**
 * f00125 S2 — Normalize axe-core results to r00012 `IFinding`.
 *
 * The plugin surfaces one canonical finding shape (r00012) regardless
 * of which scanner produced it. Axe impact levels map onto the
 * scanner-standard 5-band severity; each violation becomes one
 * `IFinding` per affected node so the host's CLI + extension renderers
 * can show a precise "where to fix".
 */
import type { IFinding, FindingSeverity } from '@mcp-vertex/core/public';

import type { IAxeNode, IAxeViolation } from './iaction-driver';

const impactToSeverity = (impact: IAxeViolation['impact']): FindingSeverity => {
	switch (impact) {
		case 'critical':
			return 'critical';
		case 'serious':
			return 'high';
		case 'moderate':
			return 'medium';
		case 'minor':
			return 'low';
		default:
			return 'info';
	}
};

const htmlToFile = (html: string): string => {
	// Axe HTML can be long; strip tags + collapse whitespace so the
	// `file` field is a single navigable line for CLI/extension output.
	let withoutTags = '';
	let index = 0;
	while (index < html.length) {
		const char = html[index];
		if (char !== '<') {
			withoutTags += char;
			index += 1;
			continue;
		}
		const closeIndex = html.indexOf('>', index + 1);
		if (closeIndex < 0) {
			withoutTags += html.slice(index);
			break;
		}
		withoutTags += ' ';
		index = closeIndex + 1;
	}
	let text = '';
	let previousWasWhitespace = false;
	for (const char of withoutTags) {
		const isWhitespace = /\s/u.test(char);
		if (isWhitespace) {
			if (!previousWasWhitespace) text += ' ';
			previousWasWhitespace = true;
			continue;
		}
		text += char;
		previousWasWhitespace = false;
	}
	text = text.trim();
	return text.length === 0 ? '<element>' : text.slice(0, 120);
};

/** Map one violation + one of its nodes to a single normalized finding. */
export const axeNodeToFinding = (
	url: string,
	violation: IAxeViolation,
	node: IAxeNode,
	index: number,
): IFinding => {
	const severity = impactToSeverity(violation.impact);
	const selector = (node.target ?? []).join(' ');
	const html = node.html ?? '<element>';
	const file = htmlToFile(html);
	const fix =
		violation.help && violation.helpUrl
			? `${violation.help} (${violation.helpUrl})`
			: violation.help;
	const message =
		`${violation.help ?? violation.description ?? violation.id}` +
		` @ ${url}` +
		(selector.length > 0 ? ` — selector: ${selector}` : '');
	return {
		ruleId: `axe:${violation.id}`,
		severity,
		message,
		location: {
			file: `${file}#node-${index + 1}`,
		},
		...(fix !== undefined ? { fix } : {}),
	};
};

/** Map a whole axe report to normalized findings. */
export const mapAxeReport = (
	url: string,
	violations: readonly IAxeViolation[],
): readonly IFinding[] =>
	violations.flatMap((violation) =>
		violation.nodes.map((node, index) =>
			axeNodeToFinding(url, violation, node, index),
		),
	);

/** Per-severity counts; mirrors `IFindingCounts`. */
export const summarizeSeverity = (
	findings: readonly IFinding[],
): Readonly<Record<FindingSeverity, number>> => {
	const counts: Record<FindingSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};
	for (const f of findings) counts[f.severity] += 1;
	return counts;
};
