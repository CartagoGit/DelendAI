/**
 * maintenance-lease-path.ts — where the maintenance lease file lives.
 *
 * Maintenance acts on refs, and every worktree of a repository shares
 * them, so there is one maintainer per repository, not per working copy.
 * A lease kept under a unit worktree was recreated by the next heartbeat
 * after the worktree was removed, which broke the removal ("Directory not
 * empty") and made `work publish` exit 4 after a successful push.
 */
import { resolve } from 'node:path';

import { MAINTENANCE_LEASE_FILE } from '../contracts/constants/maintenance-lease.constant';
import { sharedCheckout } from '../shared/shared-checkout';
import { joinRel } from '../shared/paths';

/**
 * The lease path for a workspace: under the cache of the shared checkout
 * of its git common dir, or of the workspace itself outside a repository.
 * An absolute `cacheDir` is used as given.
 */
export const maintenanceLeasePath = (
	workspaceRoot: string,
	cacheDir: string,
	checkoutOf: (from: string) => string | undefined = sharedCheckout,
): string =>
	resolve(
		checkoutOf(workspaceRoot) ?? workspaceRoot,
		joinRel(cacheDir, MAINTENANCE_LEASE_FILE),
	);
