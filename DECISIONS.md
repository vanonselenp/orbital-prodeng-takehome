# Highest Impact Issues

## Hallucination / Unsourced Responses (CRITICAL)

*Data signal*: Responses with sources_cited = 0 strongly correlate with thumbs_down feedback. Roughly 30% of all responses cite 0 sources, and these are disproportionately the ones receiving negative feedback.

*Customer feedback*: This is the #1 concern across multiple firms:
- "gave me an answer that sounds completely authoritative and is just... not in the document" (Partner, Firm A)
- "cited a clause that doesn't exist... She doesn't trust it now" (Partner, Firm B)
- "When it doesn't cite anything specific, I have to go find it myself anyway, so what's the point?" (Associate, Firm A)
- "I'd pay double the licence fee if the AI would just tell me when it's not sure" (Partner, Firm A)

*Impact*: This is an existential trust issue. Users are lawyers advising on multi-million pound transactions. Confident hallucination is actively dangerous and is causing user churn (the associate who "stopped" after a week). The data shows users who receive 0-source responses give thumbs_down, and some never return. Fixing this unlocks retention.

*Potential actions*: Add a confidence indicator, enforce source citation requirements, surface "I don't know" when the model can't ground its answer in the document.

*Action chosen*: Just enfore source citation requirements as an MVP. It should add confidence in the results, reduce hallucination risk and enable users to find the relevant references faster.