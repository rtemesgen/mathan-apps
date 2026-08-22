# Google Play readiness

## Required product and policy work

- Publish a privacy policy covering accounts, workspace data, contacts, notifications, backups, and third-party services.
- Complete the Play Data safety form from the deployed configuration, not from development defaults.
- Prepare listing copy, screenshots, app icon, feature graphic, support email, and account-deletion instructions.
- Enroll the app in Play App Signing and store only the upload key in CI secrets.
- Keep `versionCode` monotonically increasing; the release workflow uses the GitHub run number.
- Maintain separate production and test Supabase projects and document their configuration.
- Provide an in-app account-deletion request and a documented backend deletion/retention policy.

## Permission and release checks

- Explain contact access before requesting `READ_CONTACTS`.
- The contacts plugin currently declares `WRITE_CONTACTS` for its Android permission alias; remove it only after verifying the installed plugin no longer requires it.
- Test Play-installed upgrades, offline recovery, backup restore, notification permission prompts, and account deletion.
- Keep signed release builds in `.github/workflows/android-release.yml`; ordinary CI must not require signing secrets.
