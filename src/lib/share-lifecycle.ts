/** Owns capture and publication cleanup, including publications resolved after close. */
export function createShareLifecycle<T>(
  stream: Pick<MediaStream, "getTracks">,
  unpublish: (publication: T) => Promise<unknown>,
) {
  let closed = false;
  let closing: Promise<PromiseSettledResult<unknown>[]> | undefined;
  const publications: T[] = [];
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
      stream.getTracks().forEach((track) => track.stop());
      closing = Promise.allSettled(publications.map((publication) =>
        Promise.resolve().then(() => unpublish(publication)),
      ));
      return closing;
    },
  };
}
