# Installing Mathan ERP from GitHub

GitHub APKs are installed outside Google Play, so Android may show **App scan recommended**. This is a normal Play Protect check for an app Android has not seen before.

1. Open the repository's **Releases** page and download the `.apk` asset from the latest release.
2. Open the downloaded APK and choose **Scan app**. This is the safest option. Wait for the scan to finish and continue if Android reports no problem.
3. If Android asks for permission to install from this source, allow it for the browser or file manager you used, then return to the installer.
4. After installation, turn that source permission off again if you do not plan to install more APKs from it.

Each release also includes:

- `app-release.apk.sha256`: checksum for detecting an incomplete or modified download.
- `signing-certificate.txt`: certificate details showing which release key signed the APK.

On Linux, verify the checksum from the folder containing both files:

```bash
sha256sum -c app-release.apk.sha256
```

The same release signing key is kept for future versions so Android can update the installed app instead of treating every release as a different application.
