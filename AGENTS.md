# Architecture rules

- Keep audit fixes within existing customer/admin features; do not change native build, authentication transport, push transport or diagnostics for unrelated usability work.
- Persist checkout-specific recipient information on the order, independent of mutable profile contact data, to preserve the original delivery instructions.
- Treat a write as successful only when its error is absent and its persisted record is returned; retain failed items and drafts for retry.