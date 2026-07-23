# Critical Loop 14

## Judge finding

The candidate could show an English navigation and evaluation page, but the core product story still broke into Chinese. That would make an international course judge depend on the presenter instead of independently understanding the product.

## Changes

- Localized the full four-step 90-second decision demo:
  - plan amount and resulting portfolio weight;
  - rationale selection;
  - evidence gap, inference risk and personal rule;
  - reduce-or-delay choice and before/after result.
- Localized the global research assistant:
  - welcome and quick actions;
  - page context and suggestions;
  - provider state and processing location;
  - workspace actions, composer and confirmation controls.
- Localized persisted default workspace names and the home portfolio summary.
- Preserved original Chinese issuer, filing and source names as primary-source evidence.

## Verification

- Production build completed.
- Automated tests: **109/109**.
- Browser test in English completed all four demo stages using the FOMO rationale.
- The final outcome appeared exactly once:
  - `You completed the full loop: information → verification → personal impact → your decision.`
- English assistant displayed an English welcome after hydration and showed the configured model as `My HKGAI`.
- The tested demo viewport had `scrollWidth === clientWidth` (1581 px), so it introduced no horizontal overflow.

## Score discipline

This removes an international presentation defect but does not prove retention, behavior change or willingness to pay. The unpublished candidate remains **86/100** and the deployed production version remains **82/100** until a later release and external validation.
