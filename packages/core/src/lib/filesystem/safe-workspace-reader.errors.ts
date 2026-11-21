import type { WorkspaceContainmentReason } from './safe-workspace-reader.types';

export interface IWorkspaceContainmentErrorInfo {
	readonly kind: WorkspaceContainmentReason;
	originalPath: string;
	readonly workspaceRoot: string;
	readonly resolvedAbsolute?: string;
	readonly reservedPath?: string;
}

export class WorkspaceContainmentError extends Error {
	readonly info: IWorkspaceContainmentErrorInfo;

	constructor(info: IWorkspaceContainmentErrorInfo) {
		const detail =
			info.resolvedAbsolute === undefined
				? ''
				: ` resolved to "${info.resolvedAbsolute}"`;
		const reserved =
			info.reservedPath === undefined
				? ''
				: ` (reserved: ${info.reservedPath})`;
		super(
			`[workspace-containment:${info.kind}] "${info.originalPath}"${detail} is not readable inside workspace root "${info.workspaceRoot}"${reserved}`,
		);
		this.name = 'WorkspaceContainmentError';
		this.info = info;
	}
}
