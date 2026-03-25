import type { CopilotPackage, CopilotPackageDetail } from "../core/types.js";

// Graph API Beta endpoints – centralized for easy updates when API changes
const GRAPH_BASE = "https://graph.microsoft.com/beta";
const PACKAGES_ENDPOINT = `${GRAPH_BASE}/copilot/admin/catalog/packages`;

export class GraphClient {
  constructor(private accessToken: string) {}

  private async graphFetch<T>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401) {
        throw new GraphApiError(
          "Unauthorized. Your token may have expired. Run 'calt login' again.",
          response.status,
        );
      }
      if (response.status === 403) {
        throw new GraphApiError(
          "Forbidden. The /copilot/admin/catalog/packages endpoint requires an Entra admin role.\n" +
          "Assign one of these roles to your account in the Azure Portal → Entra ID → Roles:\n" +
          "  • AI Administrator (least-privilege, recommended)\n" +
          "  • Global Administrator\n" +
          "Also ensure CopilotPackages.Read.All has admin consent on your app registration.",
          response.status,
        );
      }
      if (response.status === 424) {
        throw new GraphApiError(
          "The Copilot catalog API returned a dependency failure (424).\n" +
          "This can be caused by rate limiting or a backend dependency issue.\n" +
          "If the error mentions 'Too Many Requests', please wait a moment and retry.\n" +
          "Otherwise, ensure your account has the 'AI Administrator' or 'Global Administrator'\n" +
          "Entra role — the CopilotPackages.Read.All scope alone is not sufficient.\n" +
          `Details: ${body}`,
          response.status,
        );
      }
      throw new GraphApiError(
        `Graph API error ${response.status}: ${response.statusText}. ${body}`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  async listCopilotAgents(): Promise<CopilotPackage[]> {
    interface PageResponse {
      value: CopilotPackage[];
      "@odata.nextLink"?: string;
    }

    const allPackages: CopilotPackage[] = [];
    // Server-side filter: only packages that support Copilot host
    const filterParam = encodeURIComponent("supportedHosts/any(h:h eq 'Copilot')");
    let url: string | null = `${PACKAGES_ENDPOINT}?$filter=${filterParam}`;

    while (url) {
      const data: PageResponse = await this.graphFetch<PageResponse>(url);
      allPackages.push(...data.value);
      url = data["@odata.nextLink"] ?? null;
    }

    return allPackages;
  }

  async getAgentDetails(packageId: string): Promise<CopilotPackageDetail> {
    return this.graphFetch<CopilotPackageDetail>(
      `${PACKAGES_ENDPOINT}/${encodeURIComponent(packageId)}`,
    );
  }
}

export class GraphApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}
