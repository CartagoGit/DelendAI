import { describe, expect, it } from 'vitest';

import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@mcp-vertex/core/public';

import {
	buildIssueBody,
	classifyInternalError,
	extractSafeMcpFrames,
	McpVertexInternalError,
	signatureOf,
	validateSafeReport,
	validateSerializedSafeReport,
	type ISafeMcpVertexReport,
} from '../src/public/index';
import {
	asReportableError,
	buildSafeReport,
} from '../src/lib/report-builder.helper';
import {
	ALL_PRIVATE_MARKERS,
	EXPECTED_SAFE_MCP_FRAMES,
	FIXED_ENVIRONMENT_CLASS,
	FIXED_MCP_VERTEX_VERSION,
	FIXED_REPORTER_VERSION,
	FIXED_SAFE_TOOL_ID,
	PROJECT_A_FIXTURE,
	PROJECT_B_FIXTURE,
	type IAdversarialProjectFixture,
} from './adversarial-fixtures';

const INTERNAL_ERROR_CODE = 'PLUGIN_REGISTER_TIMEOUT';
const INTERNAL_COMPONENT_ID = 'createSafeReporter';
const INTERNAL_PACKAGE_ID = '@mcp-vertex/error-reporting';
const LLM_TOOL_NAME = 'mcp-vertex_orchestrator-runner_invoke';
const LLM_SPOOF_TOOL_NAME = 'acme_private_billing_orchestrator-runner_invoke';

// q00005 Track B — plan-mandated adversarial llm-suffix spoofing cases.
// Each must be blocked (or produce an identical public payload) across two
// independent host fixtures, so no raw external tool name can ever leak via
// the llm-format synthetic-frame path.
const PLAN_MANDATED_SPOOF_CASES: ReadonlyArray<{
	readonly toolName: string;
	readonly foreignPackageName: string;
	readonly errorCode: string;
	readonly reason: string;
}> = [
	{
		toolName: 'acme_private_billing_orchestrator-runner_invoke',
		foreignPackageName: '/workspace/acme/billing-tools.ts',
		errorCode: 'LLM_FORMAT',
		reason: 'invalid request body',
	},
	{
		toolName: 'cliente-secreto_auto-agent-selector_auto_run',
		foreignPackageName: '/workspace/cliente-secreto/agent-tools.ts',
		errorCode: 'LLM_FORMAT',
		reason: 'schema validation',
	},
	{
		toolName: 'JaneDoe_internal_repo_orchestrator-runner_invoke',
		foreignPackageName: '/workspace/janedoe/internal-repo-tools.ts',
		errorCode: 'LLM_FORMAT',
		reason: 'invalid json',
	},
	{
		toolName: 'ΩmegaProject_auto-agent-selector_auto_run',
		foreignPackageName: '/workspace/omegaproject/agent-tools.ts',
		errorCode: 'LLM_FORMAT',
		reason: 'malformed payload',
	},
];

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

const llmToolRegistry = registryOf({
	[LLM_TOOL_NAME]: {
		packageName: '@mcp-vertex/orchestrator-runner',
		owner: 'mcp-vertex',
		publicToolName: 'invoke',
		category: 'orchestration',
	},
});

const spoofedLlmToolRegistry = registryOf({
	[LLM_SPOOF_TOOL_NAME]: {
		packageName: '/workspace/acme/internal-tools.ts',
		owner: 'host-project',
		category: 'host-specific',
	},
});

const buildInternalError = (
	fixture: IAdversarialProjectFixture,
): McpVertexInternalError => {
	const error = new McpVertexInternalError({
		code: INTERNAL_ERROR_CODE,
		packageId: INTERNAL_PACKAGE_ID,
		componentId: INTERNAL_COMPONENT_ID,
		message: fixture.privateMessage,
	});
	error.stack = [
		`${error.name}: ${fixture.privateMessage}`,
		...fixture.stackLines,
	].join('\n');
	return error;
};

