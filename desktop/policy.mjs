export function appOrigin(testUrl, packaged) {
  if (!testUrl || packaged) return 'https://alveo.chat';
  const url = new URL(testUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Desktop test origin must be an HTTP loopback origin');
  }
  return url.origin;
}

export function sameOrigin(url, origin) {
  try {
    const value = new URL(url);
    return value.origin === origin && !value.username && !value.password;
  } catch { return false; }
}

export function trustedFrame(frame, contents, origin) {
  return Boolean(frame && contents && !contents.isDestroyed() && frame === contents.mainFrame && sameOrigin(frame.url, origin));
}

export function captureAllowed(request, contents, origin) {
  return request.userGesture === true && request.videoRequested === true &&
    sameOrigin(request.securityOrigin, origin) && trustedFrame(request.frame, contents, origin);
}

export const capabilities = Object.freeze({
  version: 1, sourceSelection: 'explicit-picker', video: true,
  applicationAudio: false, independentAudio: false, systemAudio: false,
});
