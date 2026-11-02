import type { IDockerfileFinding, IDockerfileInstruction } from './types';

const finding = (
	file: string,
	line: number,
	ruleId: string,
	severity: IDockerfileFinding['severity'],
	message: string,
	fix?: string,
): IDockerfileFinding => ({
	ruleId,
	severity,
	message,
	...(fix === undefined ? {} : { fix }),
	location: { file, line },
});

const extractFromImage = (args: string): string | undefined => {
	const parts = args
		.trim()
		.split(/\s+/u)
		.filter((part) => part.length > 0);
	const relevant = parts.filter((part) => !part.startsWith('--'));
	if (relevant.length === 0) return undefined;
	return relevant[0];
};

const hasPinnedTag = (image: string): boolean => {
	if (image === 'scratch' || image.includes('@')) return true;
	const lastSlash = image.lastIndexOf('/');
	const lastColon = image.lastIndexOf(':');
	if (lastColon <= lastSlash) return false;
	const tag = image.slice(lastColon + 1);
	return tag !== '' && tag !== 'latest';
};

const hasAptInstallWithoutUpdate = (args: string): boolean => {
	const normalized = args.toLowerCase();
	return (
		/\bapt-get\s+install\b/u.test(normalized) &&
		!/\bapt-get\s+update\b/u.test(normalized)
	);
};

const usesShellForm = (args: string): boolean => !args.trim().startsWith('[');

const hasApkAddWithoutNoCache = (args: string): boolean => {
	const normalized = args.toLowerCase();
	return (
		/\bapk\s+add\b/u.test(normalized) && !normalized.includes('--no-cache')
	);
};

const hasWgetWithoutChecksum = (args: string): boolean => {
	const normalized = args.toLowerCase();
	if (!/\bwget\b/u.test(normalized)) return false;
	return !/(sha256sum|sha512sum|shasum|md5sum|openssl\s+dgst|checksum)/u.test(
		normalized,
	);
};

export const applyDockerfileRules = (
	instructions: readonly IDockerfileInstruction[],
	file = 'Dockerfile',
): readonly IDockerfileFinding[] => {
	const findings: IDockerfileFinding[] = [];

	for (const instruction of instructions) {
		if (instruction.command === 'FROM') {
			const image = extractFromImage(instruction.args);
			if (image !== undefined && !hasPinnedTag(image)) {
				findings.push(
					finding(
						file,
						instruction.line,
						'DL3001',
						'low',
						'Pin the base image to a non-latest tag or digest.',
						'Use a specific tag like `node:20-alpine` or a digest.',
					),
				);
			}
		}

		if (
			instruction.command === 'RUN' &&
			hasAptInstallWithoutUpdate(instruction.args)
		) {
			findings.push(
				finding(
					file,
					instruction.line,
					'DL3008',
					'medium',
					'Combine `apt-get update` with `apt-get install` in the same RUN instruction.',
					'Prefix the install with `apt-get update &&`.',
				),
			);
		}

		if (
			(instruction.command === 'CMD' ||
				instruction.command === 'ENTRYPOINT') &&
			usesShellForm(instruction.args)
		) {
			findings.push(
				finding(
					file,
					instruction.line,
					'DL3025',
					'low',
					'Use JSON exec form for CMD/ENTRYPOINT.',
					'Wrap the command in JSON array syntax, for example `["node", "server.js"]`.',
				),
			);
		}

		if (
			instruction.command === 'RUN' &&
			hasApkAddWithoutNoCache(instruction.args)
		) {
			findings.push(
				finding(
					file,
					instruction.line,
					'DL3042',
					'low',
					'Use `apk add --no-cache` to avoid stale index data in image layers.',
					'Add the `--no-cache` flag to the apk install command.',
				),
			);
		}

		if (
			instruction.command === 'RUN' &&
			hasWgetWithoutChecksum(instruction.args)
		) {
			findings.push(
				finding(
					file,
					instruction.line,
					'DL3047',
					'medium',
					'Downloads performed with `wget` should verify a checksum in the same RUN instruction.',
					'Add a checksum validation step such as `sha256sum -c` after the download.',
				),
			);
		}
	}

	return findings;
};
