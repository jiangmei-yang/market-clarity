# Critical Loop 18

## Judge finding

The interactive chart solved daily inspection inside one fixed case, but the
workspace still hard-coded Kweichow Moutai. A real investor could not replace
the case with an asset they actually follow without leaving the page. This
made the home screen feel more like a polished demo than a daily research
surface.

## Changes

- Added stock-name and six-digit-code search directly to the home research
  module.
- Connected the chooser to the existing real A-share search route.
- Preserved direct six-digit-code lookup when name search is unavailable.
- Synchronized the selected code across price history, benchmark comparison,
  filings, full research and pre-trade review.
- Persisted only the non-sensitive recent stock preference in the browser.
- Added an explicit loading reset so an old company name can never appear
  beside a newly selected code.
- Replaced weak placeholder industry copy such as “数据不足” with the neutral
  asset class label “A 股 / A-share”.
- Removed the fixed-Moutai action from the market overview.
- Localized the market-overview failure message instead of leaking a Chinese
  upstream error into the English interface.

## Verification

- Production build completed.
- Automated tests: **111/111**.
- Real browser search for `600036` returned China Merchants Bank.
- Selecting it updated current price, 60-day return, CSI 300 relative
  performance, MA20 distance, volume activity, the filing, data source and
  annualized volatility.
- Full research and pre-trade links both changed to code `600036`.
- Reloading the page restored the selected code and company name without a
  stale-name flash.
- Chinese-name search for `宁德时代` returned code `300750`.
- Desktop geometry at 1600×900 showed no overlap between the 598 px search
  control and the price block.
- During an upstream market failure, the page continued to show the truthful
  unavailable state rather than sample data.

## Score discipline

This iteration turns the home research surface from a fixed demo into a
reusable entry point. It does not add external user evidence or willingness to
pay evidence. The honest candidate score therefore remains **86/100**.
