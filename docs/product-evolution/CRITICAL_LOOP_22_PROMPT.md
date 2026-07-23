# Critical Loop 22 — Make the default workspace personally useful

## Judge finding

The default workspace has a capable chart, but its information hierarchy still resembles a generic market terminal: broad indices first, one fixed stock second, and the user's own portfolio and decisions later. A real investor should not have to scroll past an unrelated chart to learn whether something in their own plan needs attention.

## Required correction

1. Put personal exposure, rule boundaries and the latest reviewed decision before the large stock chart.
2. Keep the market overview compact and explicitly secondary to personal context.
3. Use the user's largest recorded holding as the initial stock when available; use a transparent default only when no holding exists.
4. Show the reason a stock is on the desk: largest holding, saved selection or default example.
5. Replace generic motivational copy with operational labels and values.
6. Preserve the existing research, claim-check and portfolio entry points without turning them into a repeated card grid.
7. Keep missing data honest and never imply that “no alert” means “no risk”.
8. Verify first load, saved preference, no-profile and no-holding states in the browser.

## Acceptance criteria

- A returning user can identify their largest exposure and whether it exceeds a personal boundary without scrolling past the chart.
- The default chart follows the largest recorded holding unless the user has explicitly saved another selection.
- The latest review and claim-check history are visible as context, not as vanity metrics.
- The first screen contains real values and clear next actions, not slogans.
- The layout remains readable at desktop widths without horizontal overflow.
