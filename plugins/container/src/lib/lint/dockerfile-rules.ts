/**
 * dockerfile-rules.ts — f00133 S2: hadolint-style Dockerfile lint rules.
 */
import type { IFinding } from '@mcp-vertex/core/public';

import type { IDockerfileInstruction } from './dockerfile-parser';

const finding = (args: {
	readonly ruleId: string;
	readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	readonly message: string;
	readonly line: number;
	readonly fix?: string;
}): IFinding => ({
	ruleId: `dockerfile/${args.ruleId}`,
	severity: args.severity,
	message: args.message,
	location: { file: 'Dockerfile', line: args.line },
	...(args.fix !== undefined ? { fix: args.fix } : {}),
});

export const lintDockerfile = (
	instructions: readonly IDockerfileInstruction[],
): readonly IFinding[] => {
	const findings: IFinding[] = [];
	let sawUser = false;
	let sawAptGet = false;
	let sawAptGetClean = false;

	for (const inst of instructions) {
		const cmd = inst.command.toUpperCase();

		if (cmd === 'USER') {
			sawUser = true;
			if (inst.args[0] === 'root') {
				findings.push(
					finding({
						ruleId: 'DL3002-root',
						severity: 'high',
						message:
							'USER root is a no-op — drop privileges by switching to a non-root user before CMD/ENTRYPOINT.',
						line: inst.line,
					}),
				);
			}
		}

		if (cmd === 'MAINTAINER') {
			findings.push(
				finding({
					ruleId: 'DL4000-maintainer-deprecated',
					severity: 'high',
					message:
						'MAINTAINER is deprecated. Use a LABEL instead (e.g. `LABEL maintainer="you@example.com"`).',
					line: inst.line,
					fix: 'LABEL maintainer="you@example.com"',
				}),
			);
		}

		if (cmd !== 'RUN') continue;

		const joined = inst.args.join(' ').toLowerCase();
		const isAptGet = joined.includes('apt-get install');

		if (isAptGet) {
			sawAptGet = true;
			if (!joined.includes('apt-get update')) {
				findings.push(
					finding({
						ruleId: 'DL3009-no-update',
						severity: 'high',
						message:
							'apt-get install without a preceding apt-get update in the same RUN — image may carry stale packages.',
						line: inst.line,
						fix: 'Run `apt-get update && apt-get install -y ...` in the same RUN.',
					}),
				);
			}
			if (!joined.includes('--no-install-recommends')) {
				findings.push(
					finding({
						ruleId: 'DL3015-recommends',
						severity: 'medium',
						message:
							'apt-get install without --no-install-recommends — pulls unused recommended packages.',
						line: inst.line,
						fix: 'apt-get install -y --no-install-recommends ...',
					}),
				);
			}
			if (
				joined.includes('apt-get clean') ||
				joined.includes('rm -rf /var/lib/apt/lists')
			) {
				sawAptGetClean = true;
			}
		}

		if (
			joined.includes('apt-get update') &&
			!joined.includes('apt-get clean')
		) {
			findings.push(
				finding({
					ruleId: 'DL3009-no-clean',
					severity: 'medium',
					message:
						'apt-get update leaves /var/lib/apt/lists populated; clean it in the same RUN.',
					line: inst.line,
					fix: '... && rm -rf /var/lib/apt/lists/*',
				}),
			);
		}
	}

	if (sawAptGet && !sawAptGetClean) {
		findings.push(
			finding({
				ruleId: 'DL3009-clean-missing',
				severity: 'medium',
				message:
					'No `apt-get clean` (or rm -rf /var/lib/apt/lists) in any RUN — keep the layer slim.',
				line: instructions.length,
			}),
		);
	}

	if (!sawUser) {
		findings.push(
			finding({
				ruleId: 'DL3002-user-missing',
				severity: 'high',
				message:
					'No USER directive — the container will run as root. Add a USER line before CMD/ENTRYPOINT.',
				line: instructions.length,
				fix: 'USER 1000',
			}),
		);
	}

	return findings;
};
