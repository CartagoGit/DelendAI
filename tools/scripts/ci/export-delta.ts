/**
 * export-delta.ts — which exported names a change to a re-export file moved.
 *
 * A barrel or an entry file declares nothing itself: it only names what other
 * modules declare. A spec that imports it is affected when a name it asks for
 * moved, not when the file changed. Adding one export to `packages/core/src/cli.ts`
 * selected 862 specs through the barrel; the specs that import that one name
 * are the ones the change touches.
 *
 * A file that declares anything itself has no delta here: a change to a
 * declaration changes behaviour whatever the export list says, so its direct
 * importers all run.
 */
import { factsOf } from './affected-specs.service';

/** The names whose export moved, or `*` when the delta cannot be bounded. */
export type IExportDelta = ReadonlySet<string> | '*';

const STAR = '*';

/**
 * What a re-export file exports, as `name` to where it comes from, or
 * `undefined` when the file declares something itself.
 */
export const reexportSurface = (
	text: string,
	resolve: (specifier: string) => string | undefined,
): ReadonlyMap<string, string> | undefined => {
	const facts = factsOf(text, resolve);
	if (facts.local.size > 0) return undefined;
	const surface = new Map<string, string>();
	for (const reexport of facts.reexports) {
		if (reexport.names === STAR) surface.set(`${STAR}${reexport.from}`, '');
		else
			for (const [name, original] of reexport.names)
				surface.set(name, `${reexport.from}#${original}`);
	}
	return surface;
};

/**
 * The delta between two versions of a file, or `undefined` when the file is
 * not a re-export file on both sides (then every importer is affected).
 * An `export *` added or removed cannot be bounded without following the
 * module it names, so it answers `*`, the cautious reading.
 */
export const exportDelta = (
	before: string | undefined,
	after: string,
	resolve: (specifier: string) => string | undefined,
): IExportDelta | undefined => {
	if (before === undefined) return undefined;
	const was = reexportSurface(before, resolve);
	const is = reexportSurface(after, resolve);
	if (was === undefined || is === undefined) return undefined;
	const moved = new Set<string>();
	for (const name of new Set([...was.keys(), ...is.keys()])) {
		if (was.get(name) === is.get(name)) continue;
		if (name.startsWith(STAR)) return STAR;
		moved.add(name);
	}
	return moved;
};
