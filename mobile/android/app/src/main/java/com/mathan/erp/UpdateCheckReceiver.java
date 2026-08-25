package com.mathan.erp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateCheckReceiver extends BroadcastReceiver {
    private static final String RELEASES_URL = "https://api.github.com/repos/rtemesgen/mathan-apps/releases/latest";
    private static final String CHANNEL_ID = "mathan-updates";

    @Override
    public void onReceive(Context context, Intent ignored) {
        new Thread(() -> check(context.getApplicationContext())).start();
    }

    private void check(Context context) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(RELEASES_URL).openConnection();
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            JSONObject release = new JSONObject(body.toString());
            String tag = release.optString("tag_name", "");
            if (release.optBoolean("draft") || release.optBoolean("prerelease") || !hasApk(release.optJSONArray("assets"))) return;
            String current = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            if (!isNewer(tag, current)) return;
            notifyUpdate(context, tag.replaceFirst("^v", ""));
        } catch (Exception ignoredError) {
            // Background update checks are best-effort and must never affect app startup.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean hasApk(JSONArray assets) {
        if (assets == null) return false;
        for (int i = 0; i < assets.length(); i++) if (assets.optJSONObject(i).optString("name").toLowerCase().endsWith(".apk")) return true;
        return false;
    }

    private boolean isNewer(String latest, String current) {
        String[] next = latest.replaceFirst("^v", "").split("\\.");
        String[] installed = (current == null ? "0.0.0" : current.replaceFirst("^v", "")).split("\\.");
        for (int i = 0; i < Math.max(next.length, installed.length); i++) {
            int a = i < next.length ? number(next[i]) : 0;
            int b = i < installed.length ? number(installed[i]) : 0;
            if (a != b) return a > b;
        }
        return false;
    }

    private int number(String value) {
        try { return Integer.parseInt(value.replaceAll("[^0-9].*", "")); } catch (Exception ignored) { return 0; }
    }

    private void notifyUpdate(Context context, String version) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Mathan ERP updates", NotificationManager.IMPORTANCE_DEFAULT));
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 9402, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.mathan.erp.R.drawable.ic_stat_mathan)
            .setContentTitle("Mathan ERP update available")
            .setContentText("Version " + version + " is ready. Tap to open Mathan ERP.")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) manager.notify(9403, builder.build());
    }
}
