import type { IOverview } from '@mcp-vertex/client';
import { formatToolName, type McpStdioClient } from '@mcp-vertex/client';

export interface IRuntimeObserverOutput {
	append(value: string): void;
	show?(preserveFocus?: boolean): void;
}

interface IRuntimeObserverVscode {
	readonly workspace?: {
		getConfiguration?(section: string): {
			get<T>(key: string, defaultValue: T): T;
		};
	};
}

interface IMetricsSnapshot {
	readonly tools?: Readonly<
		Record<
			string,
			{
				readonly calls?: number;
				readonly errors?: number;
				readonly totalBytes?: number;
				readonly cost?: {
					readonly estimatedTokens?: {
						readonly estimatedTokens4B?: number;
					};
				};
			}
		>
	>;
	readonly totals?: {
		readonly calls?: number;
		readonly errors?: number;
		readonly totalBytes?: number;
		readonly cost?: {
			readonly estimatedTokens?: {
				readonly estimatedTokens4B?: number;
			};
		};
	};
}

interface IProjectContextSnapshot {
	readonly loadedPlugins?: readonly string[];
	readonly warmPlugins?: readonly string[];
	readonly visibleToolCount?: number;
	readonly hiddenToolCount?: number;
}

interface IUsageSnapshot {
	readonly totals?: {
		readonly tokensSaved?: number;
		readonly savingsPercent?: number;
	};
}

const DEFAULT_INTERVAL_MS = 2_000;

const asNumber = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

const pluginNames = (overview: IOverview): readonly string[] =>
	overview.plugins.map((plugin) =>
		typeof plugin === 'string' ? plugin : plugin.name,
	);

const toolCount = (overview: IOverview): number => {
	if (Array.isArray(overview.tools)) return overview.tools.length;
	return Object.values(overview.tools).reduce(
		(total, tools) => total + tools.length,
		0,
	);
};

/**
 * Local-only runtime observer. It reads already-visible core telemetry and
 * never calls plugin_activate or a lazy plugin tool just to populate the UI.
 */
export class RuntimeObserver {
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopped = false;
	private lastCalls = 0;
	private lastTokens = 0;
	private lastLoaded = new Set<string>();
	private lastToolCalls = new Map<string, number>();
	private inFlight = false;
	private hasSnapshot = false;

	constructor(
		private readonly client: McpStdioClient,
		private readonly output: IRuntimeObserverOutput,
		private readonly namespacePrefix?: string,
		private readonly intervalMs = DEFAULT_INTERVAL_MS,
	) {}

	start(): void {
		if (this.timer !== undefined) return;
		void this.tick();
		this.timer = setInterval(() => void this.tick(), this.intervalMs);
	}

	stop(): void {
		this.stopped = true;
		if (this.timer !== undefined) clearInterval(this.timer);
		this.timer = undefined;
	}

	dispose(): void {
		this.stop();
	}

	private async tick(): Promise<void> {
		if (this.stopped || this.inFlight) return;
		this.inFlight = true;
		try {
			const [overview, context, metrics] = await Promise.all([
				this.client.request<object, IOverview>(
					formatToolName(this.namespacePrefix, 'overview'),
					{ compact: true, activation: true },
				),
				this.client.request<object, IProjectContextSnapshot>(
					formatToolName(this.namespacePrefix, 'project_context'),
					{},
				),
				this.client.request<object, IMetricsSnapshot>(
					formatToolName(this.namespacePrefix, 'metrics'),
					{},
				),
			]);
			const loaded = new Set(context.loadedPlugins ?? []);
			const available = pluginNames(overview);
			const totals = metrics.totals ?? {};
			const calls = asNumber(totals.calls);
			const tokens = asNumber(
				totals.cost?.estimatedTokens?.estimatedTokens4B,
			);
			const newlyLoaded = [...loaded].filter(
				(plugin) => !this.lastLoaded.has(plugin),
			);
			const usedTools = Object.entries(metrics.tools ?? {})
				.map(([name, metric]) => ({
					name,
					calls: asNumber(metric.calls),
					tokens: asNumber(
						metric.cost?.estimatedTokens?.estimatedTokens4B,
					),
				}))
				.filter(
					({ name, calls }) =>
						calls > (this.lastToolCalls.get(name) ?? 0),
				);
			const mode = overview.projectContext?.surfaceMode ?? 'managed';
			const loadedChanged =
				newlyLoaded.length > 0 ||
				[...this.lastLoaded].some((plugin) => !loaded.has(plugin));
			if (!this.hasSnapshot || loadedChanged) {
				this.output.append(
					`[${new Date().toISOString()}] mode=${mode} ` +
						`loaded=${[...loaded].sort().join(',') || 'none'} ` +
						`plugins=${available.length} tools=${toolCount(overview)} ` +
						`visible=${overview.projectContext?.visibleToolCount ?? '?'}\n`,
				);
			}
			if (newlyLoaded.length > 0) {
				this.output.append(
					`  activated: ${newlyLoaded.sort().join(', ')}\n`,
				);
			}
			for (const tool of usedTools) {
				this.output.append(
					`[${new Date().toISOString()}] used=${tool.name} ` +
						`calls=${tool.calls} tokens=${tool.tokens}\n`,
				);
			}
			if (
				usedTools.length === 0 &&
				(calls !== this.lastCalls || tokens !== this.lastTokens)
			) {
				this.output.append(
					`[${new Date().toISOString()}] used calls=${calls} tokens=${tokens}\n`,
				);
			}
			const usageLoaded = loaded.has('usage-tracking');
			if (usageLoaded) {
				const usage = await this.client.request<object, IUsageSnapshot>(
					formatToolName(
						this.namespacePrefix,
						'usage-tracking_usage_report',
					),
					{ detail: 'compact' },
				);
				const saved = asNumber(usage.totals?.tokensSaved);
				const percent = asNumber(usage.totals?.savingsPercent);
				this.output.append(
					`  saved: ${saved} tokens (${percent.toFixed(1)}%)\n`,
				);
			}
			this.lastLoaded = loaded;
			this.lastCalls = calls;
			this.lastTokens = tokens;
			this.lastToolCalls = new Map(
				Object.entries(metrics.tools ?? {}).map(([name, metric]) => [
					name,
					asNumber(metric.calls),
				]),
			);
			this.hasSnapshot = true;
		} catch {
			// The observer is deliberately non-invasive; provider errors remain
			// the source of truth for connection failures.
		} finally {
			this.inFlight = false;
		}
	}
}

export const observerIntervalMs = (vscode: IRuntimeObserverVscode): number => {
	const configured = vscode.workspace
		?.getConfiguration?.('mcp-vertex')
		.get('observability.refreshMs', DEFAULT_INTERVAL_MS);
	return typeof configured === 'number' && configured >= 500
		? configured
		: DEFAULT_INTERVAL_MS;
};
