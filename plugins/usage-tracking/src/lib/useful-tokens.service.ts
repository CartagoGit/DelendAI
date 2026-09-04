import {
	measureBootstrapBytes,
	measureToolWireBytes,
	type IMcpToolWireDefinition,
} from '@delendai/core/public';

import type { IInvocationRecord } from './types';

export interface ISessionToolSurface {
	readonly sessionId: string;
	readonly tools: readonly IMcpToolWireDefinition[];
}

export interface IUsefulTokensSessionMetric {
	readonly sessionId: string;
	readonly servedBytes: number;
	readonly usedBytes: number;
	readonly ratio: number;
}

export interface IUsefulTokensSummary {
	readonly sessions: readonly IUsefulTokensSessionMetric[];
	readonly servedBytes: number;
	readonly usedBytes: number;
	readonly ratio: number;
}

const ratioOf = (usedBytes: number, servedBytes: number): number =>
	servedBytes <= 0 ? 0 : Math.max(0, Math.min(1, usedBytes / servedBytes));

const qualifyInvocationTool = (
	record: IInvocationRecord,
	corePrefix: string,
): string =>
	record.plugin === 'core'
		? `${corePrefix}_${record.tool}`
		: `${corePrefix}_${record.plugin}_${record.tool}`;

export const usedToolsBySession = (
	invocations: readonly IInvocationRecord[],
	corePrefix = 'mcp-vertex',
): ReadonlyMap<string, ReadonlySet<string>> => {
	const sessions = new Map<string, Set<string>>();
	for (const record of invocations) {
		const used = sessions.get(record.sessionId) ?? new Set<string>();
		used.add(qualifyInvocationTool(record, corePrefix));
		sessions.set(record.sessionId, used);
	}
	return sessions;
};

export const computeUsefulTokensSessions = (input: {
	readonly surfaces: readonly ISessionToolSurface[];
	readonly invocations: readonly IInvocationRecord[];
	readonly corePrefix?: string | undefined;
}): IUsefulTokensSessionMetric[] => {
	const corePrefix = input.corePrefix ?? 'mcp-vertex';
	const usedBySession = usedToolsBySession(input.invocations, corePrefix);
	const totals = new Map<
		string,
		{ servedBytes: number; usedBytes: number }
	>();

	for (const surface of input.surfaces) {
		const previous = totals.get(surface.sessionId) ?? {
			servedBytes: 0,
			usedBytes: 0,
		};
		const used = usedBySession.get(surface.sessionId);
		const servedBytes = measureBootstrapBytes(surface.tools).bytes;
		const usedBytes = surface.tools.reduce((sum, tool) => {
			if (!used?.has(tool.name)) return sum;
			return sum + measureToolWireBytes(tool);
		}, 0);
		totals.set(surface.sessionId, {
			servedBytes: previous.servedBytes + servedBytes,
			usedBytes: previous.usedBytes + usedBytes,
		});
	}

	return [...totals.entries()]
		.map(([sessionId, total]) => ({
			sessionId,
			servedBytes: total.servedBytes,
			usedBytes: total.usedBytes,
			ratio: ratioOf(total.usedBytes, total.servedBytes),
		}))
		.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
};

export const summarizeUsefulTokens = (input: {
	readonly surfaces: readonly ISessionToolSurface[];
	readonly invocations: readonly IInvocationRecord[];
	readonly corePrefix?: string | undefined;
}): IUsefulTokensSummary => {
	const sessions = computeUsefulTokensSessions(input);
	const servedBytes = sessions.reduce(
		(sum, session) => sum + session.servedBytes,
		0,
	);
	const usedBytes = sessions.reduce(
		(sum, session) => sum + session.usedBytes,
		0,
	);
	return {
		sessions,
		servedBytes,
		usedBytes,
		ratio: ratioOf(usedBytes, servedBytes),
	};
};
