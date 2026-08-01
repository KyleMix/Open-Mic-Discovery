/**
 * Pin the timezone for the whole Jest run.
 *
 * Several modules bucket dates with host-local getters (getFullYear,
 * getMonth, getDate), so without a pinned zone the same commit can pass on
 * one machine and fail on another. UTC is the default because it has no
 * daylight saving transition to fall into.
 *
 * This has to happen here rather than in `setupFiles`. Jest gives each test
 * file a sandboxed copy of `process.env`, so assigning TZ inside a test or a
 * setup file never reaches the runtime that Date reads, and the assignment
 * silently does nothing. globalSetup runs in the parent process before any
 * worker is forked, so workers inherit the value.
 *
 * An explicitly provided TZ wins, which is what lets CI re-run the same suite
 * under a second zone to catch assertions that depend on the host.
 */
module.exports = async () => {
  process.env.TZ = process.env.TZ || 'UTC';
};
