# Question lenses — how to ask (the core of learning)

Machine-readable templates/detection live in `question_lenses.json` (single source; this file explains
use). Base: the Socratic question types (clarification, assumptions, reasons/evidence, viewpoints,
implications, questioning the question), extended with investing + automation lenses.

| Lens              | Asks                                                            | Why it matters for an investing rule                                                               |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| L1 Clarify        | What does the vague term mean as a number?                      | "Low float", "visibility", "macros stabilised" can't be automated or tested until they are numbers |
| L2 Assumptions    | What must be true for it to work?                               | Exposes hidden regime / liquidity / cycle dependence                                               |
| L3 Evidence       | Where did he actually apply it? Counter-examples?               | Separates stated rules from practised ones                                                         |
| L4 Mechanism      | Why does it make money?                                         | A rule without a cause breaks silently when the cause disappears                                   |
| L5 Boundary       | When does it NOT apply?                                         | Most rules from 2024-26 are bull-market rules                                                      |
| L6 Conflict       | Does it contradict older views / other experts? Which is newer? | Newest view wins (conventions §28) — but only after it's surfaced                                  |
| L7 Inversion      | How would it lose money? Opposite rule?                         | Pre-mortem; the most-skipped lens                                                                  |
| L8 Operationalize | Which data field measures it? Can a script check it? How often? | The bridge from knowledge → automation                                                             |
| L9 Action         | What exactly do I do when it triggers? Size? Stop?              | A rule without an action is trivia                                                                 |
| L10 Validate      | How will we know it works?                                      | Makes the framework falsifiable                                                                    |
| L11 Personal fit  | Does it suit MY style, capital, time?                           | **Darshan only**                                                                                   |
| L12 Priority      | Which rules matter most?                                        | **Darshan only** (grill-skill: criticality is user-decided)                                        |
| L13 Meta          | What haven't we asked?                                          | **Darshan + engine**                                                                               |

## Generate wide → answer most → surface few

1. `lna questions --module M` applies every applicable lens to every active unit in the module, plus
   module-level L11-L13. Priority = lens weight × (1+ln(1+citations)) × follower-demand boost; decision
   lenses ×2.
2. The agent walks the answer ladder (`answer_ladder.md`) for every non-decision question, cheapest
   rung first, and writes answers back (`questions-apply`).
3. Only the **frontier** reaches Darshan (`lna frontier`): decisions, questions still <0.6 confidence
   after the ladder, and teaching questions. Ask them in grilling rounds (session_protocol.md).
4. A module closes only when its frontier is empty — everything answered, decided or parked with a
   reason. Nothing silently assumed.

## Writing a good question (teach this to Darshan by example)

- One idea per question; name the rule it targets.
- Prefer questions whose answer changes an action (L8/L9/L11) over curiosity questions.
- Turn every adjective into a number question (L1), every "always" into a boundary question (L5),
  every success story into a counter-example question (L3).
- Before adopting a rule, always ask L7 (how it loses money).
