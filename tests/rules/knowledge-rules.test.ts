import { describe, it, expect } from "vitest";
import { sharepointUrlValid, sharepointIdsPresent } from "../../src/rules/knowledge/sharepoint-rules.js";
import { websearchSiteLimit, websearchUrlValid } from "../../src/rules/knowledge/websearch-rules.js";
import { connectorIdPresent } from "../../src/rules/knowledge/connector-rules.js";
import { makeContext } from "../helpers/make-context.js";

describe("SharePoint Rules", () => {
  describe("KNOW-001: sharepoint-url-valid", () => {
    it("should pass for valid SharePoint URL", () => {
      const results = sharepointUrlValid.check(makeContext({
        capabilities: [{
          name: "OneDriveAndSharePoint",
          items_by_url: [{ url: "https://contoso.sharepoint.com/sites/Docs" }],
        }],
      }));
      expect(Array.isArray(results) ? results : [results]).toEqual(
        expect.arrayContaining([expect.objectContaining({ passed: true })]),
      );
    });

    it("should fail for non-SharePoint URL", () => {
      const results = sharepointUrlValid.check(makeContext({
        capabilities: [{
          name: "OneDriveAndSharePoint",
          items_by_url: [{ url: "https://example.com/docs" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });

    it("should fail for invalid URL", () => {
      const results = sharepointUrlValid.check(makeContext({
        capabilities: [{
          name: "OneDriveAndSharePoint",
          items_by_url: [{ url: "not-a-url" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });
  });

  describe("KNOW-002: sharepoint-ids-present", () => {
    it("should pass with valid SharePoint IDs", () => {
      const results = sharepointIdsPresent.check(makeContext({
        capabilities: [{
          name: "OneDriveAndSharePoint",
          items_by_sharepoint_ids: [{
            site_id: "caa7291e-f583-447e-ac16-6668dd6576c7",
            web_id: "1ce5dc14-5895-4d14-8c25-8606a5ea1a83",
          }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.every((r) => r.passed)).toBe(true);
    });

    it("should warn when no items configured", () => {
      const results = sharepointIdsPresent.check(makeContext({
        capabilities: [{
          name: "OneDriveAndSharePoint",
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });
  });
});

describe("WebSearch Rules", () => {
  describe("KNOW-003: websearch-site-limit", () => {
    it("should pass for <=4 sites", () => {
      const results = websearchSiteLimit.check(makeContext({
        capabilities: [{
          name: "WebSearch",
          sites: [
            { url: "https://docs.microsoft.com" },
            { url: "https://learn.microsoft.com" },
          ],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.every((r) => r.passed)).toBe(true);
    });

    it("should fail for >4 sites", () => {
      const results = websearchSiteLimit.check(makeContext({
        capabilities: [{
          name: "WebSearch",
          sites: [
            { url: "https://a.com" },
            { url: "https://b.com" },
            { url: "https://c.com" },
            { url: "https://d.com" },
            { url: "https://e.com" },
          ],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });
  });

  describe("KNOW-004: websearch-url-valid", () => {
    it("should pass for valid URLs with <=2 path segments", () => {
      const results = websearchUrlValid.check(makeContext({
        capabilities: [{
          name: "WebSearch",
          sites: [{ url: "https://docs.microsoft.com/en-us" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.every((r) => r.passed)).toBe(true);
    });

    it("should fail for URLs with >2 path segments", () => {
      const results = websearchUrlValid.check(makeContext({
        capabilities: [{
          name: "WebSearch",
          sites: [{ url: "https://example.com/a/b/c" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });

    it("should fail for URLs with query parameters", () => {
      const results = websearchUrlValid.check(makeContext({
        capabilities: [{
          name: "WebSearch",
          sites: [{ url: "https://example.com?q=search" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });
  });
});

describe("Connector Rules", () => {
  describe("KNOW-005: connector-id-present", () => {
    it("should pass with valid connection ID", () => {
      const results = connectorIdPresent.check(makeContext({
        capabilities: [{
          name: "GraphConnectors",
          connections: [{ connection_id: "my-connector" }],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.every((r) => r.passed)).toBe(true);
    });

    it("should warn for no connections", () => {
      const results = connectorIdPresent.check(makeContext({
        capabilities: [{
          name: "GraphConnectors",
          connections: [],
        }],
      }));
      const arr = Array.isArray(results) ? results : [results];
      expect(arr.some((r) => !r.passed)).toBe(true);
    });
  });
});
