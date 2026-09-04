/**
 * scan-markers.ts — scan source text for tech-debt marker comments
 * (TODO / FIXME / HACK / XXX / BUG / DEPRECATED / NOTE) and report each as a
 * normalized finding, with severity by marker kind. Pure over the file text.
 */
import type { FindingSeverity, IFinding } from '@delendai/core/public';

import type { ISourceFile } from '../contracts/interfaces/tech-debt.interface';

/** Severity assigned to each recognised marker word. */
const MARKER_SEVERITY: Readonly<Record<string, FindingSeverity>> = {
	FIXME: 'high',
	BUG: 'high',
	XXX: 'medium',
	HACK: 'medium',
	DEPRECATED: 'medium',
	TODO: 'low',
	NOTE: 'info',
};

/** The marker words we recognise, longest-first is irrelevant (alternation). */
const MARKERS = Object.keys(MARKER_SEVERITY).join('|');

/**
 * A marker preceded by a comment leader on the same line, capturing the marker
 * word and the trailing note. Requiring a leader (`//`, `#`, `/*`, ` * `,
 * `<!--`, `;`) keeps identifiers and string literals from matching.
 */
const MARKER_LINE = new RegExp(
	String.raw`(?:\/\/|#|\/\*|\*|<!--|;)\s*(${MARKERS})\b[:\s-]*(.*)`,
);

/** Cap the reported note so a giant comment can't bloat the output. */
const MAX_NOTE = 120;

/** Scan one file's text → findings, one per marker line. Pure. */
export const scanFile = (file: ISourceFile): IFinding[] => {
	const findings: IFinding[] = [];
	const lines = file.content.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const match = MARKER_LINE.exec(lines[index] ?? '');
		if (match === null) continue;
		const marker = (match[1] ?? '').toUpperCase();
		const severity = MARKER_SEVERITY[marker];
		if (severity === undefined) continue;
		const note = (match[2] ?? '').trim().slice(0, MAX_NOTE);
		findings.push({
			ruleId: `marker-${marker.toLowerCase()}`,
			severity,
			message: note === '' ? `${marker} marker` : `${marker}: ${note}`,
			location: { file: file.path, line: index + 1 },
		});
	}
	return findings;
};

/** Scan every file → findings, in file+line order. Pure; deterministic. */
export const scanMarkers = (files: readonly ISourceFile[]): IFinding[] => {
	const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
	return ordered.flatMap((file) => scanFile(file));
};
