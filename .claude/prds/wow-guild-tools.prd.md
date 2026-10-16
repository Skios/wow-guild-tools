# WoW Guild Tools - Raid Coordination

## Problem
Raid Leaders and Officers spend days "hunting and chasing" members for event sign-ups. Members ignore "wall of text" announcements, leading to uncertainty about roster availability and delays in event planning.

## Evidence
- Officers complain constantly about the manual overhead.
- Existing "wall of text" announcements in Telegram are ineffective.
- Coordination is currently a multi-day manual process.

## Users
- **Primary**: Raid Leaders and Officers who organize event rosters.
- **Not for**: Members who only want to see the final list without interacting with the signup process.

## Hypothesis
We believe **targeted notifications and automated nudges** will **eliminate the need for officers to manually chase members for responses** for **Raid Leaders and Officers**.
We'll know we're right when **the time spent by officers on roster coordination per event drops from days to minutes**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Coordination Time | < 1 hour per event | Officer self-report/logs |
| Response Rate | > 90% before deadline | Response count / Invited count |

## Scope
**MVP**
- **Event Creation**: Basic details (date, time, roster).
- **Channel Notification**: Notify the roster via a shared channel.
- **Response System**: Simple In/Out/Tentative responses.
- **Organizer Review**: Officer selects the final participants from the responses.
- **Final Publication**: Generate a final roster table and publish to the channel.

**Out of scope**
- **Alt Support**: Users will be registered with a single character for the MVP.
- **WoW Armory Integration**: Gear/ILVL data will not be pulled automatically.
- **Main/Off-Spec**: Spec management is deferred to a later phase.
- **Multi-Platform Sync**: Initial focus on one primary channel (e.g., Telegram).

## Delivery Milestones
| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Core Engine | Ability to create event and store responses | pending | — |
| 2 | Notification Layer | Automated invites sent to the channel | pending | — |
| 3 | Roster Finalizer | Officer can select final team and publish table | in-progress | .claude/plans/wow-guild-tools.plan.md |
| 4 | Nudge System | Automated reminders for non-responders | pending | — |

## Open Questions
- [ ] Which API is most stable for the chosen notification platform?
- [ ] How to handle "Late" communication if it's not in the MVP response set?
- [ ] How to uniquely identify users across different chat platforms?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Platform API limits | Medium | High | Implement queuing and rate-limiting |
| User Apathy | High | Medium | Focus on the "Nudge" system to be helpful, not annoying |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
