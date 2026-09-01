import type { IDoctorCommandCheck } from '../doctor';

const REQUIRED_WORKFLOWS = ['ci.yml', 'quality-gate.yml'] as const;

export const checkCiStatus: IDoctorCommandCheck = async ({ fs }) => {
	const workflows = await fs.listDirs('.github/workflows');
	if (workflows.length === 0) {
		return {
			name: 'ci-status',
			status: 'warn',
			findings: [
				'no GitHub Actions workflow definitions found under .github/workflows',
			],
		};
	}
	const missing = REQUIRED_WORKFLOWS.filter(
		(workflow) => !workflows.includes(workflow),
	);
	const hasArtifactSnapshot = await fs.fileExists('ci/affected.json');
	const findings: string[] = [];
	if (missing.length > 0) {
		findings.push(`missing core workflow(s): ${missing.join(', ')}`);
	}
	if (!hasArtifactSnapshot) {
		findings.push(
			'ci/affected.json missing; local CI artifact snapshot unavailable',
		);
	}
	if (findings.length === 0) {
		return {
			name: 'ci-status',
			status: 'ok',
			findings: [
				`${workflows.length} workflow definition(s) present`,
				'local CI definitions are in place; remote GitHub Actions status is not queried offline',
			],
		};
	}
	return { name: 'ci-status', status: 'warn', findings };
};
