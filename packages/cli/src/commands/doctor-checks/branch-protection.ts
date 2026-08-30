import type { IDoctorCommandCheck } from '../doctor';

const matchesBranch = (text: string, branch: string): string | undefined => {
	const escaped = branch.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const block = text.match(
		new RegExp(
			`name:\\s*['"]${escaped}['"][\\s\\S]*?(?=name:\\s*['"]|$)`,
			'u',
		),
	);
	return block?.[0];
};

export const checkBranchProtection: IDoctorCommandCheck = async ({ fs }) => {
	const path = '.github/branch-protection.ts';
	const text = await fs.readFile(path);
	if (text === undefined) {
		return {
			name: 'branch-protection',
			status: 'warn',
			findings: [
				`${path} not found; local branch policy cannot be verified`,
			],
		};
	}
	const developBlock = matchesBranch(text, 'develop');
	const mainBlock = matchesBranch(text, 'main');
	const findings: string[] = [];
	if (developBlock === undefined)
		findings.push('develop branch policy missing');
	if (mainBlock === undefined) findings.push('main branch policy missing');
	if (
		developBlock !== undefined &&
		!/protected:\s*false/u.test(developBlock)
	) {
		findings.push('develop should stay unprotected in the local policy');
	}
	if (mainBlock !== undefined && !/protected:\s*true/u.test(mainBlock)) {
		findings.push('main must be protected in the local policy');
	}
	if (
		mainBlock !== undefined &&
		!/required_checks:\s*\[[\s\S]*?['"]ci-complete['"]/u.test(mainBlock)
	) {
		findings.push('main must require ci-complete in the local policy');
	}
	if (findings.length === 0) {
		return {
			name: 'branch-protection',
			status: 'ok',
			findings: [
				'local branch policy covers develop and main with the expected protection contract',
			],
		};
	}
	return { name: 'branch-protection', status: 'warn', findings };
};
