import type { DoctorCheck } from '../types';

export const checkTokenBudgets: DoctorCheck = async ({ fs }) => {
	const candidates = [
		'config/metrics-baseline.json',
		'config/token-budgets.json',
	];
	for (const path of candidates) {
		const text = await fs.readFile(path);
		if (text === undefined) continue;
		try {
			JSON.parse(text);
			return {
				name: 'token-budgets',
				status: 'ok',
				findings: [`${path} is parseable`],
			};
		} catch {
			return {
				name: 'token-budgets',
				status: 'warn',
				findings: [`${path} is not parseable`],
			};
		}
	}
	return {
		name: 'token-budgets',
		status: 'warn',
		findings: [
			'token budget snapshot not found; budget validation skipped',
		],
	};
};
