import { basename, dirname } from 'node:path';

import { SafeWorkspaceReader } from './safe-workspace-reader';

export const readAbsoluteTextSafe = async (
	absolutePath: string,
): Promise<string> =>
	(
		await new SafeWorkspaceReader(dirname(absolutePath)).readText(
			basename(absolutePath),
		)
	).content;
