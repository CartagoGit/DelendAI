/**
 * The integration protocol this code speaks. The repository records the
 * protocol it runs (`development.integration.protocol`); a long-lived
 * process built for an older one refuses to move refs or pull requests,
 * so a host server started before an integration change cannot keep
 * acting on rules that no longer hold. Raise it with every change to how
 * work integrates, and record the new value in the same change.
 *
 * 1: `land` is the one integrator; the queue, its trains, the candidate
 * refresh, hydration and ref maintenance are gone.
 */
export const INTEGRATION_PROTOCOL_VERSION = 1;
