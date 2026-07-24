import type { IToolRegistration } from '@mcp-vertex/core/public';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildClearToolRegistration } from './clear.tool';
import { buildReportToolRegistration } from './report.tool';
import { buildSessionHygieneToolRegistration } from './session-hygiene.tool';
import type { SessionHygieneMonitor } from '../session-hygiene';

export { buildReportToolRegistration } from './report.tool';
export type { IReportToolOptions } from './report.tool';
export { buildClearToolRegistration } from './clear.tool';
export type { IClearToolOptions } from './clear.tool';
export { buildSessionHygieneToolRegistration } from './session-hygiene.tool';
export type { ISessionHygieneToolOptions } from './session-hygiene.tool';

export interface IUsageToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
	readonly hostLifecyclePath: string;
	readonly summaryPath: string;
	readonly sessionHygiene: SessionHygieneMonitor;
	readonly onServer?: ((server: McpServer) => void) | undefined;
}

/** The two MVP tools: query the rollups, and clear the log. */
export const buildUsageTrackingToolRegistrations = (
	options: IUsageToolOptions,
): readonly IToolRegistration[] => [
	buildReportToolRegistration({
		namespacePrefix: options.namespacePrefix,
		invocationsPath: options.invocationsPath,
	}),
	buildClearToolRegistration({
		namespacePrefix: options.namespacePrefix,
		invocationsPath: options.invocationsPath,
		summaryPath: options.summaryPath,
	}),
	buildSessionHygieneToolRegistration({
		namespacePrefix: options.namespacePrefix,
		invocationsPath: options.invocationsPath,
		hostLifecyclePath: options.hostLifecyclePath,
		policy: options.sessionHygiene.policy,
		currentSessions: () => options.sessionHygiene.snapshots(),
		...(options.onServer !== undefined
			? { onServer: options.onServer }
			: {}),
	}),
];
