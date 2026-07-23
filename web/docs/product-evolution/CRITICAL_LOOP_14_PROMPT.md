# Critical Loop 14 — International judge path

## Critical finding

The English locale was not yet a credible end-to-end product experience:

- the default workspace name and saved portfolio summary remained Chinese;
- the global research assistant retained Chinese interface copy after switching locale;
- the 90-second core decision demo was Chinese-only;
- an international judge could read the evidence center but could not independently complete the product's main story in English.

This is a P0 presentation and comprehension defect. It must be fixed before adding another feature.

## Implementation prompt

1. Localize the complete 90-second decision workflow, not only the page title.
2. Preserve the same deterministic calculations and safety boundary in both languages.
3. Localize the home workspace's persisted default names and portfolio summary without rewriting user-created content.
4. Localize the global assistant shell, welcome message, quick actions, model status, composer and configuration controls.
5. Keep Chinese company names, original filing titles and Chinese source names when they are primary-source evidence.
6. Verify the English route in a real browser by completing all four demo steps.
7. Do not increase the course score without external user or payment evidence.

## Acceptance evidence

- English home has no Chinese product copy in workspace controls or portfolio summary.
- The assistant's welcome, controls and task suggestions are English after hydration.
- The demo supports amount selection, rationale selection, evidence review and a user-owned final choice in English.
- The final outcome explicitly states the complete information → verification → personal impact → decision loop.
- No horizontal overflow.
- Full automated suite passes.
