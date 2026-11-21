import { basename } from 'node:path';

import type { ICommandVscodeApi } from './types';

type WorkspaceFolder = NonNullable<
	NonNullable<ICommandVscodeApi['workspace']>['workspaceFolders']
>[number];

const isInside = (folder: string, file: string): boolean =>
	file === folder ||
	file.startsWith(folder.endsWith('/') ? folder : `${folder}/`);

/**
 * The workspace folder a command acts on: the folder owning the active
 * editor's file, else the only folder, else the one the user picks.
 * `undefined` means no folder is open or the pick was cancelled.
 */
export const resolveWorkspaceFolder = async (
	vscode: ICommandVscodeApi,
): Promise<WorkspaceFolder | undefined> => {
	const folders = vscode.workspace?.workspaceFolders ?? [];
	if (folders.length <= 1) return folders[0];
	const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
	if (activeFile !== undefined) {
		const owner = folders
			.filter((folder) => isInside(folder.uri.fsPath, activeFile))
			.sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length)[0];
		if (owner !== undefined) return owner;
	}
	const picked = await vscode.window.showQuickPick?.(
		folders.map((folder) => ({
			id: folder.uri.fsPath,
			label: basename(folder.uri.fsPath),
			description: folder.uri.fsPath,
		})),
	);
	return folders.find((folder) => folder.uri.fsPath === picked?.id);
};
