/**
 * What the core asks of a forge about a change request (a GitHub pull
 * request, a GitLab merge request). The core owns this contract and never
 * imports a forge: the `github` and `gitlab` plugins implement it and
 * expose it as `changeRequestForge` on their plugin object, and the core
 * loads the plugins of the project's forge by name.
 */

/**
 * Runs a forge CLI (`gh`, `glab`) for an adapter: `text` is its trimmed
 * output, `json` that output parsed; either is `undefined` when the CLI
 * failed (and `json` when the output was not JSON).
 */
export interface IChangeRequestRunner {
	readonly text: (bin: string, args: readonly string[]) => string | undefined;
	readonly json: (bin: string, args: readonly string[]) => unknown;
}

/** One open change request, as a forge names it. */
export interface IChangeRequestRef {
	readonly url: string;
	/** The number (GitHub) or iid (GitLab) the forge's API addresses it by. */
	readonly id: string;
}

/** The text a change request carries. */
export interface IChangeRequestText {
	readonly title: string;
	readonly body: string;
}

export interface IChangeRequestForge {
	/** `github`, `gitlab`. */
	readonly id: string;
	/** Whether this forge hosts the repository behind `remoteUrl`. */
	readonly handles: (remoteUrl: string) => boolean;
	/** The open change request of `branch`, if there is one. */
	readonly findOpen: (
		run: IChangeRequestRunner,
		branch: string,
	) => IChangeRequestRef | undefined;
	/** Its current text, or `undefined` when the forge would not say. */
	readonly read: (
		run: IChangeRequestRunner,
		ref: IChangeRequestRef,
	) => IChangeRequestText | undefined;
	/** Rewrite its title and body; whether the forge accepted it. */
	readonly update: (
		run: IChangeRequestRunner,
		ref: IChangeRequestRef,
		text: IChangeRequestText,
	) => boolean;
}
