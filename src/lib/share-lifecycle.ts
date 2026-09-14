/** Owns capture and publication cleanup, including publications resolved after close. */
export function createShareLifecycle<T>(
  stream: Pick<MediaStream, "getTracks">,
  unpublish: (publication: T) => Promise<unknown>,
  onEnded?: () => void,
) {
  let closed = false;
  let closing: Promise<PromiseSettledResult<unknown>[]> | undefined;
  const publications: T[] = [];
  const tracks = stream.getTracks();
  if (onEnded) tracks.forEach((track) => track.addEventListener("ended", onEnded, { once: true }));
  return {
    get closed() { return closed; },
    async add(publication: T) {
      if (closed) {
        await unpublish(publication);
      } else {
        publications.push(publication);
      }
    },
    close() {
      if (closing) return closing;
      closed = true;
      // Release capture immediately, even if network cleanup fails or is slow.
      tracks.forEach((track) => {
        if (onEnded) track.removeEventListener("ended", onEnded);
        track.stop();
      });
      closing = Promise.allSettled(publications.map((publication) =>
        Promise.resolve().then(() => unpublish(publication)),
      ));
      return closing;
    },
  };
}
