# @avs/analytics

Opt-in telemetry contracts. `NullAnalyticsService` is the default; a
concrete transport (PostHog, Segment, or custom) is wired at bootstrap
only after the user explicitly opts in.

**Never** invoke `track()` from a code path that runs before the user
has been presented with the privacy consent screen.
