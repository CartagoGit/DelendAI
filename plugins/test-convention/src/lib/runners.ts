import type { IFileReader } from '@mcp-vertex/core/public';

export type RunnerName = 'vitest' | 'jest' | 'unknown';

export interface IRunnerInfo {
	readonly name: RunnerName;
	readonly mockApi: 'vi' | 'jest';
	/** Short label of which file/script proved it (for audit). */
	readonly evidence: string;
}

/**
 * Detect the project's test runner by looking at config files and
 * the `test` script. Pure over `reader` — the host injects the
 * reader; the engine never touches the filesystem directly.
 */
export const detectRunner = async (
	reader: IFileReader,
): Promise<IRunnerInfo> => {
	for (const candidate of [
		'vitest.config.ts',
		'vitest.config.mts',
		'vitest.config.js',
	]) {
		if (await reader.exists(candidate)) {
			return { name: 'vitest', mockApi: 'vi', evidence: candidate };
		}
	}
	for (const candidate of ['jest.config.ts', 'jest.config.js']) {
		if (await reader.exists(candidate)) {
			return { name: 'jest', mockApi: 'jest', evidence: candidate };
		}
	}
	const pkg = await reader.readFile('package.json');
	if (pkg !== undefined) {
		try {
			const scripts = (
				JSON.parse(pkg) as { scripts?: Record<string, string> }
			).scripts;
			if (scripts?.test?.includes('vitest')) {
				return {
					name: 'vitest',
					mockApi: 'vi',
					evidence: 'scripts.test',
				};
			}
			if (scripts?.test?.includes('jest')) {
				return {
					name: 'jest',
					mockApi: 'jest',
					evidence: 'scripts.test',
				};
			}
		} catch {
			// fall through to unknown
		}
	}
	return { name: 'unknown', mockApi: 'jest', evidence: 'none' };
};
