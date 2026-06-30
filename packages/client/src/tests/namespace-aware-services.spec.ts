/**
 * namespace-aware-services.spec.ts — f00081 S1.
 *
 * Verifies the client service layer threads a `namespacePrefix` through
 * every `request(...)` call so a deployment started with `--prefix=acme`
 * does not silently fail on every IDE integration.
 *
 * Covers:
 *  - the `_namespace` helpers (`formatToolName`, `parsePrefix`);
 *  - default prefix produces `mcp-vertex_<suffix>` (no behaviour change);
 *  - a custom prefix produces `<custom>_<suffix>`;
 *  - a missing prefix is treated as the default;
 *  - across OverviewService, NotificationsService, ConnectionHealthService
 *    and DashboardService.
 */
import { describe, expect, it } from 'vitest';

import {
	ConnectionHealthService,
	DashboardService,
	DEFAULT_NAMESPACE_PREFIX,
	formatToolName,
	type McpStdioClient,
	NotificationsService,
	OverviewService,
	parsePrefix,
} from '../public/index';

/** Records every tool name requested and replies with canned payloads. */
class RecordingClient {
	readonly calls: string[] = [];
	constructor(
		private readonly reply: (tool: string) => unknown = () => ({}),
	) {}
	async request<TIn extends object, TOut>(
		tool: string,
		_args: TIn,
	): Promise<TOut> {
		this.calls.push(tool);
		return this.reply(tool) as TOut;
	}
}

const asClient = (c: RecordingClient): McpStdioClient =>
	c as unknown as McpStdioClient;

describe('_namespace helpers', () => {
	it('parsePrefix falls back to the default for empty/missing values', () => {
		expect(parsePrefix(undefined)).toBe(DEFAULT_NAMESPACE_PREFIX);
		expect(parsePrefix(null)).toBe(DEFAULT_NAMESPACE_PREFIX);
		expect(parsePrefix('')).toBe(DEFAULT_NAMESPACE_PREFIX);
		expect(parsePrefix('   ')).toBe(DEFAULT_NAMESPACE_PREFIX);
	});

	it('parsePrefix appends a trailing underscore when missing', () => {
		expect(parsePrefix('acme')).toBe('acme_');
		expect(parsePrefix('acme_')).toBe('acme_');
		expect(parsePrefix('  acme  ')).toBe('acme_');
	});

	it('formatToolName composes prefix + suffix', () => {
		expect(formatToolName(undefined, 'overview')).toBe(
			'mcp-vertex_overview',
		);
		expect(formatToolName('acme', 'overview')).toBe('acme_overview');
		expect(formatToolName('acme_', 'notification_notify_status')).toBe(
			'acme_notification_notify_status',
		);
	});
});

describe('OverviewService namespace prefix', () => {
	const overviewReply = () => ({ tools: [], plugins: [] });

	it('default prefix produces mcp-vertex_overview', async () => {
		const client = new RecordingClient(overviewReply);
		await new OverviewService(asClient(client)).getOverview();
		expect(client.calls).toEqual(['mcp-vertex_overview']);
	});

	it('custom prefix produces <custom>_overview', async () => {
		const client = new RecordingClient(overviewReply);
		await new OverviewService(asClient(client), 'acme').getOverview();
		expect(client.calls).toEqual(['acme_overview']);
	});

	it('explicit default prefix is treated as the default', async () => {
		const client = new RecordingClient(overviewReply);
		await new OverviewService(
			asClient(client),
			DEFAULT_NAMESPACE_PREFIX,
		).getOverview();
		expect(client.calls).toEqual(['mcp-vertex_overview']);
	});
});

describe('NotificationsService namespace prefix', () => {
	const statusReply = () => ({
		watching: '',
		emitted: 0,
		lastReleases: [],
		agentEvents: 0,
	});

	it('default prefix produces mcp-vertex_notification_notify_status', async () => {
		const client = new RecordingClient(statusReply);
		await new NotificationsService(asClient(client)).status();
		expect(client.calls).toEqual(['mcp-vertex_notification_notify_status']);
	});

	it('custom prefix produces <custom>_notification_notify_status', async () => {
		const client = new RecordingClient(statusReply);
		await new NotificationsService(asClient(client), 'acme').status();
		expect(client.calls).toEqual(['acme_notification_notify_status']);
	});
});

describe('ConnectionHealthService namespace prefix', () => {
	it('default prefix pings mcp-vertex_status-marker_ping', async () => {
		const client = new RecordingClient();
		const svc = new ConnectionHealthService(asClient(client), {});
		// `ping` is private; exercise it via the public snapshot loop by
		// invoking the internal method through a single start/stop cycle is
		// flaky, so call request through the documented path: start fires one
		// ping synchronously.
		svc.start();
		svc.stop();
		await Promise.resolve();
		expect(client.calls).toEqual(['mcp-vertex_status-marker_ping']);
	});

	it('custom prefix pings <custom>_status-marker_ping', async () => {
		const client = new RecordingClient();
		const svc = new ConnectionHealthService(asClient(client), {}, 'acme');
		svc.start();
		svc.stop();
		await Promise.resolve();
		expect(client.calls).toEqual(['acme_status-marker_ping']);
	});
});

describe('DashboardService namespace prefix', () => {
	const reply = (tool: string): unknown => {
		if (tool.endsWith('_overview')) {
			return {
				tools: [],
				plugins: [],
				knowledge: [],
				server: { name: 's', version: '0' },
				namespacePrefix: 'acme_',
			};
		}
		if (tool.endsWith('_metrics')) return { tools: {}, totals: {} };
		if (tool.endsWith('proposal_board')) return { proposals: [] };
		if (tool.endsWith('agent_names')) return { agents: [] };
		return {};
	};

	it('custom prefix namespaces every direct request', async () => {
		const client = new RecordingClient(reply);
		const svc = new DashboardService({
			client: asClient(client),
			namespacePrefix: 'acme',
		});
		await svc.getOverviewModel();
		expect(client.calls).toContain('acme_overview');
		expect(client.calls).toContain('acme_metrics');
		expect(client.calls).toContain('acme_proposals_proposal_board');
		expect(client.calls).toContain('acme_proposals_agent_names');
		expect(client.calls.some((c) => c.startsWith('mcp-vertex_'))).toBe(
			false,
		);
	});

	it('default prefix preserves existing tool names', async () => {
		const client = new RecordingClient(reply);
		const svc = new DashboardService({ client: asClient(client) });
		await svc.getOverviewModel();
		expect(client.calls).toContain('mcp-vertex_overview');
		expect(client.calls).toContain('mcp-vertex_metrics');
	});
});
