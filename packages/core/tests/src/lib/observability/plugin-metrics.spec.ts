/**
 * plugin-metrics.spec.ts — c00134 (Track D).
 *
 * Counters, histograms, state gauges, top-N plugin invocations,
 * and the dashboard formatter.
 */

import { describe, expect, it } from 'vitest';

import { createPluginMetrics } from '@mcp-vertex/core/public';

describe('c00134 — plugin metrics', () => {
	it('starts with zero counters', () => {
		const m = createPluginMetrics();
		const s = m.snapshot();
		expect(s.counters.loaded).toBe(0);
		expect(s.counters.activated).toBe(0);
		expect(s.counters.invoked).toBe(0);
		expect(s.counters.unloaded).toBe(0);
		expect(s.counters.denied).toBe(0);
	});

	it('incr increments the right counter', () => {
		const m = createPluginMetrics();
		m.incr('plugin.loaded');
		m.incr('plugin.loaded');
		m.incr('plugin.activated');
		m.incr('plugin.denied');
		const s = m.snapshot();
		expect(s.counters.loaded).toBe(2);
		expect(s.counters.activated).toBe(1);
		expect(s.counters.denied).toBe(1);
	});

	it('incr tracks per-plugin invocations', () => {
		const m = createPluginMetrics();
		m.incr('plugin.invoked', 'git');
		m.incr('plugin.invoked', 'git');
		m.incr('plugin.invoked', 'docs');
		const s = m.snapshot();
		expect(s.invokedByPlugin.git).toBe(2);
		expect(s.invokedByPlugin.docs).toBe(1);
	});

	it('observe accumulates histogram stats', () => {
		const m = createPluginMetrics();
		m.observe('plugin.prepare.duration_ms', 100);
		m.observe('plugin.prepare.duration_ms', 200);
		m.observe('plugin.prepare.duration_ms', 50);
		const h = m.snapshot().histograms['plugin.prepare.duration_ms'];
		expect(h.count).toBe(3);
		expect(h.totalMs).toBe(350);
		expect(h.maxMs).toBe(200);
	});

	it('setStateGauge reflects in snapshot', () => {
		const m = createPluginMetrics();
		m.setStateGauge('ACTIVE', 12);
		m.setStateGauge('LOADED_HIDDEN', 3);
		m.setStateGauge('DENIED', 1);
		const s = m.snapshot();
		expect(s.stateCount.ACTIVE).toBe(12);
		expect(s.stateCount.LOADED_HIDDEN).toBe(3);
		expect(s.stateCount.DENIED).toBe(1);
	});

	it('formatForDashboard emits a Markdown section', () => {
		const m = createPluginMetrics();
		m.incr('plugin.loaded');
		m.incr('plugin.loaded');
		m.incr('plugin.invoked', 'git');
		m.observe('plugin.prepare.duration_ms', 42);
		m.setStateGauge('ACTIVE', 5);
		const md = m.formatForDashboard();
		expect(md).toContain('## Plugin Lifecycle');
		expect(md).toContain('### Counters');
		expect(md).toContain('### Histograms');
		expect(md).toContain('### State gauges');
		expect(md).toContain('### Top plugins by invocation');
		expect(md).toContain('| loaded | 2 |');
		expect(md).toContain('| git | 1 |');
		expect(md).toContain('| ACTIVE | 5 |');
	});

	it('snapshot is independent of subsequent mutations', () => {
		const m = createPluginMetrics();
		m.incr('plugin.loaded');
		const snap1 = m.snapshot();
		m.incr('plugin.loaded');
		const snap2 = m.snapshot();
		expect(snap1.counters.loaded).toBe(1);
		expect(snap2.counters.loaded).toBe(2);
	});
});
