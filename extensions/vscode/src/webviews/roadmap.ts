/**
 * roadmap.ts — the roadmap as the editor shows it.
 *
 * A read-only page built from what `roadmap_show` answers: the same read
 * of the roadmap file the site's projection is made from, asked live, so
 * the editor never keeps a second copy to fall behind. No script runs in
 * it and it loads nothing.
 */
import { escapeHtml } from '@delendai/ui-extension/public';

import type {
	IRoadmapView,
	IRoadmapViewHorizon,
} from '../contracts/interfaces/roadmap-view.interface';

/** The sentences of the view, apart from the markup that carries them. */
const ROADMAP_VIEW_COPY = {
	source: 'The authority is',
	live: 'What can be promoted now is answered by',
} as const;

/** The answer of `roadmap_show`, when it has the shape this view reads. */
export const asRoadmapView = (answer: unknown): IRoadmapView | undefined => {
	const candidate = answer as Partial<IRoadmapView> | null | undefined;
	return typeof candidate?.file === 'string' &&
		Array.isArray(candidate.horizons)
		? { file: candidate.file, horizons: candidate.horizons }
		: undefined;
};

const horizonHtml = (horizon: IRoadmapViewHorizon): string =>
	[
		`<h2>${escapeHtml(horizon.version)}${horizon.bumpHint === undefined ? '' : ` <small>(${escapeHtml(horizon.bumpHint)})</small>`}</h2>`,
		`<p>${String(horizon.counts.delivered)} delivered · ${String(horizon.counts.open)} open · ${String(horizon.counts.withdrawn)} withdrawn</p>`,
		'<ul>',
		...horizon.entries.map(
			(entry) =>
				`<li><strong>${escapeHtml(entry.title)}</strong> — ${escapeHtml(entry.kind)}, ${escapeHtml(entry.state)} <code>${escapeHtml(entry.id)}</code></li>`,
		),
		'</ul>',
	].join('\n');

export const renderRoadmapWebview = (view: IRoadmapView): string =>
	[
		'<!doctype html>',
		'<html lang="en"><head><meta charset="utf-8"><title>Roadmap</title></head><body>',
		'<h1>Roadmap</h1>',
		`<p>${escapeHtml(ROADMAP_VIEW_COPY.source)} <code>${escapeHtml(view.file)}</code>. ${escapeHtml(ROADMAP_VIEW_COPY.live)} <code>roadmap_readiness</code>.</p>`,
		view.horizons.length === 0
			? '<p>The roadmap file holds no version yet.</p>'
			: view.horizons.map(horizonHtml).join('\n'),
		'</body></html>',
	].join('\n');
