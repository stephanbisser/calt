import { describe, it, expect } from "vitest";
import {
  isValidUrl,
  isSharePointUrl,
  isOneDriveUrl,
  getPathSegmentCount,
  hasQueryParameters,
  isAbsoluteUrl,
} from "../../src/utils/url-validator.js";

describe("URL Validator", () => {
  describe("isValidUrl", () => {
    it("should accept valid URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://docs.microsoft.com/en-us")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("isSharePointUrl", () => {
    it("should detect SharePoint URLs", () => {
      expect(isSharePointUrl("https://contoso.sharepoint.com/sites/Docs")).toBe(true);
      expect(isSharePointUrl("https://fabrikam.sharepoint.com/sites/OnboardingDE")).toBe(true);
    });

    it("should reject non-SharePoint URLs", () => {
      expect(isSharePointUrl("https://example.com")).toBe(false);
    });
  });

  describe("getPathSegmentCount", () => {
    it("should count path segments", () => {
      expect(getPathSegmentCount("https://example.com")).toBe(0);
      expect(getPathSegmentCount("https://example.com/a")).toBe(1);
      expect(getPathSegmentCount("https://example.com/a/b")).toBe(2);
      expect(getPathSegmentCount("https://example.com/a/b/c")).toBe(3);
    });
  });

  describe("hasQueryParameters", () => {
    it("should detect query parameters", () => {
      expect(hasQueryParameters("https://example.com?q=test")).toBe(true);
      expect(hasQueryParameters("https://example.com")).toBe(false);
    });
  });

  describe("isAbsoluteUrl", () => {
    it("should detect absolute URLs", () => {
      expect(isAbsoluteUrl("https://example.com")).toBe(true);
      expect(isAbsoluteUrl("http://example.com")).toBe(true);
    });

    it("should reject relative URLs", () => {
      expect(isAbsoluteUrl("/path/to/file")).toBe(false);
    });
  });
});