const buildArtifacts = (fixture: IAdversarialProjectFixture) => {
	const error = buildInternalError(fixture);
	const mcpFrames = extractSafeMcpFrames(error);
	const classification = classifyInternalError({
		error,
		toolId: FIXED_SAFE_TOOL_ID,
	});
	if (
		classification.packageId === undefined ||
		classification.componentId === undefined ||
		classification.errorCode === undefined
	) {
		throw new TypeError(
			'Expected a fully classified internal mcp-vertex error',
		);
	}
	const fingerprint = signatureOf({
		mcpVertexVersion: FIXED_MCP_VERTEX_VERSION,
		packageId: classification.packageId,
		componentId: classification.componentId,
		toolId: FIXED_SAFE_TOOL_ID,
		errorCode: classification.errorCode,
		failureClass: classification.failureClass,
		classification: classification.classification,
		mcpFrames,
	});
	const report: ISafeMcpVertexReport = {
		reporterVersion: FIXED_REPORTER_VERSION,
		mcpVertexVersion: FIXED_MCP_VERTEX_VERSION,
		packageId: classification.packageId,
		safeToolId: FIXED_SAFE_TOOL_ID as ISafeMcpVertexReport['safeToolId'],
		toolOwner: 'mcp-vertex',
		toolCategory: 'reporting',
		errorCode: classification.errorCode,
		failureClass: classification.failureClass,
		classification: classification.classification,
		fingerprint,
		mcpFrames,
		environmentClass: FIXED_ENVIRONMENT_CLASS,
	};
	const body = buildIssueBody(report);
	const serialized = JSON.stringify(report, null, 2);
	return {
		error,
		mcpFrames,
		classification,
		report,
		body,
		serialized,
	};
};

const buildLlmFormatArtifacts = (fixture: IAdversarialProjectFixture) => {
	const observed = {
		error: {
			code: 'LLM_FORMAT',
			reason: fixture.privateMessage,
		},
	};
	const reportable = asReportableError(
		LLM_TOOL_NAME,
		llmToolRegistry,
		observed,
	);
	if (reportable === undefined) {
		throw new TypeError('Expected llm-format failure to be reportable');
	}
	const report = buildSafeReport({
		toolName: LLM_TOOL_NAME,
		toolRegistry: llmToolRegistry,
		error: reportable,
	});
	if (report === undefined) {
		throw new TypeError('Expected llm-format report to be buildable');
	}
	return {
		report,
		body: buildIssueBody(report),
		serialized: JSON.stringify(report, null, 2),
	};
};

const assertNoPrivateLeak = (
	value: string,
	markers: readonly string[],
	label: string,
): void => {
	for (const marker of markers) {
		expect(
			value,
			`${label} leaked private marker: ${marker}`,
		).not.toContain(marker);
	}
};

