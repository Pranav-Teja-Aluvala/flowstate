export function authReturnPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000 || /[\\\x00-\x20]/.test(value))
    return '/app';
  try {
    const url = new URL(value, 'https://flowstate.local');
    if (
      !value.startsWith('/') ||
      url.origin !== 'https://flowstate.local' ||
      !/^\/(?:app(?:\/|$)|w\/|join\/)/.test(url.pathname)
    )
      return '/app';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/app';
  }
}
