/**
 * Route constants.
 *
 * The standalone library page's path lives here rather than as a
 * literal at each use site : it is referenced by the registration
 * in `index.tsx`, the teardown that unregisters it, and every
 * entry point that navigates to it. Three copies of a string that
 * must agree is exactly the kind of drift that produces a dead
 * button nobody notices.
 */

/** Full-screen Unifideck catalogue page. */
export const UNIFIDECK_ROUTE = "/unifideck";
