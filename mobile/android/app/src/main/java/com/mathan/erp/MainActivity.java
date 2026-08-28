package com.mathan.erp;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
