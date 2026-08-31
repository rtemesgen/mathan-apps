# Android offline release checks

The emulator suite is a required CI check, but it does not replace an upgrade
installed by Google Play. Before promoting a production release, complete this
checklist on at least one physical Android device and attach the evidence to the
release ticket.

## Play-installed upgrade and recovery

1. Install the current production version from its Google Play testing or
   production track. Record device model, Android version, app version, and
   version code.
2. Sign in to a non-production test workspace, enable airplane mode, and save
   uniquely named Cash Book, Payroll, and Truck Equity entries. Capture the
   pending-sync count and the names/amounts of every entry.
3. Swipe the app away, run `adb shell am force-stop com.mathan.erp`, relaunch it
   from the launcher while still offline, and verify every entry and pending
   item exactly once.
4. Force-stop during another pending save, relaunch offline, and verify that the
   entry is either durably present with one queued mutation or visibly rejected;
   it must never be reported saved and then disappear.
5. While still offline, use Google Play to install the candidate from the next
   testing track (briefly enable connectivity only for installation, then return
   to airplane mode before opening the app). Do not uninstall or clear storage.
6. Open the upgraded app offline. Verify all pre-upgrade entries, workspace
   isolation, schema-health diagnostics, and the original pending count.
7. Reconnect. Wait until the pending count reaches zero, restart once more, and
   confirm each local entry exists once. Query the test backend by workspace and
   mutation ID and confirm exactly one remote row/acknowledgement per entry.
8. Log out and verify user-scoped cached records and queued mutations are gone;
   sign in to another workspace and confirm that no names or amounts from the
   first workspace are visible.

## Evidence required for release sign-off

- Tester, UTC timestamp, device/model, Android version, source and target Play
  version codes, and Play track.
- Screenshots before force-stop, after offline restart, after upgrade, and after
  synchronization.
- `adb logcat -d -v threadtime`, the in-app offline diagnostic export, pending
  mutation IDs, and backend query results showing exactly-once application.
- A checked release-ticket item linking the successful CI instrumentation run.

Any missing/lost/duplicated entry, cross-workspace record, unhealthy schema, or
queue that does not recover blocks release. Do not mark this check complete from
an APK sideload: the upgrade must be delivered by Google Play.
