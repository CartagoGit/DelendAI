/** Labels and markers `land` leaves on the forge. */
export const LAND_LABEL_CULPRIT = 'delendai:culprit';
export const LAND_LABEL_NEEDS_UPDATE = 'delendai:needs-update';
/** The branch name of a batch: `<prefix>batch-a+b+c`. */
export const LAND_BATCH_BRANCH = 'batch-';
/** The state `land` keeps in a batch pull request's body, read back each pass. */
export const LAND_RECORD_PREFIX = 'land-record: ';
/** The folder, under the project's namespace, batch branches live in. */
export const LAND_QUEUE_SEGMENT = 'queue';
/** Most pull requests one batch carries unless the project says otherwise. */
export const LAND_BATCH_CAPACITY = 8;
/** Items per page of a forge listing: the most GitHub serves. */
export const LAND_PAGE_SIZE = 100;
/** Pages read of one listing before the pass gives up rather than loop. */
export const LAND_MAX_PAGES = 50;
/** The actor of a GitHub workflow token: what it pushes starts no workflow. */
export const LAND_WORKFLOW_TOKEN_ACTOR = 'github-actions[bot]';

/** The integrator's workflow name: what `workflow_run` lists it as. */
export const LAND_WORKFLOW_NAME = 'land';
