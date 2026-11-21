import type {
	IChangeRequestForge,
	IChangeRequestRunner,
} from './change-request-forge.interface';

/** What the pull-request step can ask of git and of the forge's CLI. */
export interface IPullRequestPorts {
	/** Git's trimmed output, or `undefined` when it failed. */
	readonly git: (args: readonly string[]) => string | undefined;
	/** The forge CLI's trimmed output, or `undefined` when it failed. */
	readonly gh: (args: readonly string[]) => string | undefined;
	/** Any forge CLI by name (`gh`, `glab`), for the forge adapters. */
	readonly run?: IChangeRequestRunner;
	/** The forge adapters the plugins offer; none when none is installed. */
	readonly forges?: readonly IChangeRequestForge[];
}

/** What happened to the publication's pull request. */
export type IPublicationPullRequest =
	| { readonly status: 'opened' | 'existing'; readonly url: string }
	| {
			readonly status: 'updated';
			readonly url: string;
			readonly title: string;
	  }
	| {
			readonly status: 'unchanged';
			readonly url: string;
			readonly reason: string;
	  }
	| { readonly status: 'skipped' | 'failed'; readonly reason: string };
