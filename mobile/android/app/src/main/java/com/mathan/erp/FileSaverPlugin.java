package com.mathan.erp;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        saveFile(call, false);
    }

    @PluginMethod
    public void saveAndOpen(PluginCall call) {
        saveFile(call, true);
    }

    private void saveFile(PluginCall call, boolean shouldOpen) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64Data = call.getString("data");
        if (filename == null || base64Data == null) {
            call.reject("A filename and file data are required");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            String normalizedMimeType = mimeType.split(";", 2)[0].trim();
            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? saveToPublicDownloads(filename, normalizedMimeType, bytes)
                    : saveToAppDownloads(filename, normalizedMimeType, bytes);
            if (shouldOpen) openFile(uri, normalizedMimeType);
            else Toast.makeText(getContext(), "Backup saved in Downloads", Toast.LENGTH_SHORT).show();
            call.resolve(new JSObject().put("uri", uri.toString()));
        } catch (Exception error) {
            call.reject("Could not save file", error);
        }
    }

    private Uri saveToPublicDownloads(String filename, String mimeType, byte[] bytes) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("Android did not create a Downloads file");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("Android could not open the Downloads file");
            output.write(bytes);
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContext().getContentResolver().update(uri, values, null, null);
        return uri;
    }

    private Uri saveToAppDownloads(String filename, String mimeType, byte[] bytes) throws Exception {
        File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) throw new IllegalStateException("Android storage is unavailable");
        File file = new File(directory, filename);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    private void openFile(Uri uri, String mimeType) {
        Intent open = new Intent(Intent.ACTION_VIEW);
        open.setDataAndType(uri, mimeType);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(open);
        } catch (android.content.ActivityNotFoundException error) {
            Toast.makeText(getContext(), "File saved in Downloads. No app is installed to open it.", Toast.LENGTH_LONG).show();
        }
    }
}
