/**
 * cli-tools.ts — f00133 S1: declarative descriptors for `docker` and `kubectl`.
 *
 * The container plugin wraps these CLIs via the shared r00012 probe +
 * runner. Wrapping is data, not control flow: each tool is one entry
 * below plus one tool registration, and missing binaries surface the
 * first install hint as a structured `install-missing` response — never
 * a crash.
 */
import type { IExternalTool } from '@mcp-vertex/core/public';

export const DOCKER_TOOL: IExternalTool = {
	id: 'docker',
	bin: 'docker',
	versionArgs: ['--version'],
	// docker prints e.g. `Docker version 24.0.7, build ...` — capture the
	// `24.0.7` chunk. Non-global regex (r00012 requirement).
	versionPattern: /Docker version (\d+\.\d+\.\d+)/,
	installHints: [
		{
			manager: 'apt',
			command: 'apt-get install -y docker.io',
		},
		{
			manager: 'brew',
			command: 'brew install --cask docker',
		},
		{
			manager: 'curl',
			command: 'curl -fsSL https://get.docker.com | sh',
		},
	],
};

export const KUBECTL_TOOL: IExternalTool = {
	id: 'kubectl',
	bin: 'kubectl',
	versionArgs: ['version', '--client=true', '-o', 'json'],
	// kubectl -o json prints a big object; we pull the client version.
	versionPattern: /"gitVersion":\s*"v(\d+\.\d+\.\d+)"/,
	installHints: [
		{
			manager: 'apt',
			command: 'apt-get install -y kubectl',
		},
		{
			manager: 'brew',
			command: 'brew install kubectl',
		},
		{
			manager: 'curl',
			command:
				'curl -LO https://dl.k8s.io/release/v1.30.0/bin/linux/amd64/kubectl',
		},
	],
};

export const CONTAINER_TOOLS: readonly IExternalTool[] = [
	DOCKER_TOOL,
	KUBECTL_TOOL,
];
