/**
 * What goes into the request log for a URL: no query string (media URLs may carry ?token=<jwt>) and the
 * guest-link secret replaced, because for guests the token is part of the path.
 */
export function redactUrl(url: string): string {
  return url.split('?')[0].replace(/(\/guest\/)[^/]+/, '$1[redacted]');
}
