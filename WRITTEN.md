# Most Significant Technical Achievement

## The problem and its context

I joined Cazoo in November 2019, a month before launch, as sole owner of a third-party warranty integration that was legally required for every car sold. No warranty, no sale. Our provider was Assurant, a traditional insurer with limited engineering investment in their integration surface: opaque API, partial documentation, behaviour that didn't match the contract.

Over three years that single integration grew into a product domain (extended warranties, service plans, paint protection) sold across five countries, contributing roughly £500–600 of gross profit per unit against Cazoo's overall GPU of around £1,800. Nearly a third of the per-car profit came through the domain my team owned. This is how an unreliable compliance obligation became a product line.

## Complexity and constraints

The provider had a failure pattern where it would drop requests for an hour, recover, then drop them again. Every failure became a P1: car sold, no warranty attached, Cazoo legally exposed, on-call engineer paged. I was that engineer for twelve months. We couldn't switch providers because the commercial relationship was fixed, so I had to make our system resilient to someone else's unreliability without visibility into when failures would happen.

Once stabilised, the scope expanded dramatically: three new products to add, internationalisation across four European markets, and a platform that needed to support experimentation. This wasn't a feature addition. It was a re-architecture of the entire domain, done while the existing system kept running and generating revenue.

## My approach

For stabilisation, I built an AWS Step Functions exponential backoff system stepping through eight hours of retry windows (5min, 10, 20, 40, 90min, 3hr). The principle was simple: assume the third party will come back, only page a human when the failure is genuinely ours. P1s from the integration stopped.

For the transformation, I took four weeks of architectural analysis before building anything, producing current-state and north-star diagrams. The north star committed to specific things: anti-corruption layers isolating Cazoo's domain from third-party shapes, micro-frontends extracted from the checkout application, and a product model treating warranties, service plans and paint protection as instances of a common abstraction rather than bespoke integrations.

We then built the minimum viable version: micro-frontend extraction, a coordinating domain, and the first instance of the anti-corruption pattern all future integrations would follow. From that point, every piece of feature work was deliberately scoped to also move the architecture one step closer to the north star. New product? Behind the anti-corruption layer. New market? Through the coordinator. Tech debt wasn't a separate backlog to get to later, it was a constraint on every story. **Refactor projects almost never get funded at a company moving as fast as Cazoo was; folding migration into feature work was the only way to get the architecture I wanted without asking the business to pause delivery.**

Alongside the technical work, I ran regular sessions ensuring everyone on the team (designers, PM, QA, EM) could reason about the architectural implications of product decisions. The result was a PM who pushed back on feature ideas because he understood why they'd leak third-party concepts into our domain, and designers thinking about the same boundaries the engineers were. Cross-functional ownership is easy to claim and hard to actually build.

## Impact

**Financially**, the domain moved from a pure cost centre to contributing £500–600 GPU per car sold. **Operationally**, P1 incidents from the warranty integration stopped being routine. **Organisationally**, a cross-functional team of ten now owned a roadmap expanding across the UK, France, Germany, Italy and Spain, where there had previously been one person.

The architectural diagrams became living documents referenced in every major technical conversation in the team for three years, and survived as the domain's reference point until Cazoo folded. A mid-level engineer I'd set up to own the service plans product end-to-end was promoted to senior off the back of that work, and stepped into the EM role when I moved to consumer finance.

## Reflection

The honest answer is that the shape of this work would change fundamentally if I tackled it today, because the tools have changed.

The four weeks of architectural analysis was the right decision at the time, but most of it was spent holding context across a sprawling system: reading code, tracing dependencies, talking to people who'd made undocumented decisions. That context-holding is exactly what AI tooling is best at now. If I were doing it today, I'd expect to compress that phase dramatically: prototype two or three alternative north-star architectures in parallel with AI-assisted exploration, validate assumptions against the real codebase in days rather than weeks, and commit with more evidence than I had. The judgement work of deciding which architecture best fits the business trajectory and which trade-offs are acceptable doesn't go away, but the cost of exploring alternatives drops enough that I'd look at more options before committing.

The other thing I'd change: I was sole owner of the domain for twelve months before the team formed, and that was too long. I treated the depth of my domain knowledge as an asset, but it was also a fragility, because the business couldn't move the work without moving me. I'd distribute ownership earlier next time, even at the cost of short-term velocity, because the organisational flexibility it creates is worth more than the individual productivity it costs.