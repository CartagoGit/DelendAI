// scripts-drift-detector: "did the quality-gate scripts change?".
//
// SOLID — Single Responsibility. This file owns the diff between
// the current and last `analysis.scripts` map. The composer
// (`drift.ts`) does not know how scripts are stored or compared —
// it just feeds `(current, last)` to this detector and collects
// the change records.

import type { IDriftChange } from './drift';
import type { IDriftDetector, IDriftDetectorContext } from './drift-detector';

const scriptKeys = (
	scripts: Readonly<Record<string, string>>,
): readonly string[] => Object.keys(scripts).sort();

/**
 * Detects new or removed scripts. A new `e2e` script implies a
 * missing `run_e2e` tool; a removed script means the corresponding
 * tool is now stale and should be retired.
 */
export class ScriptsDriftDetector implements IDriftDetector {
	readonly id = 'scripts';

	detect(ctx: IDriftDetectorContext): readonly IDriftChange[] {
		const lastScripts = scriptKeys(ctx.last.scripts);
		const curScripts = scriptKeys(ctx.current.scripts);
		if (lastScripts.length === curScripts.length) {
			// Fast path: same length + same keys (both sorted) ⇒ no drift.
			let equal = true;
			for (let i = 0; i < lastScripts.length; i += 1) {
				if (lastScripts[i] !== curScripts[i]) {
					equal = false;
					break;
				}
			}
			if (equal) return [];
		}
		const out: IDriftChange[] = [];
		for (const s of curScripts) {
			if (!lastScripts.includes(s)) {
				out.push({
					kind: 'script-added',
					summary: `New script "${s}" → suggested tool: \`run_${s}\``,
				});
			}
		}
		for (const s of lastScripts) {
			if (!curScripts.includes(s)) {
				out.push({
					kind: 'script-dropped',
					summary: `Script "${s}" was removed; retire the \`run_${s}\` tool`,
				});
			}
		}
		return out;
	}
}
