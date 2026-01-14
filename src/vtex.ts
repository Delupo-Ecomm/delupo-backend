import { config } from "./config.js";

type RequestOptions = {
  path: string;
  query?: Record<string, string | number | undefined>;
};

export function vtexUrl({ path, query }: RequestOptions): string {
  const base = `https://${config.vtexAccount}.${config.vtexBaseDomain}`;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function vtexFetch<T>(options: RequestOptions): Promise<T> {
  const url = vtexUrl(options);
  const res = await fetch(url, {
    headers: {
      "X-VTEX-API-AppKey": config.vtexAppKey,
      "X-VTEX-API-AppToken": config.vtexToken,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VTEX ${res.status} ${res.statusText} - ${body}`);
  }

  return res.json() as Promise<T>;
}
