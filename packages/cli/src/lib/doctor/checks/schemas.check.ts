import type { DoctorCheck } from '../types';

export const checkSchemas: DoctorCheck = async ({ fs }) => {
	const plugins = await fs.listDirs('plugins');
	let schemaFiles = 0;
	for (const plugin of plugins) {
		const files = await fs.listDirs(`plugins/${plugin}/src`);
		if (files.some((file) => file.includes('schema'))) schemaFiles += 1;
	}
	return {
		name: 'schemas',
		status: schemaFiles > 0 ? 'ok' : 'warn',
		findings:
			schemaFiles > 0
				? [`${schemaFiles} plugin source tree(s) expose schema files`]
				: ['schema inventory unavailable; validation skipped'],
	};
};
