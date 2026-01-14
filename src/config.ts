import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  vtexAccount: requireEnv("VTEX_ACCOUNT"),
  vtexAppKey: requireEnv("VTEXAPPKEY"),
  vtexToken: requireEnv("VTEXTOKEN"),
  vtexBaseDomain: process.env.VTEX_BASE_DOMAIN || "vtexcommercestable.com.br",
  vtexConcurrency: Number(process.env.VTEX_CONCURRENCY || "5"),
  vtexPerPage: Number(process.env.VTEX_PER_PAGE || "50"),
  ingestDays: Number(process.env.INGEST_DAYS || "30"),
};
