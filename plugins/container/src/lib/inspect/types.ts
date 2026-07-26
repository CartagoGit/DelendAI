export type IContainerInspectKind = 'docker-ps' | 'docker-images' | 'k8s-get';

export interface IDockerContainer {
	readonly id: string;
	readonly name: string;
	readonly image: string;
	readonly status: string;
	readonly ports: readonly string[];
	readonly createdAt: string;
}

export interface IDockerImage {
	readonly id: string;
	readonly repository: string;
	readonly tag: string;
	readonly size: string;
	readonly createdAt: string;
}

export interface IK8sPodSummary {
	readonly name: string;
	readonly namespace: string;
	readonly status: string;
	readonly nodeName?: string;
	readonly podIp?: string;
	readonly containers: readonly string[];
}

export interface IContainerInspectInput {
	readonly kind: IContainerInspectKind;
	readonly namespace?: string;
}

export interface IContainerInspectDeps {
	readonly probeBinary: (
		name: string,
	) => Promise<{ present: boolean; hint?: string }>;
	readonly exec: (
		cmd: readonly string[],
	) => Promise<{ stdout: string; stderr: string }>;
}

export type IContainerInspectResult =
	| {
			readonly kind: IContainerInspectKind;
			readonly items: readonly unknown[];
			readonly cliPresent: true;
	  }
	| {
			readonly kind: 'skipped';
			readonly hint: string;
			readonly cliPresent: false;
	  };
