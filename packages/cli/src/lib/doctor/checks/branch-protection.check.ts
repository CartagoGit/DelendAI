import type { DoctorCheck } from '../types';

export const checkBranchProtection: DoctorCheck = async ({ fs }) => {
	const text = await fs.readFile('.github/branch-protection.yml');
	if (text === undefined)
		return {
			name: 'branch-protection',
			status: 'warn',
			findings: ['branch protection policy file not found'],
		};
	const missing = ['main', 'develop'].filter(
		(branch) => !text.includes(branch),
	);
	return missing.length === 0
		? {
				name: 'branch-protection',
				status: 'ok',
				findings: ['main and develop are present in the local policy'],
			}
		: {
				name: 'branch-protection',
				status: 'warn',
				findings: [`policy does not mention: ${missing.join(', ')}`],
			};
};
