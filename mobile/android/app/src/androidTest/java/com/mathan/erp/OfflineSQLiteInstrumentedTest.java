package com.mathan.erp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import android.os.ParcelFileDescriptor;
import android.Manifest;
import android.os.Build;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Assume;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.UUID;

/** End-to-end durability tests. These launch the real BridgeActivity/WebView;
 * JavaScript calls enter the application's OfflineStore and the production
 * @capacitor-community/sqlite adapter (not an Android test double). */
@RunWith(AndroidJUnit4.class)
@LargeTest
public class OfflineSQLiteInstrumentedTest {
    @org.junit.Rule
    public GrantPermissionRule runtimePermissions = notificationPermissionRule();

    private static GrantPermissionRule notificationPermissionRule() {
        // POST_NOTIFICATIONS was introduced in API 33. Asking Android 12 and
        // older devices to grant it aborts every test before the app starts.
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
                : GrantPermissionRule.grant();
    }

    private ActivityScenario<MainActivity> scenario;

    @Before public void launch() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitApi();
        if (!"verify".equals(processDeathPhase())) js("return await api.reset()", true);
    }

    @After public void close() { if (scenario != null) scenario.close(); }

    @Test public void cashPayrollAndTruckSurviveRestartAndSynchronizeExactlyOnce() throws Exception {
        save("alpha", "cash_book", "cash-1", 125, "fuel");
        save("alpha", "payroll", "payroll-1", 800, "weekly wage");
        save("alpha", "truck_equity", "truck-1", 2500, "owner equity");
        assertEquals(3, array(js("return await api.queue()", false)).length());

        recreateApplication();
        assertEntry("alpha", "cash_book", "cash-1");
        assertEntry("alpha", "payroll", "payroll-1");
        assertEntry("alpha", "truck_equity", "truck-1");

        JSONArray queued = array(js("return await api.queue()", false));
        for (int i = 0; i < queued.length(); i++) {
            String id = queued.getJSONObject(i).getString("mutationId");
            assertEquals(0, number(js("return await api.acknowledgeOnce(" + JSONObject.quote(id) + ")", false)));
            assertEquals(0, number(js("return await api.acknowledgeOnce(" + JSONObject.quote(id) + ")", false)));
        }
        assertEquals(0, array(js("return await api.queue()", false)).length());
        assertTrue(object(js("return await api.health()", false)).getBoolean("healthy"));
    }

    @Test public void failedWriteIsRejectedWithoutPoisoningQueue() throws Exception {
        JSONObject result = object(js("try { await api.failWrite(); return {failed:false}; } catch(e) { return {failed:true,message:String(e)}; }", false));
        assertTrue(result.getBoolean("failed"));
        assertEquals(0, array(js("return await api.queue()", false)).length());
        save("alpha", "cash_book", "after-failure", 1, "recovered");
        assertEntry("alpha", "cash_book", "after-failure");
    }

    @Test public void staleQueueRecoversAfterPendingSaveAndActivityRecreation() throws Exception {
        save("alpha", "payroll", "pending-1", 42, "pending");
        recreateApplication();
        JSONArray recovered = array(js("return await api.recoverQueue()", false));
        assertEquals(1, recovered.length());
        assertEquals("pending-1", recovered.getJSONObject(0).getString("mutationId"));
        assertEntry("alpha", "payroll", "pending-1");
    }

    /** Prepare one durable queue entry; the host force-stops the app before
     * processDeathVerifyBoundary runs in a fresh instrumentation invocation. */
    @Test public void processDeathPrepareBoundary() throws Exception {
        Assume.assumeTrue("prepare".equals(processDeathPhase()));
        save("process-death-workspace", "payroll", "process-death-entry", 42, "host force-stop");
        assertEquals(1, array(js("return await api.recoverQueue()", false)).length());
        if (!skipBackendIntegration()) {
            JSONObject queued = object(js("return await api.backendOfflineTruckRoundTrip()", false));
            assertEquals(1, queued.getInt("queued"));
        }
    }

    /** Verify the entry after the host, rather than the app, killed the app. */
    @Test public void processDeathVerifyBoundary() throws Exception {
        Assume.assumeTrue("verify".equals(processDeathPhase()));
        JSONArray recovered = array(js("return await api.recoverQueue()", false));
        assertEquals(1, recovered.length());
        assertEquals("process-death-entry", recovered.getJSONObject(0).getString("mutationId"));
        assertEntry("process-death-workspace", "payroll", "process-death-entry");
        if (!skipBackendIntegration()) {
            JSONObject synced = object(js("return await api.backendProcessDeathVerify()", false));
            assertEquals(1, synced.getInt("serverCount"));
            assertEquals(0, synced.getInt("queued"));
        }
    }

    @Test public void releasedSchemaAndInterruptedMigrationResumeIdempotently() throws Exception {
        JSONObject migration = object(js("return await api.exerciseInterruptedLegacyMigration()", false));
        assertTrue(migration.getBoolean("marker"));
        assertTrue(migration.getJSONObject("value").getBoolean("retained"));
        assertEquals(2, object(js("return await api.health()", false)).getInt("actualVersion"));
    }

    @Test public void logoutCleanupDoesNotCrossWorkspaceBoundary() throws Exception {
        save("alpha", "cash_book", "alpha-entry", 10, "alpha");
        save("beta", "cash_book", "beta-entry", 20, "beta");
        js("return await api.logout('alpha')", true);
        assertEquals(0, array(js("return await api.read('alpha','cash_book') || []", false)).length());
        assertEntry("beta", "cash_book", "beta-entry");
        JSONArray queue = array(js("return await api.queue()", false));
        assertEquals(1, queue.length());
        assertEquals("beta", queue.getJSONObject(0).getString("companyId"));
    }

    @Test public void upgradeInstallationKeepsExistingOfflineData() throws Exception {
        save("upgrade-workspace", "truck_equity", "pre-upgrade", 900, "installed version data");
        recreateApplication(); // CI validates the same-version install path; the physical-device runbook covers Play replacement.
        assertEntry("upgrade-workspace", "truck_equity", "pre-upgrade");
        assertFalse(array(js("return await api.queue()", false)).length() == 0);
    }

    @Test public void productionTruckRepositoryReachesBackendAndSurvivesActivityRecreation() throws Exception {
        Assume.assumeFalse("Backend integration runs in the normal Android job.", skipBackendIntegration());
        JSONObject created = object(js("return await api.backendTruckRoundTrip()", false));
        assertEquals(1, created.getInt("serverCount"));
        recreateApplication();
        JSONObject verified = object(js("return await api.backendVerify(" + JSONObject.quote(created.getString("workspaceId")) + "," + JSONObject.quote(created.getString("transactionId")) + ")", false));
        assertEquals(1, verified.getInt("serverCount"));
        assertTrue(verified.getBoolean("localContains"));
    }

    @Test public void offlineProductionTruckSaveSurvivesActivityRecreationAndSyncsExactlyOnce() throws Exception {
        Assume.assumeFalse("Backend integration runs in the normal Android job.", skipBackendIntegration());
        JSONObject queued = object(js("return await api.backendOfflineTruckRoundTrip()", false));
        assertEquals(1, queued.getInt("queued"));
        recreateApplication();
        JSONObject synced = object(js("return await api.backendSyncQueuedTruck(" + JSONObject.quote(queued.getString("workspaceId")) + "," + JSONObject.quote(queued.getString("transactionId")) + ")", false));
        assertEquals(1, synced.getInt("serverCount"));
        assertEquals(0, synced.getInt("queued"));
        JSONObject repeated = object(js("return await api.backendSyncQueuedTruck(" + JSONObject.quote(queued.getString("workspaceId")) + "," + JSONObject.quote(queued.getString("transactionId")) + ")", false));
        assertEquals(1, repeated.getInt("serverCount"));
        assertEquals(0, repeated.getInt("queued"));
    }

    @Test public void embeddedAttachmentCapacitySurvivesReadAndActivityRecreation() throws Exception {
        // The 16 KB Google image has a materially smaller WebView/native
        // memory budget. Keep a useful embedded-attachment smoke check there,
        // while reserving the full 4.9 MB capacity gate for the normal Android
        // runtime and physical-device runbook.
        int[] sourceBytes = skipLargeAttachmentCapacity()
                ? new int[] {262_144}
                : new int[] {1_048_576, 3_145_728, 4_900_000};
        for (int sourceByteCount : sourceBytes) {
            JSONObject written = object(js("return await api.writeAttachmentCapacity(" + sourceByteCount + ")", false));
            System.out.println("ATTACHMENT_CAPACITY " + written);
            assertEquals(sourceByteCount, written.getInt("sourceBytes"));
            assertTrue(written.getInt("serializedBytes") > sourceByteCount);
            assertEquals(written.getInt("serializedBytes"), object(js("return await api.readAttachmentCapacity()", false)).getInt("serializedBytes"));

            recreateApplication();
            JSONObject restarted = object(js("return await api.readAttachmentCapacity()", false));
            System.out.println("ATTACHMENT_CAPACITY_RESTART " + restarted);
            assertEquals(sourceByteCount, restarted.getInt("sourceBytes"));
            assertEquals(written.getInt("serializedBytes"), restarted.getInt("serializedBytes"));
            js("return await api.clearAttachmentCapacity()", true);
        }
    }

    @Test public void multipleAttachmentsAndQueuedCopiesSurviveReadAndActivityRecreation() throws Exception {
        Assume.assumeFalse("Large attachment matrix is covered on normal Android and physical devices.", skipLargeAttachmentCapacity());
        JSONObject written = object(js("return await api.writeAttachmentCapacity(4900000, 3, 2)", false));
        System.out.println("ATTACHMENT_CAPACITY_MATRIX " + written);
        assertEquals(3, written.getInt("attachmentCount"));
        assertEquals(2, written.getInt("queueCopies"));
        assertTrue(written.getInt("queueSerializedBytes") >= written.getInt("serializedBytes") * 2);

        recreateApplication();
        JSONObject restarted = object(js("return await api.readAttachmentCapacity()", false));
        System.out.println("ATTACHMENT_CAPACITY_MATRIX_RESTART " + restarted);
        assertEquals(3, restarted.getInt("attachmentCount"));
        assertEquals(2, restarted.getInt("queueCopies"));
        js("return await api.clearAttachmentCapacity()", true);
    }

    private void save(String workspace, String domain, String id, int amount, String note) throws Exception {
        js("return await api.save(" + JSONObject.quote(workspace) + "," + JSONObject.quote(domain) + "," +
                new JSONObject().put("id", id).put("amount", amount).put("note", note) + ")", true);
    }

    private void assertEntry(String workspace, String domain, String id) throws Exception {
        JSONArray values = array(js("return await api.read(" + JSONObject.quote(workspace) + "," + JSONObject.quote(domain) + ") || []", false));
        assertTrue(values.toString(), values.toString().contains("\"id\":\"" + id + "\""));
    }

    private void recreateApplication() throws Exception { scenario.recreate(); awaitApi(); }

    private String processDeathPhase() {
        return InstrumentationRegistry.getArguments().getString("processDeathPhase", "");
    }

    private boolean skipLargeAttachmentCapacity() {
        return "true".equals(InstrumentationRegistry.getArguments().getString("skipLargeAttachmentCapacity", "false"));
    }

    private boolean skipBackendIntegration() {
        return "true".equals(InstrumentationRegistry.getArguments().getString("skipBackendIntegration", "false"));
    }

    private void awaitApi() throws Exception {
        // The 16 KB Google image can take longer to recreate WebView after
        // several ActivityScenario restarts.  This only extends readiness
        // polling; the actual SQLite operation assertions retain their
        // existing timeout and failure behavior.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
        while (System.nanoTime() < deadline) {
            if ("true".equals(js("return !!window.__mathanAndroidTest", false))) return;
            Thread.sleep(200);
        }
        throw new AssertionError("instrumentation API did not become ready");
    }

    private String js(String body, boolean ignoreResult) throws Exception {
        String token = "__mathanResult_" + UUID.randomUUID().toString().replace("-", "");
        evaluate("(async()=>{const api=window.__mathanAndroidTest;try{const v=await(async()=>{" + body + "})();window." + token + "=JSON.stringify({ok:true,v});}catch(e){window." + token + "=JSON.stringify({ok:false,e:String(e&&e.stack||e)});}})()");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        String raw = "null";
        while (System.nanoTime() < deadline) {
            raw = evaluate("window." + token + "||null");
            if (!"null".equals(raw)) break;
            Thread.sleep(50);
        }
        if ("null".equals(raw)) throw new AssertionError("JavaScript operation timed out: " + body);
        evaluate("delete window." + token);
        String envelopeText = new org.json.JSONTokener(raw).nextValue().toString();
        JSONObject envelope = new JSONObject(envelopeText);
        if (!envelope.optBoolean("ok")) throw new AssertionError(envelope.optString("e"));
        Object result = envelope.opt("v");
        return ignoreResult || result == null || result == JSONObject.NULL ? (ignoreResult ? "" : "null") : result.toString();
    }

    private String evaluate(String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>("null");
        CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            webView.evaluateJavascript(script, raw -> {
                value.set(raw);
                latch.countDown();
            });
        });
        if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("evaluateJavascript timed out");
        return value.get();
    }

    private static JSONArray array(String value) throws Exception { return new JSONArray(value); }
    private static JSONObject object(String value) throws Exception { return new JSONObject(value); }
    private static int number(String value) { return Integer.parseInt(value); }
}
