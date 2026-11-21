/**
 * deep-checks — the registry of slower checks `doctor --deep` adds.
 *
 * Growing `--deep` means adding an entry to `defaultDeepChecks`; the command
 * does not change. The first entry runs the error-reporting self-test.
 * It cannot open an issue: the self-test refuses `gh issue create`, and
 * its `gh` checks only run when the network is allowed.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	ERROR_REPORTING_PUBLIC_MODULE,
	ERROR_REPORTING_SELF_TEST_SECTION,
	SELF_TEST_PROBE_DIR_PREFIX,
	SELF_TEST_TARGET_REPO,
} from '../../contracts/constants/doctor-modes.constant';
import type {
	IDeepCheck,
	IErrorReportingSelfTestCheck,
	IErrorReportingSelfTestLoader,
	IErrorReportingSelfTestRunner,
} from '../../contracts/interfaces/doctor-modes.interface';
import type { IDoctorSection } from './types';

/**
 * Imports the plugin by a computed specifier: the CLI has no static
 * dependency on a plugin, and a build without it must degrade to a
 * reported skip rather than fail to load.
 */
export const loadErrorReportingSelfTest: IErrorReportingSelfTestLoader =
	async () => {
		try {
			const specifier = ERROR_REPORTING_PUBLIC_MODULE;
			const mod = (await import(specifier)) as {
				readonly runErrorReportingSelfTest?: IErrorReportingSelfTestRunner;
			};
			return mod.runErrorReportingSelfTest;
		} catch {
			return undefined;
		}
	};

const noopReportObservedFailure = async (): Promise<void> => undefined;

const describeCheck = (check: IErrorReportingSelfTestCheck): string => {
	if (check.skipped === true) {
		return `skipped: ${check.id}${check.detail !== undefined ? ` (${check.detail})` : ''}`;
	}
	if (check.ok) return `ok: ${check.id}`;
	return `failed: ${check.id}${check.detail !== undefined ? ` (${check.detail})` : ''}`;
};

export const createErrorReportingSelfTestCheck = (
	load: IErrorReportingSelfTestLoader = loadErrorReportingSelfTest,
): IDeepCheck => ({
	id: ERROR_REPORTING_SELF_TEST_SECTION,
	// The plugin's own checks are local; only its optional `gh` probes
	// need the network, and offline they are passed as `live: false` and
	// come back marked skipped.
	requiresNetwork: false,
	run: async ({ offline }): Promise<IDoctorSection> => {
		const runner = await load();
		if (runner === undefined) {
			return {
				name: ERROR_REPORTING_SELF_TEST_SECTION,
				status: 'warn',
				findings: [
					'skipped: the error-reporting plugin could not be loaded, so its self-test did not run',
				],
			};
		}
		const probeDirAbs = await mkdtemp(
			join(tmpdir(), SELF_TEST_PROBE_DIR_PREFIX),
		);
		try {
			const result = await runner({
				reportObservedFailure: noopReportObservedFailure,
				probeDirAbs,
				targetRepo: SELF_TEST_TARGET_REPO,
				live: !offline,
			});
			return {
				name: ERROR_REPORTING_SELF_TEST_SECTION,
				status: result.ok ? 'ok' : 'error',
				findings: result.checks.map(describeCheck),
			};
		} catch (error) {
			return {
				name: ERROR_REPORTING_SELF_TEST_SECTION,
				status: 'error',
				findings: [
					`the self-test itself failed: ${error instanceof Error ? error.message : String(error)}`,
				],
			};
		} finally {
			await rm(probeDirAbs, { recursive: true, force: true });
		}
	},
});

export const defaultDeepChecks = (): readonly IDeepCheck[] => [
	createErrorReportingSelfTestCheck(),
];
