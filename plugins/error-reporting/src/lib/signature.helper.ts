/**
 * Pure safe-report shaping helpers for the auto-reporting plugin.
 * Everything here is side-effect free so the classification,
 * fingerprint and body logic are unit-testable without touching a real
 * process, the filesystem or the network.
 */
import { createHash } from 'node:crypto';

import {
	McpVertexInternalError,
	type ISafeMcpVertexReport,
	type IssueClassification,
	type SafeFailureClass,
} from './contracts/interfaces/reporter.interface';
import type { ISafeFingerprintInput } from './contracts/interfaces/signature.interface';
import { extractSafeMcpFrames } from './frame-extractor.helper';

const MAX_TITLE_LENGTH = 180;

const packageRank = (value: string): number => {
	if (value.startsWith('@mcp-vertex/error-reporting/')) return 0;
	if (value.startsWith('@mcp-vertex/core/')) return 1;
	if (value.startsWith('@mcp-vertex/')) return 2;
	return 3;
};

/** True when the failure appears to originate inside mcp-vertex. */
export const isMcpVertexInternal = (error: unknown): boolean => {
	if (error instanceof McpVertexInternalError) return true;
	if (extractSafeMcpFrames(error).length > 0) return true;
	if (typeof error === 'object' && error !== null) {
		const record = error as {
			code?: unknown;
			mcpVertexErrorCode?: unknown;
		};
		return (
			typeof record.code === 'string' ||
			typeof record.mcpVertexErrorCode === 'string'
		);
	}
	return false;
};

export const safeFailureClassOf = (error: unknown): SafeFailureClass => {
	if (error instanceof McpVertexInternalError) {
		if (error.code.includes('TIMEOUT')) return 'INTERNAL_TIMEOUT';
		if (error.code.includes('VALID')) return 'INTERNAL_VALIDATION_ERROR';
		return 'INTERNAL_TYPED_ERROR';
	}
	if (error instanceof Error) {
		if (error.name === 'TimeoutError') return 'INTERNAL_TIMEOUT';
		if (error.name.includes('Validation'))
			return 'INTERNAL_VALIDATION_ERROR';
		return 'INTERNAL_RUNTIME_ERROR';
	}
	return 'UNKNOWN_INTERNAL';
};

export const classificationOf = (input: {
	readonly toolId?: string | undefined;
	readonly errorCode?: string | undefined;
	readonly failureClass: SafeFailureClass;
}): IssueClassification => {
	const haystack =
		`${input.toolId ?? ''} ${input.errorCode ?? ''} ${input.failureClass}`.toUpperCase();
	if (haystack.includes('PRIVACY')) return 'PRIVACY';
	if (haystack.includes('SECURITY') || haystack.includes('SECRET')) {
		return 'SECURITY';
	}
	if (haystack.includes('TOKEN')) return 'TOKEN_REGRESSION';
	if (
		haystack.includes('PERF') ||
		haystack.includes('TIMEOUT') ||
		haystack.includes('LATENCY')
	) {
		return 'PERFORMANCE';
	}
	if (haystack.includes('DOC')) return 'DOC_DRIFT';
	if (haystack.includes('CONFIG')) return 'CONFIG_DRIFT';
	return 'BUG';
};

export const signatureOf = (input: ISafeFingerprintInput): string => {
	const firstFrame = [...input.mcpFrames].sort(
		(left, right) => packageRank(left.file) - packageRank(right.file),
	)[0]?.file;
	return createHash('sha256')
		.update(
			JSON.stringify({
				packageId: input.packageId,
				toolId: input.toolId ?? null,
				errorCode: input.errorCode ?? null,
				failureClass: input.failureClass,
				classification: input.classification,
				topFrame: firstFrame ?? null,
			}),
		)
		.digest('hex');
};

const truncate = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Issue title built only from controlled, internal-safe vocabulary. */
export const buildIssueTitle = (report: ISafeMcpVertexReport): string =>
	truncate(
		`[auto] ${report.classification} ${report.packageId}${report.errorCode !== undefined ? `: ${report.errorCode}` : ''}`,
		MAX_TITLE_LENGTH,
	);

/** Full markdown body built from the safe DTO only. */
export const buildIssueBody = (report: ISafeMcpVertexReport): string => {
	const lines: string[] = [
		'## Automatic error report',
		'',
		'This issue was opened automatically by `@mcp-vertex/error-reporting` ' +
			'after an mcp-vertex internal failure was reduced to a safe DTO.',
		'',
		'| Field | Value |',
		'| --- | --- |',
		`| Package | \`${report.packageId}\` |`,
		`| Reporter version | \`${report.reporterVersion}\` |`,
		`| MCP Vertex version | \`${report.mcpVertexVersion}\` |`,
		`| Classification | \`${report.classification}\` |`,
		`| Failure class | \`${report.failureClass}\` |`,
		`| Fingerprint | \`${report.fingerprint}\` |`,
	];
	if (report.toolId !== undefined) {
		lines.push(`| Tool | \`${report.toolId}\` |`);
	}
	if (report.errorCode !== undefined) {
		lines.push(`| Error code | \`${report.errorCode}\` |`);
	}
	if (report.environmentClass !== undefined) {
		lines.push(
			`| Environment | runtime=${report.environmentClass.runtime}, platform=${report.environmentClass.platformFamily} |`,
		);
	}
	if (report.mcpFrames.length > 0) {
		lines.push(
			'',
			'## MCP Vertex frames',
			'',
			'```text',
			...report.mcpFrames.map((frame) => {
				const suffix =
					frame.line !== undefined
						? `:${frame.line}${frame.col !== undefined ? `:${frame.col}` : ''}`
						: '';
				return `${frame.file}${suffix}${frame.fn !== undefined ? ` ${frame.fn}` : ''}`;
			}),
			'```',
		);
	}
	if (report.syntheticExample !== undefined) {
		lines.push(
			'',
			'## Synthetic example',
			'',
			'```json',
			JSON.stringify(report.syntheticExample, null, 2),
			'```',
		);
	}
	lines.push(
		'',
		'## Safe report payload',
		'',
		'```json',
		JSON.stringify(report, null, 2),
		'```',
		'',
		'## How to disable',
		'',
		'```jsonc',
		'{ "plugins": { "error-reporting": { "options": { "enabled": false } } } }',
		'```',
	);
	return `${lines.join('\n').trim()}\n`;
};
