import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	createActivationKpis,
	hydrateKpis,
	serializeKpis,
	type IActivationKpis,
	type ISessionKpis,
} from './activation-kpis';
import { writeFileAtomic } from '../shared/atomic-write';
import { withFileMutex } from '../shared/with-file-mutex';

export interface IActivationKpiSessionStore {
	readonly path: string;
	load(): Promise<void>;
	beginSession(input: {
		readonly taskId: string;
		readonly expected: readonly string[];
	}): void;
	recordInvocation(toolId: string): void;
	finishSession(): Promise<ISessionKpis | undefined>;
}

export interface IActivationKpiSessionStoreOptions {
	readonly workspaceRootAbs: string;
	readonly relativePath?: string;
	readonly readFile?: (path: string) => Promise<string>;
	readonly writeFile?: (path: string, content: string) => Promise<void>;
}

const DEFAULT_RELATIVE_PATH = join('.vscode', 'delendai', 'kpis.json');

export const createActivationKpiSessionStore = (
	options: IActivationKpiSessionStoreOptions,
): IActivationKpiSessionStore => {
	const path = join(
		options.workspaceRootAbs,
		options.relativePath ?? DEFAULT_RELATIVE_PATH,
	);
	const read =
		options.readFile ??
		(async (filePath: string): Promise<string> =>
			(await readFile(filePath, 'utf8')) as string);
	const write = options.writeFile ?? writeFileAtomic;
	let kpis: IActivationKpis = createActivationKpis();
	let active:
		| {
				readonly taskId: string;
				readonly expected: readonly string[];
				readonly invoked: string[];
		  }
		| undefined;

	return {
		path,
		async load() {
			const contents = await read(path).catch(() => null);
			if (contents === null) return;
			try {
				kpis = hydrateKpis(JSON.parse(contents) as unknown);
			} catch {
				kpis = createActivationKpis();
			}
		},
		beginSession({ taskId, expected }) {
			active = { taskId, expected: [...expected], invoked: [] };
		},
		recordInvocation(toolId) {
			active?.invoked.push(toolId);
		},
		async finishSession() {
			if (active === undefined) return undefined;
			const session = kpis.recordSession(active);
			active = undefined;
			await withFileMutex(path, async () => {
				await write(
					path,
					`${JSON.stringify(serializeKpis(kpis), null, '\t')}\n`,
				);
			});
			return session;
		},
	};
};
