# Mathan ERP Android App

This folder contains the Capacitor Android wrapper for the existing React frontend.

## Development

From this directory:

```bash
npm install
npm run build
npm run android
```

`npm run build` builds `../frontend` in mobile local-first mode and synchronizes the result into `mobile/android`.

Use `npm run open` to open the native project in Android Studio or `npm run sync` after frontend/native plugin changes.

The Android application is local-first. Cash Book and Payroll data are always stored locally on the device using the app's offline store. When a user signs in and internet is available, the workspace snapshots are synchronized with Supabase. Offline changes are queued and retried when connectivity returns. Guests remain local-only and their data does not transfer to another phone.

For a local mobile build, create `../frontend/.env.mobile.local` with:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STANDALONE=false
```

The Supabase migrations in `../backend/supabase/migrations` must be applied to the project, including the `app_state_snapshots` table and its RLS policy.

## GitHub installation and updates

The workflow at [`../.github/workflows/android-release.yml`](../.github/workflows/android-release.yml) builds a signed APK and publishes it to GitHub Releases whenever a tag like `v1.0.1` is pushed. Add these repository secrets before the first release:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Create a release with:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Installed Android users will be notified when a newer GitHub release is available and can open the release page to download it. Android requires the update APK to use the same signing key as the installed version.
