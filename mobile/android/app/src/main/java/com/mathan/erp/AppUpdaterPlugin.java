package com.mathan.erp;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
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
            boolean successful = status == DownloadManager.STATUS_SUCCESSFUL;
            Uri completedUri = successful ? manager.getUriForDownloadedFile(downloadId) : null;
            if (successful && completedUri != null) {
                getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).edit().putString("downloaded-apk-uri", completedUri.toString()).apply();
            }
            int progress = successful ? 100 : total > 0 ? Math.min(99, (int) Math.floor(downloaded * 100.0 / total)) : 0;
            String state = successful && completedUri != null ? "successful" : status == DownloadManager.STATUS_FAILED ? "failed" : successful ? "finalizing" : status == DownloadManager.STATUS_PAUSED ? "paused" : status == DownloadManager.STATUS_RUNNING ? "running" : status == DownloadManager.STATUS_PENDING ? "pending" : String.valueOf(status);
            call.resolve(new JSObject().put("progress", progress).put("downloaded", downloaded).put("total", total).put("status", state));
        } catch (Exception error) {
            call.reject("Could not read download progress", error);
        }
    }

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        long downloadId = getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).getLong("download-id", -1);
        if (downloadId < 0) {
            call.reject("No downloaded update is available yet");
            return;
        }
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        Uri apkUri = null;
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (cursor != null && cursor.moveToFirst()) {
                int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_PENDING;
                if (status == DownloadManager.STATUS_SUCCESSFUL) apkUri = manager.getUriForDownloadedFile(downloadId);
            }
        } catch (Exception error) {
            call.reject("Could not verify the downloaded update", error);
            return;
        }
        if (apkUri == null) {
            call.reject("The downloaded update is no longer available. Please download it again.");
            return;
        }
        getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).edit().putString("downloaded-apk-uri", apkUri.toString()).apply();
        installApk(apkUri);
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
        getContext().getSharedPreferences("mathan-updater", Context.MODE_PRIVATE).edit().putLong("download-id", downloadId).remove("downloaded-apk-uri").apply();

        // DownloadManager owns the transfer and persists it across activity
        // pauses/recreation. The frontend polls its state, so no in-memory
        // broadcast receiver can leave a JavaScript promise stalled.
        call.resolve(new JSObject().put("downloadId", downloadId));
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
