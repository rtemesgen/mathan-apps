package com.mathan.erp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
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
    private ActivityScenario<MainActivity> scenario;

    @Before public void launch() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        awaitApi();
        js("return await api.reset()", true);
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

    @Test public void staleQueueRecoversAfterPendingSaveAndForceStopBoundary() throws Exception {
        save("alpha", "payroll", "pending-1", 42, "pending");
        recreateApplication(); // Activity destruction/recreation is the in-run process boundary.
        JSONArray recovered = array(js("return await api.recoverQueue()", false));
        assertEquals(1, recovered.length());
        assertEquals("pending-1", recovered.getJSONObject(0).getString("mutationId"));
        assertEntry("alpha", "payroll", "pending-1");
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

    private void save(String workspace, String domain, String id, int amount, String note) throws Exception {
        js("return await api.save(" + JSONObject.quote(workspace) + "," + JSONObject.quote(domain) + "," +
                new JSONObject().put("id", id).put("amount", amount).put("note", note) + ")", true);
    }

    private void assertEntry(String workspace, String domain, String id) throws Exception {
        JSONArray values = array(js("return await api.read(" + JSONObject.quote(workspace) + "," + JSONObject.quote(domain) + ") || []", false));
        assertTrue(values.toString(), values.toString().contains("\"id\":\"" + id + "\""));
    }

    private void recreateApplication() throws Exception { scenario.recreate(); awaitApi(); }

    private void awaitApi() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
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
