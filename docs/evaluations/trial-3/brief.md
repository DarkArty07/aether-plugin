Intent: make the swarm cheaper and better by choosing effort as well as model, without losing speed.
Stop condition: the plan is committed, passes aether-plan check, and the session offers the execution options. Then reply DONE.

Items the design must capture:
1. Haiku implementers run at xhigh by default.
2. Effort is chosen per task by its complexity, and the plan states it.
3. The escalation ladder steps through model-and-effort pairs, raising effort before moving to a more expensive model where the data supports it.
4. Sonnet at low or medium is not used for implementers: Haiku at xhigh matches it for a fraction of the price.
5. The ops agent stays at low effort.
6. The supervisor's effort can be raised, to close the review-depth gap that trial 1 found.
7. The workflow passes the effort on each agent() call; the agent file's effort is only the default.
8. Plans that give only a tier keep working, with defaults.
9. The usage meter records every agent's effort, and aether-report shows it.
10. A real smoke run checks, from the transcripts, that the effort the workflow passes reaches each agent.

Preferences: max effort is avoided by default because of its latency; nothing is over-engineered; superpowers stays the method.
