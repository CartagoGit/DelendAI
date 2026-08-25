import { describe, expect, it } from 'vitest';

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
});
