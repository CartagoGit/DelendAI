/**
 * session-handover-run.service.ts — what `delendai session handover` does:
 * persist the handover from the stores, print its bounded index, or print
 * one entry in full. The command line only parses and prints.
 */
import { resolve } from 'node:path';

import { asWorktreeId, type StateScope } from '@delendai/state';

import { SESSION_HANDOVER_DEFAULT_SESSION } from '../contracts/constants/session-handover-command.constant';
import { createFileArtifactStore } from '../context-store/file-artifact-store';
import {
	readWorkspaceCacheDir,
	readWorkspacePolicy,
} from './development-policy.service';
import type {
	ISessionHandoverRunInput,
	ISessionHandoverRunResult,
} from './session-handover-run.interface';
import {
	renderHandoverEntry,
	renderHandoverIndex,
} from './session-handover-render.service';
import { handoverSourcesFor } from './session-handover-sources.service';
import {
	buildSessionHandover,
	handoverDetail,
	handoverIndex,
	persistSessionHandover,
	resumeSessionHandover,
} from './session-handover.service';
import type { IHandoverSection } from './session-handover.interface';

const HANDOVER_CACHE_DIRECTORY = 'session-handover';

const sectionsOf = (
	sections: Readonly<Record<IHandoverSection, readonly unknown[]>>,
): IHandoverSection[] => Object.keys(sections) as IHandoverSection[];

/** Run one action of the handover command. */
export const runSessionHandover = async (
	input: ISessionHandoverRunInput,
): Promise<ISessionHandoverRunResult> => {
	const cacheDir = resolve(
		input.root,
		await readWorkspaceCacheDir(input.root),
	);
	const store = createFileArtifactStore({
		root: resolve(cacheDir, HANDOVER_CACHE_DIRECTORY),
	});
	const sessionId = input.sessionId ?? SESSION_HANDOVER_DEFAULT_SESSION;
	const scope: StateScope = {
		kind: 'project',
		locator: {
			workspaceRoot: input.root,
			worktreeId: asWorktreeId(HANDOVER_CACHE_DIRECTORY),
			cacheRoot: cacheDir,
			docsRoot: resolve(input.root, 'docs'),
		},
	};
	const location = { scope, sessionId };
	const build = {
		sessionId,
		now: input.now ?? Date.now(),
		sources:
			input.sources ??
			handoverSourcesFor({
				root: input.root,
				policy: await readWorkspacePolicy(input.root),
			}),
	};
	if (input.action === 'persist') {
		const handover = await buildSessionHandover(build);
		await persistSessionHandover(store, location, handover);
		const total = sectionsOf(handover.sections).reduce(
			(sum, name) => sum + handover.sections[name].length,
			0,
		);
		return {
			ok: true,
			text: `handover persisted: ${String(total)} entries, ${String(handover.missing.length)} sections missing\n`,
			data: { sessionId, entries: total, missing: handover.missing },
		};
	}
	const handover = await resumeSessionHandover({ ...build, store, location });
	if (input.action === 'index') {
		return {
			ok: true,
			text: renderHandoverIndex(handoverIndex(handover)),
			data: { index: handoverIndex(handover) },
		};
	}
	for (const name of sectionsOf(handover.sections)) {
		const found =
			input.entry === undefined
				? undefined
				: handoverDetail(handover, name, input.entry);
		if (found !== undefined) {
			return {
				ok: true,
				text: renderHandoverEntry(name, found),
				data: { section: name, entry: found },
			};
		}
	}
	return {
		ok: false,
		text: `no handover entry ${input.entry ?? '(none given: pass --entry=<id>)'}\n`,
		data: { entry: input.entry ?? null },
	};
};
