import type { IMcpToolWireDefinition } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import {
	computeUsefulTokensSessions,
	summarizeUsefulTokens,
	type ISessionToolSurface,
} from '../src/lib/useful-tokens.service';
import type { IInvocationRecord } from '../src/lib/types';

const tool = (
	name: string,
	description = `${name} description`,
): IMcpToolWireDefinition => ({
	name,
	description,
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: `${name} query` },
		},
	},
});

const record = (
	sessionId: string,
	plugin: string,
	toolName: string,
): IInvocationRecord => ({
	ts: '2026-08-30T00:00:00.000Z',
	sessionId,
	agent: { id: 'copilot', kind: 'copilot', extension: 'vscode-copilot' },
	plugin,
	tool: toolName,
	model: null,
	usage: null,
	responseBytes: 0,
	costUsd: null,
	tokensSaved: 0,
	durationMs: 1,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	autoBypassed: false,
});

describe('useful-tokens service', () => {
	it('returns 0 when a served session never invokes any served tool', () => {
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-zero',
				tools: [
					tool('mcp-vertex_search_search'),
					tool('mcp-vertex_docs_docs_list'),
				],
			},
		];

		expect(
			computeUsefulTokensSessions({ surfaces, invocations: [] }),
		).toEqual([
			expect.objectContaining({
				sessionId: 's-zero',
				usedBytes: 0,
				ratio: 0,
			}),
		]);
	});

	it('returns 1 when every served tool is invoked in the session', () => {
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-full',
				tools: [
					tool('mcp-vertex_overview'),
					tool('mcp-vertex_proposals_auto_work'),
				],
			},
		];
		const invocations = [
			record('s-full', 'core', 'overview'),
			record('s-full', 'proposals', 'auto_work'),
		];

		const [session] = computeUsefulTokensSessions({
			surfaces,
			invocations,
		});
		expect(session).toBeDefined();
		expect(session?.usedBytes).toBe(session?.servedBytes);
		expect(session?.ratio).toBe(1);
	});

	it('computes bytes-based partial usage instead of a raw tool count ratio', () => {
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-partial',
				tools: [
					tool('mcp-vertex_search_search', 'short'),
					tool(
						'mcp-vertex_docs_docs_list',
						'this description is intentionally much longer so byte weight differs materially',
					),
					tool('mcp-vertex_memory_recall', 'medium description'),
				],
			},
		];
		const invocations = [record('s-partial', 'docs', 'docs_list')];

		const [session] = computeUsefulTokensSessions({
			surfaces,
			invocations,
		});
		expect(session).toBeDefined();
		expect(session?.usedBytes).toBeGreaterThan(0);
		expect(session?.usedBytes).toBeLessThan(session?.servedBytes ?? 0);
		expect(session?.ratio).toBeCloseTo(
			(session?.usedBytes ?? 0) / (session?.servedBytes ?? 1),
			10,
		);
		expect(session?.ratio).not.toBeCloseTo(1 / 3, 4);
	});

	it('isolates used tool matching by sessionId when different sessions serve the same wire name', () => {
		const sharedTool = tool('mcp-vertex_logs_search');
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-invoked',
				tools: [sharedTool],
			},
			{
				sessionId: 's-idle',
				tools: [sharedTool],
			},
		];
		const sessions = computeUsefulTokensSessions({
			surfaces,
			invocations: [record('s-invoked', 'logs', 'search')],
		});

		expect(sessions).toEqual([
			expect.objectContaining({
				sessionId: 's-idle',
				usedBytes: 0,
				ratio: 0,
			}),
			expect.objectContaining({
				sessionId: 's-invoked',
				usedBytes: expect.any(Number),
				ratio: 1,
			}),
		]);
		expect(sessions[1]?.usedBytes).toBe(sessions[1]?.servedBytes);
	});

	it('matches core tools against a configurable corePrefix', () => {
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-custom-prefix',
				tools: [tool('acme_overview')],
			},
		];
		const invocations = [record('s-custom-prefix', 'core', 'overview')];

		const [session] = computeUsefulTokensSessions({
			surfaces,
			invocations,
			corePrefix: 'acme',
		});
		expect(session).toBeDefined();
		expect(session?.usedBytes).toBe(session?.servedBytes);
		expect(session?.ratio).toBe(1);

		const [defaultPrefixSession] = computeUsefulTokensSessions({
			surfaces,
			invocations,
		});
		expect(defaultPrefixSession).toBeDefined();
		expect(defaultPrefixSession?.usedBytes).toBe(0);
		expect(defaultPrefixSession?.ratio).toBe(0);
	});

	it('accumulates repeated served surfaces within the same session before aggregating', () => {
		const surfaces: ISessionToolSurface[] = [
			{
				sessionId: 's-repeat',
				tools: [tool('mcp-vertex_overview')],
			},
			{
				sessionId: 's-repeat',
				tools: [
					tool('mcp-vertex_overview'),
					tool('mcp-vertex_search_search'),
				],
			},
			{
				sessionId: 's-other',
				tools: [tool('mcp-vertex_memory_recall')],
			},
		];
		const invocations = [
			record('s-repeat', 'core', 'overview'),
			record('s-other', 'memory', 'recall'),
		];

		const summary = summarizeUsefulTokens({ surfaces, invocations });
		expect(summary.sessions).toHaveLength(2);
		expect(summary.servedBytes).toBe(
			summary.sessions.reduce(
				(sum, session) => sum + session.servedBytes,
				0,
			),
		);
		expect(summary.usedBytes).toBe(
			summary.sessions.reduce(
				(sum, session) => sum + session.usedBytes,
				0,
			),
		);
		expect(summary.ratio).toBeCloseTo(
			summary.usedBytes / summary.servedBytes,
			10,
		);
	});
});
