# Critical Loop 22

## Problem observed

The default route led with market indices and a fixed stock chart. Personal holdings, rule boundaries and the last reviewed decision appeared later, so the page looked richer without becoming more relevant.

## Product decision

The workspace now follows the investor's daily order:

1. market context;
2. personal decision brief;
3. research and checking actions;
4. a chart tied to the user's largest holding or explicit saved choice;
5. deeper portfolio detail.

The brief uses recorded holdings, confirmed personal limits and saved review history. It does not invent live portfolio values or imply that an absent alert means an absent risk.

The stock panel was also exercised as a real control rather than accepted from source inspection:

- the three chart sizes switch in the browser;
- full-screen mode opens and exits without leaving the page locked;
- a pinned point exposes date, open, high, low, close, daily change, range, MA5, MA20, CSI 300 comparisons and volume;
- the page has no horizontal overflow at a 1,600 px desktop viewport.

The main chart is now paired with a portfolio switcher. Accounts with several holdings see up to six recorded assets ordered by recorded value. Accounts with zero or one holding receive clearly labelled example watch assets so a classroom demo can show multi-asset research without writing fictional positions into the user's portfolio or risk calculations.

The default view now exposes the product's research depth without a tutorial paragraph. A compact research-view switcher applies working presets for price/volume, relative strength, a longer risk window and event verification, while strategy validation opens the existing quant surface. The chart itself supports horizontal brush selection: dragging across a local date interval zooms into it, the selection is visibly highlighted, and users can reset the zoom without losing the selected asset.

## Score impact

This improves activation and repeat-use plausibility, but it does not create external validation evidence. The local candidate remains **86/100** until real users complete the flow and provide auditable behavioural evidence.
