/**
 * agent-timeline.spec.ts — f00192 (Track J / agent timeline).
 *
 * Pins the VSCode Agent Timeline view contract:
 *   - filter chips drive the projection,
 *   - every event card renders kind + timestamp + plugin + cost,
 *   - free text is HTML-escaped (R5.2 — defense in depth on top
 *     of the core's `redactFreeText`),
 *   - CSP is enforced (no scripts can run inside the webview),
 *   - the parser correctly maps query-string filters back into the
 *     typed shape.
 */

import { describe, expect, it } from 'vitest';

import {
	parseTimelineQuery,
	projectTimelineView,
	renderAgentTimeline,
	renderAgentTimelineBody,
	type ITimelineViewModel,
} from '../views/agent-timeline';
import type { ITimelineLog } from '@delendai/core/public';

const LOG: ITimelineLog = {
	version: 1,
	events: [
		{
			ts: '2026-08-26T00:00:00Z',
			kind: 'claim',
			plugin: 'proposals',
			sliceId: 'q00006-track-j',
			why: 'claimed via acme.claimSlice',
		},
		{
			ts: '2026-08-26T00:01:00Z',
			kind: 'test',
			plugin: 'quality',
			why: 'ran vitest on the new view',
			cost: 250,
		},
		{
			ts: '2026-08-26T00:02:00Z',
			kind: 'commit',
			plugin: 'git',
			commitSha: 'deadbeef',
		},
	],
};

describe('f00192 — views.agent-timeline (Track J)', () => {
	describe('projectTimelineView', () => {
		it('passes all events through when no filter is set', () => {
			const model = projectTimelineView(LOG, {});
			expect(model.events).toHaveLength(3);
			expect(model.totalCount).toBe(3);
			expect(model.availablePlugins).toEqual([
				'git',
				'proposals',
				'quality',
			]);
		});

		it('filters by kind', () => {
			const model = projectTimelineView(LOG, { kind: 'commit' });
			expect(model.events).toHaveLength(1);
			expect(model.kindFilter).toBe('commit');
		});

		it('filters by plugin', () => {
			const model = projectTimelineView(LOG, { plugin: 'quality' });
			expect(model.events).toHaveLength(1);
			expect(model.events[0]?.kind).toBe('test');
		});

		it('combines filters (AND)', () => {
			const model = projectTimelineView(LOG, {
				kind: 'test',
				plugin: 'proposals',
			});
			expect(model.events).toHaveLength(0);
		});
	});

	describe('renderAgentTimeline', () => {
		const model: ITimelineViewModel = projectTimelineView(LOG, {});

		it('renders an HTML document with a strict CSP', () => {
			const html = renderAgentTimeline(model);
			expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
			expect(html).toContain('Content-Security-Policy');
			expect(html).toContain("script-src 'none'");
		});

		it('renders every event card with kind + timestamp', () => {
			const html = renderAgentTimeline(model);
			expect(html).toContain('class="agent-timeline"');
			expect(html).toContain('claim');
			expect(html).toContain('test');
			expect(html).toContain('commit');
			expect(html).toContain('2026-08-26 00:00:00');
			expect(html).toContain('2026-08-26 00:01:00');
			expect(html).toContain('2026-08-26 00:02:00');
		});

		it('renders cost when present', () => {
			const html = renderAgentTimeline(model);
			expect(html).toContain('250 tokens');
		});

		it('renders the commit sha when present', () => {
			const html = renderAgentTimeline(model);
			expect(html).toContain('deadbeef');
		});

		it('renders plugin + slice chips for every event', () => {
			const html = renderAgentTimeline(model);
			expect(html).toContain('proposals');
			expect(html).toContain('q00006-track-j');
		});

		it('escapes free-text to prevent injection (defense in depth on top of core redact)', () => {
			const html = renderAgentTimeline(
				projectTimelineView(
					{
						version: 1,
						events: [
							{
								ts: '2026-08-26T00:00:00Z',
								kind: 'note',
								why: '<script>alert(1)</script>',
							},
						],
					},
					{},
				),
			);
			expect(html).not.toContain('<script>alert(1)</script>');
			expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		});

		it('does NOT emit any inline <script> tags', () => {
			const html = renderAgentTimeline(model);
			expect(html).not.toMatch(/<script\b/);
		});

		it('renders the empty-state when filters exclude everything', () => {
			const html = renderAgentTimeline(
				projectTimelineView(LOG, { kind: 'close' }),
			);
			expect(html).toContain('No events match the current filters');
			expect(html).toContain('3 total events');
		});

		it('renders the refresh link when provided', () => {
			const html = renderAgentTimeline(model, {
				refreshHref: '?refresh=1',
			});
			expect(html).toContain('href="?refresh=1"');
		});
	});

	describe('renderAgentTimelineBody', () => {
		it('omits the <html> envelope so dev-preview pages can mount it', () => {
			const html = renderAgentTimelineBody(projectTimelineView(LOG, {}));
			expect(html).not.toContain('<!DOCTYPE');
			expect(
				html.startsWith('<section class="agent-timeline-page">'),
			).toBe(true);
		});
	});

	describe('parseTimelineQuery', () => {
		it('parses an empty query as null filters', () => {
			const parsed = parseTimelineQuery('');
			expect(parsed).toEqual({ kind: null, plugin: null });
		});

		it('parses plugin + kind from a real query string', () => {
			expect(parseTimelineQuery('plugin=quality&kind=test')).toEqual({
				kind: 'test',
				plugin: 'quality',
			});
		});

		it('rejects unknown kinds', () => {
			expect(parseTimelineQuery('kind=telepathy').kind).toBeNull();
		});

		it('treats an empty plugin value as null', () => {
			expect(parseTimelineQuery('plugin=').plugin).toBeNull();
		});
	});
});
