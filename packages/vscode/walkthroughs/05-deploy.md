# Deploy to your tenant

Use the Microsoft 365 Agents Toolkit's **Provision** flow. CALT will surface
any blocking errors before the deploy starts (configurable via
`.caltrc.json` `block_on` once Phase 3 lands).

For now, the CI workflow generated in the previous step will fail any pipeline
where CALT reports errors — giving you the same protection in code review.
