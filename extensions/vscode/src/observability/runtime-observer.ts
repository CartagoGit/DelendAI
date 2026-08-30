import {
	readRuntimeEvents,
	type IRuntimeEventCursor,
} from '@mcp-vertex/client';
import type { IRuntimeEvent } from '@mcp-vertex/client';

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

const DEFAULT_INTERVAL_MS = 2_000;

/**
 * Local-only runtime observer. It reads the portable JSONL event stream and
 * never calls MCP tools, including overview or lazy plugin tools.
 */
export class RuntimeObserver {
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopped = false;
	private inFlight = false;
	private cursor: IRuntimeEventCursor = { offset: 0, events: [] };

	constructor(
		private readonly filePath: string,
		private readonly output: IRuntimeObserverOutput,
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
			const previousCount = this.cursor.events.length;
			const next = await readRuntimeEvents(this.filePath, this.cursor);
			const events =
				next.events.length < previousCount
					? next.events
					: next.events.slice(previousCount);
			for (const event of events)
				this.output.append(formatRuntimeEvent(event));
			this.cursor = next;
		} catch {
			// The observer is deliberately non-invasive; provider errors remain
			// the source of truth for connection failures.
		} finally {
			this.inFlight = false;
		}
	}
}

const formatRuntimeEvent = (event: IRuntimeEvent): string => {
	const details = [
		event.toolName === undefined ? undefined : `tool=${event.toolName}`,
		event.pluginName === undefined
			? undefined
			: `plugin=${event.pluginName}`,
		event.elapsedMs === undefined
			? undefined
			: `elapsed=${event.elapsedMs}ms`,
		event.estimatedTokens4B === undefined
			? undefined
			: `tokens=${event.estimatedTokens4B}`,
	]
		.filter((value): value is string => value !== undefined)
		.join(' ');
	return `[${event.ts}] ${event.kind}${details.length === 0 ? '' : ` ${details}`}\n`;
};

export const observerIntervalMs = (vscode: IRuntimeObserverVscode): number => {
	const configured = vscode.workspace
		?.getConfiguration?.('mcp-vertex')
		.get('observability.refreshMs', DEFAULT_INTERVAL_MS);
	return typeof configured === 'number' && configured >= 500
		? configured
		: DEFAULT_INTERVAL_MS;
};
