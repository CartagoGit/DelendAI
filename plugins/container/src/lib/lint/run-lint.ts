import { parseDockerfile } from './parse-dockerfile';
import { applyDockerfileRules } from './rules';
import type { IDockerfileLintInput, IDockerfileLintResult } from './types';

export const runLint = (
	input: IDockerfileLintInput,
): IDockerfileLintResult => ({
	kind: 'dockerfile-lint',
	findings: applyDockerfileRules(
		parseDockerfile(input.source),
		input.file ?? 'Dockerfile',
	),
});
