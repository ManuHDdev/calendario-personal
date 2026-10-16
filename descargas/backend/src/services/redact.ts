/** Masks the value of any `token` query parameter so JWTs never reach the logs. */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&]token=)[^&#]*/gi, '$1[redacted]');
}
