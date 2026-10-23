# Practical audit repairs

- [x] Reliable checkout, delivery/contact persistence, partial success and EPC submissions.
- [x] Confirmed repair decisions and cancellation without overwriting service notes.
- [x] Service booking details/history/year and consistent back navigation.
- [x] Customer/admin contact and booking/delivery details; expandable notifications.
- [x] Chat draft preservation and initialization errors; fresh tow location and readable status/contact.
- [x] Scheduler date filtering, archive pagination, maintenance time/km status; mechanic workflow left unchanged.
- [x] EPC selection/search/photo behavior; actual AI image parts, no automatic reservation; authenticated inquiry.
- [x] Explicit loading/error/retry states across audited customer pages.
- [x] Four focused regression cycles (51 tests each), complete suite (93 tests), authenticated booking/EPC checks at phone and desktop sizes; live AI text response and schema/grant confirmation.

Verification limits: real purchase submission, repair approval, device GPS acquisition and image analysis were not exercised end-to-end; no customer orders or repair states were changed for testing. Native builds were not produced.

Excluded: mechanic dashboard/tasks/account management; native configuration, authentication implementation, push transport and OBD.