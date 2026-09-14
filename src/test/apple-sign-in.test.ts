import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateRawNonce,
  sha256Hex,
  isNativeAppleSignInAvailable,
} from "@/lib/native/apple-sign-in";

describe("apple-sign-in helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generateRawNonce returns the requested length from the charset", () => {
    const nonce = generateRawNonce(32);
    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("generateRawNonce produces different values", () => {
    const a = generateRawNonce(24);
    const b = generateRawNonce(24);
    expect(a).not.toEqual(b);
  });

  it("sha256Hex returns a 64-char lowercase hex digest", async () => {
    // echo -n "test" | shasum -a 256
    const hex = await sha256Hex("test");
    expect(hex).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("isNativeAppleSignInAvailable is false on web (jsdom)", () => {
    expect(isNativeAppleSignInAvailable()).toBe(false);
  });
});
