#!/usr/bin/env bash

set +e

adb reverse tcp:54321 tcp:54321
echo "Android page size: $(adb shell getconf PAGE_SIZE | tr -d '\r')"
adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true
adb logcat -c

./gradlew connectedDebugAndroidTest --stacktrace
test_status=$?

if [ "$test_status" -eq 0 ]; then
  ./gradlew connectedDebugAndroidTest --stacktrace \
    '-Pandroid.testInstrumentationRunnerArguments.class=com.mathan.erp.OfflineSQLiteInstrumentedTest#processDeathPrepareBoundary' \
    '-Pandroid.testInstrumentationRunnerArguments.processDeathPhase=prepare'
  test_status=$?
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
  ./gradlew connectedDebugAndroidTest --stacktrace \
    '-Pandroid.testInstrumentationRunnerArguments.class=com.mathan.erp.OfflineSQLiteInstrumentedTest#processDeathVerifyBoundary' \
    '-Pandroid.testInstrumentationRunnerArguments.processDeathPhase=verify' \
    '-Pandroid.testInstrumentationRunnerArguments.clearPackageData=false'
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
