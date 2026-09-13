import { test } from "node:test";
import assert from "node:assert/strict";
import { createShareLifecycle } from "../src/lib/share-lifecycle.ts";

test("cleanup stops all capture immediately and attempts every unpublish despite failure", async () => {
  let stopped = 0;
  const removed = [];
  const source = createShareLifecycle({ getTracks: () => [
    { stop: () => stopped++ }, { stop: () => stopped++ },
  ] }, async (publication) => {
    removed.push(publication);
    if (publication === "video") throw new Error("disconnected");
  });
  await source.add("video");
  await source.add("audio");
  const closing = source.close();
  assert.equal(stopped, 2);
  assert.equal(source.close(), closing);
  const results = await closing;
  assert.deepEqual(removed, ["video", "audio"]);
  assert.deepEqual(results.map((result) => result.status), ["rejected", "fulfilled"]);
});

test("a publication completed after leaving is immediately unpublished", async () => {
  const removed = [];
  const source = createShareLifecycle({ getTracks: () => [] }, async (pub) => removed.push(pub));
  await source.close();
  await source.add("late video");
  assert.equal(source.closed, true);
  assert.deepEqual(removed, ["late video"]);
});

test("rolling back partial publication cleans up the successful track", async () => {
  const removed = [];
  const source = createShareLifecycle({ getTracks: () => [] }, async (pub) => removed.push(pub));
  await source.add("video");
  // The audio publish fails before it can be registered.
  await source.close();
  assert.deepEqual(removed, ["video"]);
});
