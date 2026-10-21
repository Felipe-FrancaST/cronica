/** Optional UI choices must not prevent login when the browser blocks storage. */
export function readBrowserValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeBrowserValue(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function removeBrowserValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Optional device preference. */
  }
}
