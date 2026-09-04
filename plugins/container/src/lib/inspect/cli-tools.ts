/** Declarative CLI descriptors for the container plugin. */
import type { IExternalTool } from '@delendai/core/public';

export const DOCKER_TOOL: IExternalTool = {
	id: 'docker',
	bin: 'docker',
	versionArgs: ['--version'],
	versionPattern: /Docker version (\d+\.\d+\.\d+)/,
	installHints: [
		{
			manager: 'brew',
			command: 'brew install docker',
		},
		{
			manager: 'apt',
			command: 'apt-get install -y docker.io',
		},
	],
};

export const PODMAN_TOOL: IExternalTool = {
	id: 'podman',
	bin: 'podman',
	versionArgs: ['--version'],
	versionPattern: /podman version (\d+\.\d+\.\d+)/i,
	installHints: [
		{
			manager: 'brew',
			command: 'brew install podman',
		},
		{
			manager: 'apt',
			command: 'apt-get install -y podman',
		},
	],
};

export const KUBECTL_TOOL: IExternalTool = {
	id: 'kubectl',
	bin: 'kubectl',
	versionArgs: ['version', '--client=true', '-o', 'json'],
	versionPattern: /"gitVersion":\s*"v(\d+\.\d+\.\d+)"/,
	installHints: [
		{
			manager: 'brew',
			command: 'brew install kubectl',
		},
		{
			manager: 'apt',
			command: 'apt-get install -y kubectl',
		},
	],
};

export const HADO_LINT_TOOL: IExternalTool = {
	id: 'hadolint',
	bin: 'hadolint',
	versionArgs: ['--version'],
	versionPattern: /Haskell Lint (\d+\.\d+\.\d+)/,
	installHints: [
		{
			manager: 'brew',
			command: 'brew install hadolint',
		},
		{
			manager: 'apt',
			command: 'apt-get install -y hadolint',
		},
		{
			manager: 'curl',
			command:
				'curl -L https://github.com/hadolint/hadolint/releases/latest/download/hadolint-Linux-x86_64 -o /usr/local/bin/hadolint && chmod +x /usr/local/bin/hadolint',
		},
	],
};

export const CONTAINER_TOOLS: readonly IExternalTool[] = [
	DOCKER_TOOL,
	PODMAN_TOOL,
	KUBECTL_TOOL,
	HADO_LINT_TOOL,
];
