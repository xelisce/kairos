// Upper limits on what you can type, so a slip of the keyboard (an extra zero, a 2206 for 2026)
// can't make the planner give up or the screen overflow.

/** Color swatches you can keep (Settings > Display). More would bury the dialogs that show them. */
export const MAX_SWATCHES = 24;
/** Characters in a title, place or plan name. */
export const MAX_TEXT = 200;
/** A task's total time: 100 hours. */
export const MAX_TASK_MIN = 100 * 60;
/** One block (a session, routine, event length, trip): a day. */
export const MAX_BLOCK_MIN = 24 * 60;
/** Gaps and extra time around things. */
export const MAX_GAP_MIN = 120;
/** Default length of a new time away. */
export const MAX_AWAY_DAYS = 60;
/** Years a typed date may have. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2099;
