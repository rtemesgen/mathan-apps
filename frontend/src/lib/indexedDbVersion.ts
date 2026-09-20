export function safeIndexedDbVersion(existingVersion: number, minimumVersion: number, needsStoreUpgrade: boolean): number {
  return needsStoreUpgrade
    ? Math.max(existingVersion + 1, minimumVersion)
    : Math.max(existingVersion, minimumVersion);
}
