export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

export function isSharePointUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      url.hostname.endsWith(".sharepoint.com") ||
      url.hostname.endsWith(".sharepoint-df.com")
    );
  } catch {
    return false;
  }
}

export function isOneDriveUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return (
      url.hostname.includes("onedrive") ||
      url.hostname.includes("my.sharepoint.com") ||
      url.hostname.endsWith("-my.sharepoint.com")
    );
  } catch {
    return false;
  }
}

export function getPathSegmentCount(urlString: string): number {
  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter((s) => s.length > 0);
    return segments.length;
  } catch {
    return 0;
  }
}

export function hasQueryParameters(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.search.length > 0;
  } catch {
    return false;
  }
}

export function isAbsoluteUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
