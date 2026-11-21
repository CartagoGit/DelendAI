import { parseDockerImages } from './parse-docker-images';
import { parseDockerPs } from './parse-docker-ps';
import { parseKubectlGet } from './parse-kubectl-get';
import type {
	IContainerInspectDeps,
	IContainerInspectInput,
	IContainerInspectResult,
} from './types';

const requiredBinaryFor = (kind: IContainerInspectInput['kind']): string =>
	kind === 'k8s-get' ? 'kubectl' : 'docker';

const commandFor = (input: IContainerInspectInput): readonly string[] => {
	switch (input.kind) {
		case 'docker-ps':
			return ['docker', 'ps', '--format', '{{json .}}'];
		case 'docker-images':
			return ['docker', 'images', '--format', '{{json .}}'];
		case 'k8s-get':
			return [
				'kubectl',
				'-n',
				input.namespace ?? 'default',
				'get',
				'pods',
				'-o',
				'json',
			];
	}
};

export const runInspect = async (
	input: IContainerInspectInput,
	deps: IContainerInspectDeps,
): Promise<IContainerInspectResult> => {
	const binary = requiredBinaryFor(input.kind);
	const probe = await deps.probeBinary(binary);
	if (!probe.present) {
		return {
			kind: 'skipped',
			hint:
				probe.hint ??
				`\`${binary}\` is required for ${input.kind} inspection.`,
			cliPresent: false,
		};
	}

	const { stdout } = await deps.exec(commandFor(input));
	switch (input.kind) {
		case 'docker-ps':
			return {
				kind: input.kind,
				items: parseDockerPs(stdout),
				cliPresent: true,
			};
		case 'docker-images':
			return {
				kind: input.kind,
				items: parseDockerImages(stdout),
				cliPresent: true,
			};
		case 'k8s-get':
			return {
				kind: input.kind,
				items: parseKubectlGet(stdout),
				cliPresent: true,
			};
	}
};
