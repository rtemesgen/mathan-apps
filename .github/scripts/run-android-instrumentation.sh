#!/usr/bin/env bash

set +e

adb reverse tcp:54321 tcp:54321
echo "Android page size: $(adb shell getconf PAGE_SIZE | tr -d '\r')"
adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true
adb logcat -c

./gradlew connectedDebugAndroidTest --stacktrace
test_status=$?

if [ "$test_status" -eq 0 ]; then
  target_package=$(./gradlew -q printDebugApplicationId | tail -n 1 | tr -d '\r')
  if [ -z "$target_package" ]; then
    test_status=1
  else
    test_apk="app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
    if [ ! -f "$test_apk" ]; then
      echo "Android test APK was not produced: $test_apk"
      test_status=1
    else
      # connectedDebugAndroidTest may remove the test APK after its run. Reinstall
      # only the test APK; do not clear the application package or its database.
      adb install -r -g "$test_apk"
      test_status=$?
    fi
  fi
fi

if [ "$test_status" -eq 0 ]; then
  test_package="${target_package}.test"
  instrumentation_runner=$(adb shell pm list instrumentation | tr -d '\r' | sed -n "s/^instrumentation:\([^ ]*\).*$/\1/p" | grep "^${test_package}/" | head -n 1)
  if [ -z "$instrumentation_runner" ]; then
    echo "Android instrumentation component was not installed for $test_package"
    test_status=1
  else
    adb shell am instrument -w -r \
      -e class 'com.mathan.erp.OfflineSQLiteInstrumentedTest#processDeathPrepareBoundary' \
      -e processDeathPhase prepare \
      "$instrumentation_runner"
    test_status=$?
  fi
fi

if [ "$test_status" -eq 0 ]; then
  target_package=$(./gradlew -q printDebugApplicationId | tail -n 1 | tr -d '\r')
  if [ -z "$target_package" ]; then
    test_status=1
  else
    adb shell am force-stop "$target_package" || test_status=$?
    deadline=$((SECONDS + 20))
    while [ "$test_status" -eq 0 ] && [ "$SECONDS" -lt "$deadline" ] && [ -n "$(adb shell pidof "$target_package" | tr -d '\r')" ]; do
      sleep 1
    done
    test -z "$(adb shell pidof "$target_package" | tr -d '\r')" || test_status=$?
  fi
fi

if [ "$test_status" -eq 0 ]; then
  adb shell am instrument -w -r \
    -e class 'com.mathan.erp.OfflineSQLiteInstrumentedTest#processDeathVerifyBoundary' \
    -e processDeathPhase verify \
    -e clearPackageData false \
    "$instrumentation_runner"
  test_status=$?
fi

if [ "$test_status" -ne 0 ]; then
  mkdir -p app/build/android-diagnostics
  adb logcat -d -v threadtime > app/build/android-diagnostics/logcat.txt || true
  adb shell dumpsys activity processes > app/build/android-diagnostics/processes.txt || true
  adb shell run-as com.mathan.erp.debug sh -c 'find databases shared_prefs -type f -maxdepth 2 -print -exec du -h {} \;' \
    > app/build/android-diagnostics/database-files.txt 2>&1 || true
fi

exit "$test_status"
