#!/usr/bin/env bash

set +e

adb reverse tcp:54321 tcp:54321
echo "Android page size: $(adb shell getconf PAGE_SIZE | tr -d '\r')"
adb shell dumpsys package com.google.android.webview | grep -m1 versionName || true

gradle_test_args=()

if [ "${ANDROID_16KB_MEMORY_MODE:-}" = "true" ]; then
  # The Google 16 KB image starts many optional services which consume the
  # guest's limited RAM before the WebView-based instrumentation app launches.
  # Stop only nonessential services; keep WebView, Chrome, Play services, and
  # Android framework packages available to the application under test.
  for package_name in \
    com.google.android.googlequicksearchbox \
    com.google.android.inputmethod.latin \
    com.google.android.tts \
    com.google.android.apps.wellbeing \
    com.google.android.as \
    com.google.android.as.oss \
    com.google.android.onetimeinitializer \
    com.google.android.ext.services \
    com.google.android.settings.intelligence \
    com.google.android.federatedcompute \
    com.google.android.ondevicepersonalization.services \
    com.google.android.apps.wallpaper \
    com.google.android.apps.messaging \
    com.android.chrome; do
    adb shell am force-stop "$package_name" >/dev/null 2>&1 || true
    adb shell pm disable-user --user 0 "$package_name" >/dev/null 2>&1 || true
  done
  # The 16 KB image can run the SQLite/WebView path, but it cannot reliably
  # move a 4.9 MB multi-attachment JSON payload through evaluateJavascript.
  # Keep the 1 MB smoke test in this job; the complete capacity matrix runs in
  # the normal Android job and on the physical-device release checklist.
  gradle_test_args+=("-Pandroid.testInstrumentationRunnerArguments.skipLargeAttachmentCapacity=true")
  # Backend-connected Truck synchronization is exercised by the normal
  # Android job. Keep this 16 KB job focused on native SQLite/WebView runtime
  # compatibility; constrained WebView startup is not a backend assertion.
  gradle_test_args+=("-Pandroid.testInstrumentationRunnerArguments.skipBackendIntegration=true")
  # The constrained 16 KB Google image crashes Chromium's MemoryInfra during
  # the multi-domain Activity-recreation stress case. The same test remains a
  # required part of the normal Android job; keep this job focused on the
  # 16 KB SQLite/WebView compatibility checks that do not require that stress
  # matrix.
  gradle_test_args+=("-Pandroid.testInstrumentationRunnerArguments.skipRestartStress=true")
fi

adb logcat -c

./gradlew connectedDebugAndroidTest "${gradle_test_args[@]}" --stacktrace
test_status=$?

if [ "$test_status" -eq 0 ]; then
  target_package=$(./gradlew -q printDebugApplicationId | tail -n 1 | tr -d '\r')
  if [ -z "$target_package" ]; then
    test_status=1
  else
    target_apk="app/build/outputs/apk/debug/app-debug.apk"
    test_apk="app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
    if [ ! -f "$target_apk" ] || [ ! -f "$test_apk" ]; then
      echo "Android APKs were not produced: target=$target_apk test=$test_apk"
      test_status=1
    else
      # connectedDebugAndroidTest may remove both packages after its run. Reinstall
      # with -r so the process-death phase keeps the target app's SQLite data.
      adb install -r -g "$target_apk"
      test_status=$?
      if [ "$test_status" -eq 0 ]; then
        adb install -r -g "$test_apk"
        test_status=$?
      fi
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
