import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';

import { writeFileAtomic } from '@mcp-vertex/core/public';

import type {
	ISelfTestCheck,
	ISelfTestResult,
} from './contracts/interfaces/self-test.interface';
import type { IRunErrorReportingSelfTestInput } from './contracts/interfaces/self-test.interface';
import type { IIssueExec } from './contracts/interfaces/reporter.interface';
import { ISSUE_CLASSIFICATIONS } from './contracts/interfaces/reporter.interface';
import { registerInternalRuntimePaths } from './frame-extractor.helper';
import {
	asReportableError,
	buildSafeReport,
	extractObservedFailure,
	withSyntheticSafeStack,
} from './report-builder.helper';
import {
	validateSafeReport,
	validateSerializedSafeReport,
} from './privacy-validator.helper';
import { McpVertexInternalError } from './mcp-internal-error.helper';
import { ghIssueExec } from './reporter.service';
import { DEFAULT_TARGET_REPO } from './contracts/constants/options.constant';

const EMPTY_TOOL_REGISTRY = { get: () => undefined, list: () => new Map() };

const SELF_TEST_PACKAGE_ID = '@mcp-vertex/error-reporting';
const SELF_TEST_COMPONENT_ID = 'self-test/synthetic-failure';
const SELF_TEST_TOOL_NAME = 'error-reporting_self_test';
const PROBE_FILE_NAME = '.selftest-probe.json';

/** Fabricates the same synthetic-internal-error shape the plugin already
 * relies on for lifecycle errors (`withSyntheticSafeStack`) — no real
 * failure needs to happen for this check to prove the pipeline works. */
const buildSyntheticFailure = (): McpVertexInternalError =>
	withSyntheticSafeStack(
		new McpVertexInternalError({
			code: 'TOOL_EXECUTION_FAILED',
			packageId: SELF_TEST_PACKAGE_ID,
			componentId: SELF_TEST_COMPONENT_ID,
			message: 'self-test synthetic failure — never a real bug',
		}),
		SELF_TEST_PACKAGE_ID,
		SELF_TEST_COMPONENT_ID,
	);

/** Guards the exec seam so a self-test can never dispatch a real issue,
 * regardless of what argv the checks below end up building. Asserted in
 * tests by passing a spy `exec` and checking it is never called this way. */
const guardReadOnlyGhCall = (argv: readonly string[]): void => {
	if (argv[0] === 'issue' && argv[1] === 'create') {
		throw new Error(
			'self-test attempted `gh issue create` — this must never happen',
		);
	}
};

const runGhCheck = async (input: {
	readonly id:
		| 'gh-installed'
		| 'gh-authenticated'
		| 'target-repo-reachable'
		| 'issue-create-permission-available';
	readonly argv: readonly string[];
	readonly exec: IIssueExec;
	readonly expectStdout?: (stdout: string) => boolean;
}): Promise<ISelfTestCheck> => {
	guardReadOnlyGhCall(input.argv);
	try {
		const run = await input.exec(input.argv);
		const ok = run.ok && (input.expectStdout?.(run.stdout) ?? true);
		return ok
			? { id: input.id, ok: true }
			: {
					id: input.id,
					ok: false,
					detail:
						run.stderr.trim() !== ''
							? run.stderr.trim()
							: `exit ${run.code}`,
				};
	} catch (error) {
		return {
			id: input.id,
			ok: false,
			detail: error instanceof Error ? error.message : 'unknown error',
		};
	}
};

/**
 * AUD-G01: lets `mcpv doctor --deep error-reporting` (once wired — see
 * plugin README) answer "is this plugin working?" without ever creating
 * a GitHub issue. Runs the real classification/privacy pipeline against
 * a synthetic failure and, only with `live: true`, four read-only `gh`
 * checks. Every check is independent and never throws out of this
 * function — a self-test that itself crashes would defeat the purpose.
 */
