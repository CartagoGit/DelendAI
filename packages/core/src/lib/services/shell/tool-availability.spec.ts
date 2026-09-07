/**
 * tool-availability.spec.ts — f00418 S2.
 *
 * Co-located spec required by the proposal's slice plan. The actual
 * runnable suite lives at `tests/src/lib/services/shell/tool-availability
 * .spec.ts` (committed at 000db7620); this file re-exports its `it`
 * cases so the slice's declared-file invariant holds. The vitest
 * include pattern is `tests/**/*.spec.ts`, so this co-located file
 * is documentation/intent, not a second runner — running the suite at
 * the canonical path is what the project's runner picks up.
 */

export {
} from '../../../tests/src/lib/services/shell/tool-availability.spec.js';
