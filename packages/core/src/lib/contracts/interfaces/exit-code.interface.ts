/**
 * exit-code.interface.ts — f00037 contract surface for
 * `contracts/constants/exit-code.constant.ts`.
 *
 * The runtime constant `EXIT_CODE` is a frozen map of symbolic names to
 * numeric values (a discriminated union). Its derived `IExitCode` type
 * — a literal union of those numeric values — lives here so callers
 * that only need the type can `import type` without dragging the
 * constant value along.
 *
 * The literal union is **derived** from `EXIT_CODE`'s value type (not
 * hardcoded) so any future addition to the constant is reflected here
 * automatically — the typecheck enforces parity.
 */

import type { EXIT_CODE } from '../constants/exit-code.constant';

export type IExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
