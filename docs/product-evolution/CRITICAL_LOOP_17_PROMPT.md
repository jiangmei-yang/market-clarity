# Critical Loop 17 Prompt

Act as a skeptical desktop investor and product-quality reviewer. Inspect the
default stock chart as a working research surface, not as a decorative line.

Required changes:

1. Hovering the chart must reveal date, open, high, low, close, daily change,
   amplitude, moving averages, benchmark change and volume.
2. The user must be able to switch between candlesticks and a price line.
3. MA5, MA20, CSI 300 and volume must be independently visible or hidden.
4. The chart must support 20-, 60- and 120-trading-day windows.
5. The user must be able to resize or open the chart full-screen.
6. Historical windows must be browsable with a slider and explicit earlier /
   later controls; provide a return-to-latest action.
7. A filing marker must be locatable from the toolbar and must open the same
   daily reading rather than a detached text explanation.
8. Show the price change from the filing date only as time alignment, never as
   causal evidence.
9. If public market data fails, do not draw a sample line. Show a compact,
   localized failure state and an explicit retry action.
10. Validate that the chart controls and navigator remain inside the chart
    column and do not overlap the research summary.
11. Keep keyboard inspection and reduced-motion behavior.
12. Run the complete production build, automated suite and real browser
    interaction checks before saving a candidate version.

Do not raise the course score merely because the chart is more capable. This is
product completion evidence, not external user or payment validation.
