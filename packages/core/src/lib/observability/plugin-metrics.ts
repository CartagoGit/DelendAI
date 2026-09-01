/**
 * plugin-metrics.ts — c00134 (Track D).
 *
 * In-process metrics for plugin lifecycle transitions. Pure,
 * dependency-free, process-local. The router (Track D /
 * f00184/f00185) calls these counters in each transition; the
 * dashboard generator (token-budget-dashboard) reads the
 * snapshot.
 *
 * Privacy (R1.1): the module records ONLY `pluginId` (public) and
 * aggregate counters/histograms. No paths, emails, or payload
 * bytes — those belong in tool-level metrics, not plugin-level.
 */

export type PluginEvent =
	| 'plugin.loaded' // → LOADED_HIDDEN
	| 'plugin.activated' // → ACTIVE
	| 'plugin.invoked' // successful tools/call
	| 'plugin.unloaded' // → UNLOADED
	| 'plugin.denied'; // → DENIED

export type PluginHistogramEvent =
	| 'plugin.prepare.duration_ms'
	| 'plugin.activate.duration_ms';

export interface IPluginMetricsCounters {
	readonly loaded: number;
	readonly activated: number;
	readonly invoked: number;
	readonly unloaded: number;
	readonly denied: number;
}

export interface IPluginMetricsHistogram {
	readonly count: number;
	readonly totalMs: number;
	readonly maxMs: number;
}

export interface IPluginMetricsSnapshot {
	counters: IPluginMetricsCounters;
	histograms: Record<PluginHistogramEvent, IPluginMetricsHistogram>;
	/** Per-plugin invocation count (top-K source for the dashboard). */
	invokedByPlugin: Record<string, number>;
	/** Current state counts (gauge). */
	stateCount: Record<string, number>;
}

export interface IPluginMetrics {
	incr(event: PluginEvent, pluginId?: string): void;
	observe(event: PluginHistogramEvent, ms: number): void;
	setStateGauge(state: string, count: number): void;
	snapshot(): IPluginMetricsSnapshot;
	formatForDashboard(): string;
}

const ZERO_COUNTERS: IPluginMetricsCounters = {
	loaded: 0,
	activated: 0,
	invoked: 0,
	unloaded: 0,
	denied: 0,
};

const ZERO_HISTOGRAM: IPluginMetricsHistogram = {
	count: 0,
	totalMs: 0,
	maxMs: 0,
};

export const createPluginMetrics = (): IPluginMetrics => {
	type MutableCounters = {
		-readonly [K in keyof IPluginMetricsCounters]: IPluginMetricsCounters[K];
	};
	type MutableHistogram = {
		-readonly [K in keyof IPluginMetricsHistogram]: IPluginMetricsHistogram[K];
	};
	const counters: MutableCounters = { ...ZERO_COUNTERS };
	const histograms: Record<PluginHistogramEvent, MutableHistogram> = {
		'plugin.prepare.duration_ms': { ...ZERO_HISTOGRAM },
		'plugin.activate.duration_ms': { ...ZERO_HISTOGRAM },
	};
	const invokedByPlugin: Record<string, number> = {};
	const stateCount: Record<string, number> = {};

	return {
		incr(event, pluginId) {
			switch (event) {
				case 'plugin.loaded':
					counters.loaded += 1;
					break;
				case 'plugin.activated':
					counters.activated += 1;
					break;
				case 'plugin.invoked':
					counters.invoked += 1;
					if (pluginId !== undefined) {
						invokedByPlugin[pluginId] =
							(invokedByPlugin[pluginId] ?? 0) + 1;
					}
					break;
				case 'plugin.unloaded':
					counters.unloaded += 1;
					break;
				case 'plugin.denied':
					counters.denied += 1;
					break;
			}
		},
		observe(event, ms) {
			const h = histograms[event];
			h.count += 1;
			h.totalMs += ms;
			if (ms > h.maxMs) h.maxMs = ms;
		},
		setStateGauge(state, count) {
			stateCount[state] = count;
		},
		snapshot() {
			return {
				counters: { ...counters },
				histograms: { ...histograms },
				invokedByPlugin: { ...invokedByPlugin },
				stateCount: { ...stateCount },
			};
		},
		formatForDashboard() {
			const lines: string[] = [];
			lines.push('## Plugin Lifecycle');
			lines.push('');
			lines.push('### Counters');
			lines.push('');
			lines.push('| Event | Count |');
			lines.push('| --- | --- |');
			for (const [k, v] of Object.entries(counters)) {
				lines.push(`| ${k} | ${v} |`);
			}
			lines.push('');
			lines.push('### Histograms');
			lines.push('');
			lines.push('| Event | Count | Total ms | Max ms |');
			lines.push('| --- | --- | --- | --- |');
			for (const [k, v] of Object.entries(histograms)) {
				lines.push(`| ${k} | ${v.count} | ${v.totalMs} | ${v.maxMs} |`);
			}
			lines.push('');
			lines.push('### State gauges');
			lines.push('');
			lines.push('| State | Count |');
			lines.push('| --- | --- |');
			for (const [k, v] of Object.entries(stateCount)) {
				lines.push(`| ${k} | ${v} |`);
			}
			lines.push('');
			lines.push('### Top plugins by invocation');
			lines.push('');
			lines.push('| Plugin | Invocations |');
			lines.push('| --- | --- |');
			const top = Object.entries(invokedByPlugin)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);
			for (const [k, v] of top) {
				lines.push(`| ${k} | ${v} |`);
			}
			return lines.join('\n');
		},
	};
};
