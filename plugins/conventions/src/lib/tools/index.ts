/**
 * Tool registrations for the conventions plugin (f00037 S3). Composes
 * the pure `conventions_classify` and the workspace-scanning
 * `conventions_check` behind a single factory the plugin's `register`
 * calls — the only place the production `node:fs` reader is wired.
 */
import type { IToolRegistration } from '@mcp-vertex/core/public';

import { createFsDirReader } from '../adapters/fs-dir-reader';
import { buildCheckConventionsRegistration } from './check-conventions.tool';
import { buildClassifyPathsRegistration } from './classify-paths.tool';

export interface IConventionsToolsOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root the scan walks. */
	readonly workspaceRoot: string;
	/** Optional override of the default scan roots. */
	readonly defaultRoots?: readonly string[];
}

export const buildConventionsToolRegistrations = (
	options: IConventionsToolsOptions,
): readonly IToolRegistration[] => [
	buildClassifyPathsRegistration(options.namespacePrefix),
	buildCheckConventionsRegistration({
		namespacePrefix: options.namespacePrefix,
		reader: createFsDirReader(options.workspaceRoot),
		...(options.defaultRoots !== undefined
			? { defaultRoots: options.defaultRoots }
			: {}),
	}),
];
