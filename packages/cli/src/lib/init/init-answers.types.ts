/**
 * init-answers.types.ts — feature-private structural types for the
 * `init` workflow (f00084 + f00103).
 *
 * The runtime Zod schema (`InitAnswers`) and its derived type
 * (`IInitAnswers`) live next to each other so the schema and the
 * inferred type cannot drift apart. The validation constants
 * (`INIT_VALID_PLUGIN_IDS`, `PLUGIN_IDS`) live in
 * `contracts/constants/init-answers.constant.ts` because they are
 * consumed by both the schema and the prompt flow.
 *
 * Conventions (see `docs/mcp-vertex/FILE-CONVENTIONS.md`):
 *
 *   - `*.types.ts` — feature-private structural helpers; they do NOT
 *     live under `contracts/interfaces/` because they are not the
 *     public contract of the package.
 *   - Pure types: this module exports `type`-only bindings; no runtime
 *     side effects.
 */

import type { z } from 'zod';

import type { InitAnswers } from './init-answers.schema';

/**
 * Inferred TypeScript shape of `InitAnswers`. Every field defaults
 * through the schema so the type already represents the post-default
 * shape (e.g. `preset: 'vertex' | …`, never `undefined`).
 */
export type IInitAnswers = z.infer<typeof InitAnswers>;