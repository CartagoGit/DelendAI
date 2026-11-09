/** Labels and markers `land` leaves on the forge. */
export const LAND_LABEL_CULPRIT = 'delendai:culprit';
export const LAND_LABEL_NEEDS_UPDATE = 'delendai:needs-update';
/** The branch name of a batch: `<prefix>batch-a+b+c`. */
export const LAND_BATCH_BRANCH = 'batch-';
/** The state `land` keeps in a batch pull request's body, read back each pass. */
export const LAND_RECORD_OPEN = '<!-- land';
export const LAND_RECORD_CLOSE = '-->';
/** The folder, under the project's namespace, batch branches live in. */
export const LAND_QUEUE_SEGMENT = 'queue';
/** Most pull requests one batch carries unless the project says otherwise. */
export const LAND_BATCH_CAPACITY = 8;
