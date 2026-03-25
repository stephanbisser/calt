import type {
  DataverseBot,
  DataverseBotComponent,
  DataverseListResponse,
} from "../core/types.js";

const API_PATH = "/api/data/v9.2";

export class DataverseClient {
  private baseUrl: string;

  constructor(
    private accessToken: string,
    orgUrl: string,
  ) {
    // Ensure no trailing slash
    this.baseUrl = orgUrl.replace(/\/+$/, "") + API_PATH;
  }

  private async dvFetch<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401) {
        throw new DataverseApiError(
          "Unauthorized. Your Dataverse token may have expired. Run 'calt login --dataverse' again.",
          response.status,
        );
      }
      if (response.status === 403) {
        throw new DataverseApiError(
          "Forbidden. Ensure your account has access to this Dataverse environment.",
          response.status,
        );
      }
      throw new DataverseApiError(
        `Dataverse API error ${response.status}: ${response.statusText}. ${body}`,
        response.status,
      );
    }

    return response.json() as Promise<T>;
  }

  async listBots(): Promise<DataverseBot[]> {
    const allBots: DataverseBot[] = [];
    let url: string | null =
      `${this.baseUrl}/bots?$select=botid,name,createdon,modifiedon,schemaname,statecode`;

    while (url) {
      const data: DataverseListResponse<DataverseBot> = await this.dvFetch<DataverseListResponse<DataverseBot>>(url);
      allBots.push(...data.value);
      url = data["@odata.nextLink"] ?? null;
    }

    return allBots;
  }

  async getBot(botId: string): Promise<DataverseBot> {
    return this.dvFetch<DataverseBot>(
      `${this.baseUrl}/bots(${encodeURIComponent(botId)})`,
    );
  }

  async getBotComponents(
    botId: string,
    componentType?: number,
  ): Promise<DataverseBotComponent[]> {
    let filter = `_parentbotid_value eq ${botId}`;
    if (componentType !== undefined) {
      filter += ` and componenttype eq ${componentType}`;
    }

    const allComponents: DataverseBotComponent[] = [];
    let url: string | null =
      `${this.baseUrl}/botcomponents?$filter=${encodeURIComponent(filter)}`;

    while (url) {
      const data: DataverseListResponse<DataverseBotComponent> = await this.dvFetch<DataverseListResponse<DataverseBotComponent>>(url);
      allComponents.push(...data.value);
      url = data["@odata.nextLink"] ?? null;
    }

    return allComponents;
  }
}

export class DataverseApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "DataverseApiError";
  }
}
