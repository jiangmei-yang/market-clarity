# Critical Loop 17

## Judge finding

The deployed default stock view still behaved like a static presentation chart:
its line did not expose daily coordinates, its size felt fixed, the visible
information was sparse, and the relationship between price and a company event
could not be inspected directly.

The local candidate already contained part of the intended chart interaction,
but it had not been published. Browser QA also found two additional defects:

- the historical-window navigator inherited an old flex layout and rendered
  over the right-hand research summary;
- a failed market request left a large empty chart area and leaked Chinese
  failure copy into the English interface.

## Changes

- Added candlestick and line modes.
- Added independent MA5, MA20, CSI 300 and volume layers.
- Added 20-, 60- and 120-day windows.
- Added compact, standard, wide and full-screen chart sizes.
- Added hover crosshairs and a daily card with OHLC, daily change, amplitude,
  MA5, MA20, benchmark movement and volume.
- Added click-to-pin and keyboard left/right daily inspection.
- Added a draggable historical-window navigator, five-day earlier/later
  controls and a return-to-latest action.
- Added a filing jump action that pins the chart to the aligned trading day.
- Added filing-date-to-window-end price change with an explicit
  “time alignment, not causation” boundary.
- Replaced the blank failure area with a localized, truthful data-unavailable
  state and retry action. It does not substitute a sample price series.
- Reset the chart container from the old flex layout to block layout so the
  navigator remains inside the chart column.

## Verification

- Production build completed.
- Automated tests: **111/111**.
- Browser QA used current public market data for Kweichow Moutai.
- Hovering returned a dated reading with OHLC, change, amplitude, MA values,
  CSI 300 comparison and volume.
- Switching to the wide size changed the chart class without a page reload.
- Switching to 20 days changed both the summary label and displayed date
  window.
- Full-screen mode entered and exited correctly.
- “Jump to filing” pinned the chart to the filing-aligned trading day and
  displayed the same-day filing title.
- Moving five trading days earlier changed the window from
  `2026-04-27 — 2026-07-23` to `2026-04-20 — 2026-07-16`.
- Geometry inspection confirmed the navigator and right research summary no
  longer overlap.
- A transient live-data failure displayed the explicit degraded state rather
  than a sample chart.

## Score discipline

This iteration improves desktop usability and research credibility. It does not
create external participant evidence, willingness-to-pay evidence or a stronger
model-safety result. The honest candidate score therefore remains **86/100**.
