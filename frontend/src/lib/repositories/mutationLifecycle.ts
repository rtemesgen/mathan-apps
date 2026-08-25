/**
 * The queue must never become the source of truth for a write that was not
 * durably stored locally first. Keeping this ordering in one primitive makes
 * it apply equally to snapshot and relational repositories.
 */
export async function persistBeforeQueue<T>(persist: () => Promise<T>, queue: () => Promise<void>): Promise<T> {
  const result = await persist();
  await queue();
  return result;
}
