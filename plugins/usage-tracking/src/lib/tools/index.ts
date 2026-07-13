import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildClearToolRegistration } from './clear.tool';
import { buildReportToolRegistration } from './report.tool';

export { buildReportToolRegistration } from './report.tool';
export type { IReportToolOptions } from './report.tool';
export { buildClearToolRegistration } from './clear.tool';
export type { IClearToolOptions } from './clear.tool';

export interface IUsageToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
	readonly summaryPath: string;
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
];
