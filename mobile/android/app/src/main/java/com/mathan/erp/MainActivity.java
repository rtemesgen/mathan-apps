package com.mathan.erp;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MathanMainActivity";
    private static final String OFFLINE_DATABASE = "mathan-erp-offline";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        closeOfflineDatabaseBeforeBridgeTeardown();
        super.onPause();
    }

    /**
     * The SQLite plugin stores its native connection on the current plugin
     * instance. A WebView recreation creates a new plugin instance, so the
     * replacement bridge cannot close the old connection and SQLCipher can
     * remain locked. Close the connection while the old bridge still owns it.
     *
     * The upstream plugin does not expose a lifecycle close API. Keep this
     * reflection isolated here and fail safely if that implementation changes;
     * the JavaScript recovery path still handles ordinary stale connections.
     */
    private void closeOfflineDatabaseBeforeBridgeTeardown() {
        try {
            if (getBridge() == null) return;
            PluginHandle handle = getBridge().getPlugin("CapacitorSQLite");
            if (handle == null) return;
            Plugin plugin = handle.getInstance();
            if (plugin == null) return;

            Field implementationField = plugin.getClass().getDeclaredField("implementation");
            implementationField.setAccessible(true);
            Object implementation = implementationField.get(plugin);
            if (implementation == null) return;

            Method rollbackTransaction = implementation.getClass().getMethod("rollbackTransaction", String.class);
            Method closeConnection = implementation.getClass().getMethod("closeConnection", String.class, Boolean.class);
            CountDownLatch completed = new CountDownLatch(1);
            AtomicReference<Throwable> failure = new AtomicReference<>();

            // Capacitor routes plugin calls through its worker HandlerThread. SQLite
            // transactions are thread-local, so invoking these methods directly from
            // Activity.onPause() cannot roll back the transaction that holds the lock.
            getBridge().execute(() -> {
                try {
                    rollbackTransaction.invoke(implementation, OFFLINE_DATABASE);
                    closeConnection.invoke(implementation, OFFLINE_DATABASE, false);
                } catch (Throwable error) {
                    failure.set(error);
                } finally {
                    completed.countDown();
                }
            });

            if (!completed.await(2, TimeUnit.SECONDS)) {
                Log.w(TAG, "Timed out closing offline SQLite connection before activity pause");
                return;
            }
            if (failure.get() != null) {
                throw new Exception(failure.get());
            }
            Log.d(TAG, "Rolled back and closed offline SQLite connection before activity pause");
        } catch (NoSuchFieldException | NoSuchMethodException ignored) {
            Log.w(TAG, "SQLite lifecycle close API is unavailable; JavaScript recovery remains enabled");
        } catch (Exception error) {
            Log.w(TAG, "Could not close offline SQLite connection before activity pause", error);
        }
    }
}
