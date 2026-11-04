# Changelog

## 0.1.0 (2026-11-04)

First version.

- **Treza** node: Video (Generate, Assemble), Image (Generate), Media (Edit, Import From URL, Upload), Pipeline (Run, Estimate Cost, Get Many), Run (Get, Get Many, Cancel, Wait for Completion), Account (Get Balance).
- **Treza Trigger**: polls a pipeline and fires when a run finishes, filtered by status.
- **Treza API** credential, tested against the credit balance.
- Max Cost on every quoted render. Quotes are retried when another render takes the scratch pipeline first, waits time out without failing, and executions that are stopped cancel the render.
