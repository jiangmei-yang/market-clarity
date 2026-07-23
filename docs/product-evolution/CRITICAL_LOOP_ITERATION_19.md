# Critical Loop 19

## Judge finding

The research page could align a filing with the price axis, but the primary
visual still behaved like a single-line classroom chart. It did not surface the
market context an investor normally checks before opening a separate tab:
relative performance, drawdown, volatility, volume activity, OHLC structure and
moving averages.

## Changes

- Added an in-flow market metric band for period return, CSI 300 relative
  performance, maximum drawdown, annualized volatility, volume activity and
  event coverage.
- Added real-OHLC candlesticks as the default research view.
- Preserved a one-click closing-price line view.
- Added independent MA5 and MA20 visibility controls.
- Expanded the hover payload to open, high, low, close, daily change,
  benchmark change and volume.
- Kept the event markers, original filing, next-day response, five-day response,
  current-position impact and explicit non-causality boundary.
- Added a three-column fallback for narrower desktop workspaces and verified
  that the research surface does not create horizontal overflow.
- Reduced the chart tooltip shadow to match the established product component
  vocabulary.

## Verification

- Production build completed.
- Automated tests: **111/111** before the new regression assertions were added.
- Real browser data for `600519` produced:
  - 1-month return `+9.5%`;
  - relative CSI 300 performance `+13.9%`;
  - maximum drawdown `-2.7%`;
  - annualized volatility `28.4%`;
  - latest volume activity `0.7×`;
  - five current public events.
- K-line mode rendered 22 candlesticks from 22 real trading days.
- MA5 and MA20 both rendered and could be independently hidden.
- Switching to line mode updated the legend without losing benchmark, volume or
  event context.
- Browser geometry at 1600×900 reported no horizontal overflow; the chart
  retained an 851 px working width and the controls remained separate from the
  metric band.

## Score discipline

This iteration makes the research page materially more useful and
demonstration-ready. It does not add external task-completion, retention or
willingness-to-pay evidence. The honest candidate score remains **86/100**.
