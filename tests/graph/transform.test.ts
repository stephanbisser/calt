import { describe, it, expect } from "vitest";
import { extractManifestFromPackage, extractMetadata, slugify } from "../../src/graph/transform.js";
import graphResponse from "../fixtures/graph-api-response.json";
import type { CopilotPackageDetail } from "../../src/core/types.js";

describe("Graph API Transform", () => {
  const packageDetail = graphResponse as unknown as CopilotPackageDetail;

  describe("extractManifestFromPackage", () => {
    it("should parse the escaped JSON definition correctly", () => {
      const manifest = extractManifestFromPackage(packageDetail);
      expect(manifest).not.toBeNull();
      expect(manifest!.name).toBe("Onboarding Coach");
      expect(manifest!.version).toBe("v1.3");
    });

    it("should extract instructions from parsed definition", () => {
      const manifest = extractManifestFromPackage(packageDetail);
      expect(manifest!.instructions).toContain("Onboarding-Prozess");
      expect(manifest!.instructions).toContain("business casual");
    });

    it("should extract capabilities", () => {
      const manifest = extractManifestFromPackage(packageDetail);
      expect(manifest!.capabilities).toHaveLength(2);
      expect(manifest!.capabilities![0].name).toBe("OneDriveAndSharePoint");
      expect(manifest!.capabilities![1].name).toBe("GraphicArt");
    });

    it("should extract conversation starters", () => {
      const manifest = extractManifestFromPackage(packageDetail);
      expect(manifest!.conversation_starters).toHaveLength(3);
      expect(manifest!.conversation_starters![0].title).toBe("Urlaub");
    });

    it("should return null for package without DeclarativeCopilots", () => {
      const emptyPackage: CopilotPackageDetail = {
        ...packageDetail,
        elementDetails: [],
      };
      expect(extractManifestFromPackage(emptyPackage)).toBeNull();
    });

    it("should throw on invalid JSON in definition", () => {
      const badPackage: CopilotPackageDetail = {
        ...packageDetail,
        elementDetails: [
          {
            elementType: "DeclarativeCopilots",
            elements: [{ id: "", definition: "{invalid json" }],
          },
        ],
      };
      expect(() => extractManifestFromPackage(badPackage)).toThrow();
    });
  });

  describe("extractMetadata", () => {
    it("should extract package metadata", () => {
      const meta = extractMetadata(packageDetail);
      expect(meta.packageId).toBe("T_cebfd158-7116-1e34-27f5-0efca5f046f0");
      expect(meta.publisher).toBe("Test Publisher");
      expect(meta.version).toBe("1.0.6");
      expect(meta.displayName).toBe("Onboarding Coach");
    });
  });

  describe("slugify", () => {
    it("should create URL-safe slugs", () => {
      expect(slugify("Onboarding Coach")).toBe("onboarding-coach");
      expect(slugify("IT Help Desk")).toBe("it-help-desk");
    });

    it("should handle German umlauts", () => {
      expect(slugify("Büro Assistent")).toBe("buero-assistent");
      expect(slugify("Straße")).toBe("strasse");
    });

    it("should handle special characters", () => {
      expect(slugify("Agent (v2.0)")).toBe("agent-v2-0");
      expect(slugify("  Extra   Spaces  ")).toBe("extra-spaces");
    });
  });
});
