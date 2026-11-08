/**
 * sast-scan.helper.ts — one SAST pass as a scan result, the way
 * `security_audit` folds it into its backlog: the stack's rules through
 * the runner `security_sast` uses, and a skip with its hint when no runner
 * can work.
 */
import { toScanResult } from '@delendai/core/public';
import type { IScanResult } from '@delendai/core/public';

import type { ISecuritySastToolOptions } from '../contracts/interfaces/sast.interface';
import {
	detectStack,
	MissingCliError,
	runSastRunner,
	SAST_RULES,
} from '../sast/exports';

export const runSastScan = async (
	cwd: string,
	options: Pick<
		ISecuritySastToolOptions,
		'pluginCacheDir' | 'detectStack' | 'runSastRunner' | 'rules'
	> = {},
): Promise<IScanResult> => {
	const stack = await (options.detectStack ?? detectStack)(cwd);
	const rules = (options.rules ?? SAST_RULES).filter(
		(rule) =>
			stack.languages.includes(rule.language) ||
			rule.language === 'generic',
	);
	try {
		const result = await (options.runSastRunner ?? runSastRunner)({
			cwd,
			runner: 'auto',
			rules,
			languages: stack.languages,
			files: stack.files,
			...(options.pluginCacheDir !== undefined
				? { pluginCacheDir: options.pluginCacheDir }
				: {}),
		});
		return toScanResult('sast', result.findings);
	} catch (error) {
		if (error instanceof MissingCliError)
			return toScanResult('sast', [], {
				skipped: true,
				note: error.hint,
			});
		throw error;
	}
};
