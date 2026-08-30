import type { DoctorCheck } from '../types';

export const checkPluginGraph: DoctorCheck = async ({ fs }) => {
	const plugins = await fs.listDirs('plugins');
	if (plugins.length === 0)
		return {
			name: 'plugin-graph',
			status: 'warn',
			findings: ['no plugins found'],
		};
	const known = new Set(plugins.map((name) => `@mcp-vertex/${name}`));
	const dangling: string[] = [];
	for (const plugin of plugins) {
		const text = await fs.readFile(`plugins/${plugin}/package.json`);
		if (text === undefined) continue;
		try {
			const pkg = JSON.parse(text) as {
				dependencies?: Record<string, string>;
			};
			for (const dependency of Object.keys(pkg.dependencies ?? {})) {
				if (
					dependency.startsWith('@mcp-vertex/') &&
					!known.has(dependency) &&
					dependency !== '@mcp-vertex/core'
				)
					dangling.push(`${plugin}->${dependency}`);
			}
		} catch {
			dangling.push(`${plugin}->invalid package.json`);
		}
	}
	return dangling.length === 0
		? {
				name: 'plugin-graph',
				status: 'ok',
				findings: [
					`${plugins.length} plugin nodes have no dangling workspace dependencies`,
				],
			}
		: {
				name: 'plugin-graph',
				status: 'warn',
				findings: [
					`dangling workspace dependencies: ${dangling.join(', ')}`,
				],
			};
};
