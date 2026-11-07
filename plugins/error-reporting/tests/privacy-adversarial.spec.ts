import { describe, expect, it } from 'vitest';

import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@delendai/core/public';

// Full q00005 Track B (t00011) plan-mandated adversarial coverage (4 named
// spoofing cases x 2 host fixtures each) lives in
// privacy-adversarial-llm-suffix-spoofing.spec.ts — split out to keep both
// files under lint:solid's oversized-file SRP ceiling.

import {
	buildIssueBody,
	classifyInternalError,
	extractSafeMcpFrames,
	DelendaiInternalError,
	signatureOf,
	validateSafeReport,
	validateSerializedSafeReport,
	type ISafeDelendaiReport,
} from '../src/public/index';
import {
	asReportableError,
	buildSafeReport,
} from '../src/lib/report-builder.helper';
import {
	ALL_PRIVATE_MARKERS,
	EXPECTED_SAFE_MCP_FRAMES,
	FIXED_ENVIRONMENT_CLASS,
	FIXED_DELENDAI_VERSION,
	FIXED_REPORTER_VERSION,
	FIXED_SAFE_TOOL_ID,
	PROJECT_A_FIXTURE,
	PROJECT_B_FIXTURE,
	type IAdversarialProjectFixture,
} from './adversarial-fixtures';

const INTERNAL_ERROR_CODE = 'PLUGIN_REGISTER_TIMEOUT';
const INTERNAL_COMPONENT_ID = 'createSafeReporter';
const INTERNAL_PACKAGE_ID = '@delendai/error-reporting';
const LLM_TOOL_NAME = 'delendai_orchestrator-runner_invoke';
const LLM_SPOOF_TOOL_NAME = 'acme_private_billing_orchestrator-runner_invoke';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

const llmToolRegistry = registryOf({
	[LLM_TOOL_NAME]: {
		packageName: '@delendai/orchestrator-runner',
		owner: 'delendai',
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
): DelendaiInternalError => {
	const error = new DelendaiInternalError({
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
			'Expected a fully classified internal delendai error',
		);
	}
	const fingerprint = signatureOf({
		delendaiVersion: FIXED_DELENDAI_VERSION,
		packageId: classification.packageId,
		componentId: classification.componentId,
		toolId: FIXED_SAFE_TOOL_ID,
		errorCode: classification.errorCode,
		failureClass: classification.failureClass,
		classification: classification.classification,
		mcpFrames,
	});
	const report: ISafeDelendaiReport = {
		reporterVersion: FIXED_REPORTER_VERSION,
		delendaiVersion: FIXED_DELENDAI_VERSION,
		packageId: classification.packageId,
		safeToolId: FIXED_SAFE_TOOL_ID as ISafeDelendaiReport['safeToolId'],
		toolOwner: 'delendai',
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
				'delendai-error-code',
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
				'delendai-error-code',
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
			'@delendai/orchestrator-runner.invoke',
		);
		expect(projectB.report.safeToolId).toBe(
			'@delendai/orchestrator-runner.invoke',
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
});
