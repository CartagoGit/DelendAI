import { parseJsonc } from '@delendai/core/cli';
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type { ITestScope } from '../contracts/interfaces/impact-analysis.interface';

const SCOPES: readonly ITestScope[] = ['touched', 'reach', 'all'];

/** The scope the config under `workspaceRootAbs` asks for; touched when none. */
export const readTestScope = async (
	workspaceRootAbs: string,
): Promise<ITestScope> => {
	try {
		const config = parseJsonc(
			(
				await new SafeWorkspaceReader(workspaceRootAbs).readText(
					'delendai.config.json',
				)
			).content,
		).value as { testing?: { scope?: unknown } } | null;
		return (
			SCOPES.find((scope) => scope === config?.testing?.scope) ??
			'touched'
		);
	} catch {
		return 'touched';
	}
};
