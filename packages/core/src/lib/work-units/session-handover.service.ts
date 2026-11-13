/**
 * session-handover.service.ts — what a session needs again, rebuilt from the
 * stores that own it, never from a summary a model wrote.
 *
 * Before compaction the handover is built from the stores (units, branches,
 * proofs, evidence, decisions ...) and persisted in the artifact store.
 * After it, a bounded index goes back into the session and the detail of one
 * entry is fetched on demand. A resumed session rebuilds from the stores; a
 * section no store can answer is reported missing, never invented.
 */
import type { IArtifactStore } from '@delendai/state';

import type {
	IBuildSessionHandoverInput,
	IHandoverEntry,
	IHandoverIndex,
	IHandoverSection,
	ISessionHandover,
	ISessionHandoverLocation,
} from './session-handover.interface';

const SECTIONS: readonly IHandoverSection[] = [
	'invariants',
	'decisions',
	'units',
	'pending',
	'done',
	'branches',
	'commits',
	'pullRequests',
	'evidence',
	'tests',
	'errors',
	'blockers',
];

/** One value per section, built from the section's name. */
const perSection = <T>(
	make: (name: IHandoverSection) => T,
): Record<IHandoverSection, T> => {
	const out: Partial<Record<IHandoverSection, T>> = {};
	for (const name of SECTIONS) out[name] = make(name);
	return out as Record<IHandoverSection, T>;
};

const INDEX_ENTRIES_PER_SECTION = 5;
const INDEX_SUMMARY_CHARS = 80;

const keyOf = (location: ISessionHandoverLocation) =>
	({
		scope: location.scope,
		kind: 'snapshot',
		id: `session-handover:${location.sessionId}`,
	}) as const;

const readSection = async (
	read: (() => Promise<readonly IHandoverEntry[]>) | undefined,
): Promise<readonly IHandoverEntry[] | undefined> => {
	if (read === undefined) return undefined;
	try {
		return await read();
	} catch {
		return undefined;
	}
};

/** Build the handover from the stores; a section no store answers is missing. */
export const buildSessionHandover = async (
	input: IBuildSessionHandoverInput,
): Promise<ISessionHandover> => {
	const read = await Promise.all(
		SECTIONS.map((name) => readSection(input.sources[name])),
	);
	const missing = SECTIONS.filter((_, index) => read[index] === undefined);
	const sections = perSection((name) => read[SECTIONS.indexOf(name)] ?? []);
	return {
		sessionId: input.sessionId,
		builtAt: input.now,
		sections,
		missing,
	};
};

/** Persist the handover so it outlives the session that built it. */
export const persistSessionHandover = async (
	store: IArtifactStore,
	location: ISessionHandoverLocation,
	handover: ISessionHandover,
): Promise<void> => {
	await store.put(keyOf(location), handover);
};

/** The persisted handover, or null when none was kept. */
export const loadSessionHandover = async (
	store: IArtifactStore,
	location: ISessionHandoverLocation,
): Promise<ISessionHandover | null> =>
	(await store.get<ISessionHandover>(keyOf(location)))?.value ?? null;

const cut = (text: string): string =>
	text.length <= INDEX_SUMMARY_CHARS
		? text
		: `${text.slice(0, INDEX_SUMMARY_CHARS - 1)}…`;

/** The bounded index a session is given after compaction. */
export const handoverIndex = (handover: ISessionHandover): IHandoverIndex => ({
	sessionId: handover.sessionId,
	builtAt: handover.builtAt,
	counts: perSection((name) => handover.sections[name].length),
	entries: perSection((name) =>
		handover.sections[name]
			.slice(0, INDEX_ENTRIES_PER_SECTION)
			.map((entry) => ({ ...entry, summary: cut(entry.summary) })),
	),
	missing: handover.missing,
});

/** One entry in full, fetched on demand; undefined when there is none. */
export const handoverDetail = (
	handover: ISessionHandover,
	section: IHandoverSection,
	id: string,
): IHandoverEntry | undefined =>
	handover.sections[section].find((entry) => entry.id === id);

/**
 * Resume a session: rebuild from the stores. A section the stores cannot
 * answer now is taken from the persisted handover (also store data) when
 * it holds one; whatever neither can answer stays missing.
 */
export const resumeSessionHandover = async (
	input: IBuildSessionHandoverInput & {
		readonly store: IArtifactStore;
		readonly location: ISessionHandoverLocation;
	},
): Promise<ISessionHandover> => {
	const rebuilt = await buildSessionHandover(input);
	if (rebuilt.missing.length === 0) return rebuilt;
	const persisted = await loadSessionHandover(input.store, input.location);
	if (persisted === null) return rebuilt;
	const stillMissing = rebuilt.missing.filter((name) =>
		persisted.missing.includes(name),
	);
	const sections = perSection((name) =>
		rebuilt.missing.includes(name)
			? persisted.sections[name]
			: rebuilt.sections[name],
	);
	return { ...rebuilt, sections, missing: stillMissing };
};
