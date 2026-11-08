#!/usr/bin/env bun
/**
 * reconcile-duplicate-ids — keep one copy of each duplicated proposal id
 * in a checkout, the one furthest along the state machine.
 *
 * Usage: bun tools/scripts/proposals/reconcile-duplicate-ids.script.ts --root <checkout> (the checkout is the last argument)
 * Prints `{"removed":[...]}` as JSON; exits 0 whether or not it removed
 * anything. The repair itself lives in the proposals plugin.
 */
import { join, resolve } from 'node:path';

import { reconcileDuplicateProposalIds } from '../../../plugins/proposals/src/lib/proposals/reconcile-duplicate-ids';

const PROPOSALS_DIR = 'docs/delendai/proposals';

const root = resolve(process.argv.at(-1) ?? '.');
const { removed } = await reconcileDuplicateProposalIds(
	join(root, PROPOSALS_DIR),
);
console.log(JSON.stringify({ removed }));
