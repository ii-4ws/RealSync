export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "https://real-sync.app").split(",").map(s => s.trim()),
};

/** Call at server startup to fail fast on missing critical env vars. */
export function validateEnv() {
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
    throw new Error(
      "FATAL: JWT_SECRET must be set and at least 32 characters. Server cannot start without a secure signing key."
    );
  }
}
