import { describe, expect, it } from 'vitest';

import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@delendai/core/public';

import {
	asReportableError,
	buildSafeReport,
} from '../src/lib/report-builder.helper';
import { buildIssueBody } from '../src/public/index';

// q00005 Track B (t00011) — plan-mandated adversarial llm-suffix spoofing
// cases. Each must be blocked (or produce an identical public payload)
// across two independent host fixtures, so no raw external tool name can
// ever leak via the llm-format synthetic-frame path. Split out of
// privacy-adversarial.spec.ts (t00009) to keep both files under the
// oversized-file SRP ceiling (lint:solid, 400 LOC).
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

describe('privacy adversarial invariant — llm-suffix spoofing (t00011)', () => {
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
