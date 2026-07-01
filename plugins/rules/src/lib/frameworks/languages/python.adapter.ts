import type { IFileReader } from '@mcp-vertex/core/public';

import type { ILanguageAdapter } from '../contracts';

export const pythonAdapter: ILanguageAdapter = {
	id: 'py',
	priority: 30,
	async detect(reader: IFileReader, areaDir: string) {
		const manifestPath =
			areaDir === '' || areaDir === 'root'
				? 'pyproject.toml'
				: `${areaDir}/pyproject.toml`;
		if (await reader.exists(manifestPath)) {
			return {
				presetId: 'python-ruff',
				reason: 'Python (pyproject.toml)',
			};
		}
		return undefined;
	},
};
