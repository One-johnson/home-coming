import { expect, test } from "vitest";
import { createTestConvex } from "./testUtils";

/**
 * Documents the storage behaviour the tour-image fix relies on: a dangling
 * storage id (file already deleted) makes `storage.delete` throw, while
 * `storage.getUrl` safely returns null — so deletes are gated on getUrl.
 */
test("storage.delete throws for a missing file while getUrl returns null", async () => {
  const t = createTestConvex();
  const result = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob([new Uint8Array([137, 80, 78, 71])]),
    );
    await ctx.storage.delete(storageId);
    const urlAfterDelete = await ctx.storage.getUrl(storageId);
    let deleteErr = "no error";
    try {
      await ctx.storage.delete(storageId);
    } catch (err) {
      deleteErr = String(err);
    }
    return { urlAfterDelete, deleteErr };
  });
  expect(result).toEqual({
    urlAfterDelete: null,
    deleteErr: expect.stringContaining("non-existent"),
  });
});
