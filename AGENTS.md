# Architecture rules

- Keep audit fixes within existing customer/admin features; do not change native build, authentication transport, push transport or diagnostics for unrelated usability work.
- Persist checkout-specific recipient information on the order, independent of mutable profile contact data, to preserve the original delivery instructions.
- Treat a write as successful only when its error is absent and its persisted record is returned; retain failed items and drafts for retry.
- Keep reliability calculations in shared pure helpers with focused tests, and reuse booking/delivery detail renderers across customer and admin views.
- Customer repair decisions must update the order and status history atomically in an authenticated owner-checked database function.- Persist every non-empty J+M vehicle parts result in a durable snapshot table (never auto-expired) and serve it, by vehicle then shared engine ID, when the J+M daily quota blocks live fetches.