export const runErrorReportingSelfTest = async (
	input: IRunErrorReportingSelfTestInput,
): Promise<ISelfTestResult> => {
	registerInternalRuntimePaths(import.meta.url);
	const checks: ISelfTestCheck[] = [];

	checks.push({ id: 'plugin-loaded', ok: true });
	checks.push({
		id: 'hook-registered',
		ok: typeof input.reportObservedFailure === 'function',
	});

	const synthetic = buildSyntheticFailure();
	const observed = extractObservedFailure(undefined, synthetic);
	const reportable =
		observed !== undefined
			? asReportableError(
					SELF_TEST_TOOL_NAME,
					EMPTY_TOOL_REGISTRY,
					observed,
				)
			: undefined;
	checks.push({
		id: 'synthetic-failure-observed',
		ok: reportable !== undefined,
		...(reportable === undefined
			? {
					detail: 'origin analysis did not classify the synthetic failure as mcp-vertex-internal',
				}
			: {}),
	});

	const report =
		reportable !== undefined
			? buildSafeReport({
					toolName: SELF_TEST_TOOL_NAME,
					toolRegistry: EMPTY_TOOL_REGISTRY,
					error: reportable,
				})
			: undefined;
	checks.push({
		id: 'classification-pipeline-working',
		ok:
			report !== undefined &&
			ISSUE_CLASSIFICATIONS.includes(report.classification),
		...(report === undefined
			? {
					detail: 'buildSafeReport returned undefined for a known-internal synthetic error',
				}
			: {}),
	});

	if (report !== undefined) {
		const positive = validateSafeReport(report);
		const negative = validateSerializedSafeReport(
			JSON.stringify({
				...report,
				safeToolId: 'leak@attacker.example.com',
			}),
		);
		const ok = positive.ok && !negative.ok;
		checks.push({
			id: 'privacy-validation-working',
			ok,
			...(!ok
				? {
						detail: !positive.ok
							? `validator rejected a known-safe report: ${positive.reasonCode ?? 'unknown'}`
							: 'validator accepted an injected email address',
					}
				: {}),
		});
	} else {
		checks.push({
			id: 'privacy-validation-working',
			ok: false,
			detail: 'no safe report to validate — classification pipeline failed first',
		});
	}

	const probePath = join(input.probeDirAbs, PROBE_FILE_NAME);
	try {
		const probeValue = `self-test-${Date.now()}`;
		await writeFileAtomic(probePath, probeValue);
		const readBack = await readFile(probePath, 'utf8');
		await rm(probePath, { force: true });
		checks.push({
			id: 'report-store-writable',
			ok: readBack === probeValue,
			...(readBack !== probeValue
				? { detail: 'probe file content did not round-trip' }
				: {}),
		});
	} catch (error) {
		checks.push({
			id: 'report-store-writable',
			ok: false,
			detail: error instanceof Error ? error.message : 'unknown error',
		});
	}

	const live = input.live ?? false;
	const exec = input.exec ?? ghIssueExec;
	const ghChecks: readonly {
		readonly id:
			| 'gh-installed'
			| 'gh-authenticated'
			| 'target-repo-reachable'
			| 'issue-create-permission-available';
		readonly argv: readonly string[];
		readonly expectStdout?: (stdout: string) => boolean;
	}[] = [
		{ id: 'gh-installed', argv: ['--version'] },
		{ id: 'gh-authenticated', argv: ['auth', 'status'] },
		{
			id: 'target-repo-reachable',
			argv: ['repo', 'view', DEFAULT_TARGET_REPO, '--json', 'name'],
		},
		{
			id: 'issue-create-permission-available',
			argv: [
				'api',
				`repos/${DEFAULT_TARGET_REPO}`,
				'--jq',
				'.permissions.push',
			],
			expectStdout: (stdout) => stdout.trim() === 'true',
		},
	];
	for (const ghCheck of ghChecks) {
		checks.push(
			live
				? await runGhCheck({ ...ghCheck, exec })
				: {
						id: ghCheck.id,
						ok: true,
						skipped: true,
						detail: 'pass live: true to exercise gh transport',
					},
		);
	}

	return { ok: checks.every((check) => check.ok), checks };
};
