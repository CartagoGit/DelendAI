import { CorruptFileError, toolError } from '@delendai/core/public';
import type { IToolTextResult } from '@delendai/core/public';

export const guardCorruptStore = async (
	fn: () => IToolTextResult | Promise<IToolTextResult>,
): Promise<IToolTextResult> => {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof CorruptFileError) {
			return toolError(
				`memory store is corrupt: ${error.message}`,
				error.backupPath
					? `The corrupt file was preserved at "${error.backupPath}". Inspect or delete it, then retry.`
					: 'Could not back up the corrupt store; inspect it manually before retrying.',
			);
		}
		throw error;
	}
};
