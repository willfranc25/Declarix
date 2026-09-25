import { describe, expect, it, vi } from "vitest";
import { findLegacyImagePath } from "./legacyImagePath";

function storageWithFiles(filesByPath: Record<string, { name: string }[]>) {
  return {
    from: vi.fn(() => ({
      list: vi.fn(async (path) => ({ data: filesByPath[path] || [], error: null })),
    })),
  };
}

describe("findLegacyImagePath", () => {
  it("finds images in the owner folder", async () => {
    const storage = storageWithFiles({
      owner: [{ name: "invoice.jpeg" }],
    });
    await expect(findLegacyImagePath(storage, "owner", "invoice")).resolves.toBe(
      "owner/invoice.jpeg",
    );
  });

  it("falls back to pre-RLS root images", async () => {
    const storage = storageWithFiles({
      "": [{ name: "invoice.jpeg" }],
    });
    await expect(findLegacyImagePath(storage, "owner", "invoice")).resolves.toBe(
      "invoice.jpeg",
    );
  });

  it("does not match a similarly prefixed invoice ID", async () => {
    const storage = storageWithFiles({
      owner: [{ name: "invoice-other.jpeg" }],
      "": [{ name: "invoice-other.jpeg" }],
    });
    await expect(findLegacyImagePath(storage, "owner", "invoice")).resolves.toBe(
      null,
    );
  });
});
