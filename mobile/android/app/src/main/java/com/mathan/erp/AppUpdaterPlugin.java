package com.mathan.erp;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void getDownloadProgress(PluginCall call) {
        long downloadId = getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).getLong("download-id", -1);
        if (downloadId < 0) {
            call.resolve(new JSObject().put("progress", 0).put("downloaded", 0).put("total", 0).put("status", "none"));
            return;
        }
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.resolve(new JSObject().put("progress", 0).put("downloaded", 0).put("total", 0).put("status", "missing"));
                return;
            }
            int downloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            long downloaded = downloadedIndex >= 0 ? cursor.getLong(downloadedIndex) : 0;
            long total = totalIndex >= 0 ? cursor.getLong(totalIndex) : 0;
            int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_PENDING;
            int progress = total > 0 ? (int) Math.round((downloaded * 100.0) / total) : 0;
            call.resolve(new JSObject().put("progress", progress).put("downloaded", downloaded).put("total", total).put("status", String.valueOf(status)));
        } catch (Exception error) {
            call.reject("Could not read download progress", error);
        }
    }

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        String savedUri = getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).getString("downloaded-apk-uri", null);
        if (savedUri == null) {
            call.reject("No downloaded update is available yet");
            return;
        }
        installApk(Uri.parse(savedUri));
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "mathan-erp-update.apk");
        if (url == null || url.isBlank()) {
            call.reject("No update download URL was provided");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("Mathan ERP update");
        request.setDescription("Downloading the latest Mathan ERP version");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setMimeType("application/vnd.android.package-archive");
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, filename);
        long downloadId = manager.enqueue(request);
        getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).edit().putLong("download-id", downloadId).apply();

        registerDownloadReceiver(downloadId, call);
    }

    private void registerDownloadReceiver(long downloadId, PluginCall call) {
        if (downloadReceiver != null) return;
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != downloadId) return;
                try {
                    context.unregisterReceiver(this);
                } catch (IllegalArgumentException ignored) {
                    // Receiver was already removed during activity teardown.
                }
                downloadReceiver = null;
                DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                Uri apkUri = manager.getUriForDownloadedFile(downloadId);
                if (apkUri == null) {
                    Toast.makeText(context, "Mathan ERP update download failed", Toast.LENGTH_LONG).show();
                    return;
                }
                context.getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).edit().putString("downloaded-apk-uri", apkUri.toString()).apply();
                call.resolve();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void installApk(Uri apkUri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            Toast.makeText(getContext(), "Allow installs for Mathan ERP, then open the downloaded update notification", Toast.LENGTH_LONG).show();
            return;
        }

        Uri contentUri = apkUri;
        if ("file".equalsIgnoreCase(apkUri.getScheme())) {
            contentUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new java.io.File(apkUri.getPath()));
        }
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(contentUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(install);
    }
}