describe('privacy adversarial invariant', () => {
	it('keeps fingerprint, body and serialized payload invariant across adversarial private data', () => {
		const projectA = buildArtifacts(PROJECT_A_FIXTURE);
		const projectB = buildArtifacts(PROJECT_B_FIXTURE);

		expect(extractSafeMcpFrames(projectA.error)).toEqual(
			EXPECTED_SAFE_MCP_FRAMES,
		);
		expect(extractSafeMcpFrames(projectB.error)).toEqual(
			EXPECTED_SAFE_MCP_FRAMES,
		);
		expect(projectA.mcpFrames).toEqual(EXPECTED_SAFE_MCP_FRAMES);
		expect(projectB.mcpFrames).toEqual(EXPECTED_SAFE_MCP_FRAMES);

		expect(projectA.classification).toMatchObject({
			isInternal: true,
			packageId: INTERNAL_PACKAGE_ID,
			componentId: INTERNAL_COMPONENT_ID,
			errorCode: INTERNAL_ERROR_CODE,
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: EXPECTED_SAFE_MCP_FRAMES,
			evidence: [
				'mcp-package-frame',
				'typed-internal-error',
				'mcp-vertex-error-code',
			],
		});
		expect(projectB.classification).toMatchObject({
			isInternal: true,
			packageId: INTERNAL_PACKAGE_ID,
			componentId: INTERNAL_COMPONENT_ID,
			errorCode: INTERNAL_ERROR_CODE,
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: EXPECTED_SAFE_MCP_FRAMES,
			evidence: [
				'mcp-package-frame',
				'typed-internal-error',
				'mcp-vertex-error-code',
			],
		});

		expect(validateSafeReport(projectA.report)).toEqual({ ok: true });
		expect(validateSafeReport(projectB.report)).toEqual({ ok: true });
		expect(validateSerializedSafeReport(projectA.serialized)).toEqual({
			ok: true,
		});
		expect(validateSerializedSafeReport(projectB.serialized)).toEqual({
			ok: true,
		});

		expect(projectA.report.fingerprint).toBe(projectB.report.fingerprint);
		expect(projectA.body).toBe(projectB.body);
		expect(projectA.serialized).toBe(projectB.serialized);

		assertNoPrivateLeak(projectA.body, ALL_PRIVATE_MARKERS, 'issue body A');
		assertNoPrivateLeak(projectB.body, ALL_PRIVATE_MARKERS, 'issue body B');
		assertNoPrivateLeak(
			projectA.report.fingerprint,
			ALL_PRIVATE_MARKERS,
			'fingerprint A',
		);
		assertNoPrivateLeak(
			projectB.report.fingerprint,
			ALL_PRIVATE_MARKERS,
			'fingerprint B',
		);
		assertNoPrivateLeak(
			projectA.serialized,
			ALL_PRIVATE_MARKERS,
			'serialized payload A',
		);
		assertNoPrivateLeak(
			projectB.serialized,
			ALL_PRIVATE_MARKERS,
			'serialized payload B',
		);

		expect(projectA.body).not.toContain(PROJECT_A_FIXTURE.privateMessage);
		expect(projectB.body).not.toContain(PROJECT_B_FIXTURE.privateMessage);
		expect(projectA.serialized).not.toContain(
			PROJECT_A_FIXTURE.privateMessage,
		);
		expect(projectB.serialized).not.toContain(
			PROJECT_B_FIXTURE.privateMessage,
		);
	});

	it('keeps llm-format reports invariant across hosts and never leaks private markers', () => {
		const projectA = buildLlmFormatArtifacts(PROJECT_A_FIXTURE);
		const projectB = buildLlmFormatArtifacts(PROJECT_B_FIXTURE);

		expect(validateSafeReport(projectA.report)).toEqual({ ok: true });
		expect(validateSafeReport(projectB.report)).toEqual({ ok: true });
		expect(validateSerializedSafeReport(projectA.serialized)).toEqual({
			ok: true,
		});
		expect(validateSerializedSafeReport(projectB.serialized)).toEqual({
			ok: true,
		});

		expect(projectA.report.safeToolId).toBe(
			'@mcp-vertex/orchestrator-runner.invoke',
		);
		expect(projectB.report.safeToolId).toBe(
			'@mcp-vertex/orchestrator-runner.invoke',
		);
		expect(projectA.report.fingerprint).toBe(projectB.report.fingerprint);
		expect(projectA.body).toBe(projectB.body);
		expect(projectA.serialized).toBe(projectB.serialized);

		assertNoPrivateLeak(
			projectA.body,
			ALL_PRIVATE_MARKERS,
			'llm issue body A',
		);
		assertNoPrivateLeak(
			projectB.body,
			ALL_PRIVATE_MARKERS,
			'llm issue body B',
		);
		assertNoPrivateLeak(
			projectA.serialized,
			ALL_PRIVATE_MARKERS,
			'llm serialized payload A',
		);
		assertNoPrivateLeak(
			projectB.serialized,
			ALL_PRIVATE_MARKERS,
			'llm serialized payload B',
		);
	});

	it('rejects host llm-suffix spoofing before any safe report can be built', () => {
		const reportable = asReportableError(
			LLM_SPOOF_TOOL_NAME,
			spoofedLlmToolRegistry,
			{
				error: {
					code: 'LLM_FORMAT',
					reason: PROJECT_A_FIXTURE.privateMessage,
				},
			},
		);

		expect(reportable).toBeUndefined();
	});

	describe.each(PLAN_MANDATED_SPOOF_CASES)(
		'plan-mandated adversarial case: $toolName',
		({ toolName, foreignPackageName, errorCode, reason }) => {
			// Host fixture A: the adopter registered the spoofed-suffix tool
			// under its own (non-mcp-vertex) package.
			const hostFixtureA: IToolIdentityRegistry = registryOf({
				[toolName]: {
					packageName: foreignPackageName,
					owner: 'host-project',
					category: 'host-specific',
				},
			});
			// Host fixture B: a second, independent adopter never registered
			// the tool at all — the registry has no entry for it.
			const hostFixtureB: IToolIdentityRegistry = registryOf({});

			it('blocks the report identically across two independent host fixtures', () => {
				const errorPayload = { error: { code: errorCode, reason } };

				const reportableA = asReportableError(
					toolName,
					hostFixtureA,
					errorPayload,
				);
				const reportableB = asReportableError(
					toolName,
					hostFixtureB,
					errorPayload,
				);

				// Plan invariant: identical public payload OR both blocked.
				expect(reportableA).toBeUndefined();
				expect(reportableB).toBeUndefined();
			});

			it('never lets the raw external tool name reach a public DTO if a report were somehow built', () => {
				const errorPayload = { error: { code: errorCode, reason } };
				const reportableA = asReportableError(
					toolName,
					hostFixtureA,
					errorPayload,
				);

				expect(reportableA).toBeUndefined();
				if (reportableA !== undefined) {
					const built = buildSafeReport({
						toolName,
						toolRegistry: hostFixtureA,
						error: reportableA,
					});
					if (built !== undefined) {
						expect(buildIssueBody(built)).not.toContain(toolName);
						expect(JSON.stringify(built)).not.toContain(toolName);
					}
				}
			});
		},
	);
});
