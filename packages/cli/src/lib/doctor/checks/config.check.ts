import type { DoctorCheck } from '../types';

export const checkConfig: DoctorCheck = async ({ fs }) => {
	const path = 'delendai.config.json';
	const text = await fs.readFile(path);
	if (text === undefined) {
		return {
			name: 'config',
			status: 'warn',
			findings: [`${path} not found; server defaults are active`],
		};
	}
	try {
		JSON.parse(text);
		return {
			name: 'config',
			status: 'ok',
			findings: [`${path} is valid JSON`],
		};
	} catch {
		return {
			name: 'config',
			status: 'warn',
			findings: [`${path} is not valid JSON`],
		};
	}
};
