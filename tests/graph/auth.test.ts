import { describe, it, expect } from "vitest";
import { decodeJwtPayload, decodeTokenPayload } from "../../src/graph/auth.js";

// Helper: create a fake JWT with the given payload object
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("decodeJwtPayload", () => {
  it("should decode a well-formed 3-part JWT", () => {
    const token = fakeJwt({ sub: "user1", scp: "read write" });
    const result = decodeJwtPayload(token);
    expect(result).toEqual({ sub: "user1", scp: "read write" });
  });

  it("should return null for a token with fewer than 3 parts", () => {
    expect(decodeJwtPayload("only.two")).toBeNull();
  });

  it("should return null for a token with more than 3 parts", () => {
    expect(decodeJwtPayload("a.b.c.d")).toBeNull();
  });

  it("should return null for an empty string", () => {
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("should return null when the payload is not valid JSON", () => {
    const bad = `header.${Buffer.from("not-json").toString("base64url")}.sig`;
    expect(decodeJwtPayload(bad)).toBeNull();
  });

  it("should return null when the payload is not valid base64url", () => {
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
  });
});

describe("decodeTokenPayload (deprecated compat)", () => {
  it("should return an empty object instead of null for invalid tokens", () => {
    expect(decodeTokenPayload("bad")).toEqual({});
  });

  it("should still decode valid tokens", () => {
    const token = fakeJwt({ aud: "api" });
    expect(decodeTokenPayload(token)).toEqual({ aud: "api" });
  });
});
