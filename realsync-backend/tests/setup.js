/**
 * Jest global setup.
 *
 * Ensures tests run WITHOUT Supabase and WITHOUT the AI service.
 * Sets NODE_ENV=test and points AI_SERVICE_URL at an unreachable host
 * so any accidental live call fails fast instead of hanging.
 */

// Disable Supabase by clearing its env vars before any module loads
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_KEY;

// Point AI service at an unreachable address (RFC 5737 TEST-NET)
process.env.AI_SERVICE_URL = "http://192.0.2.1:1";

// Mark environment as test
process.env.NODE_ENV = "test";

// Suppress structured log output during tests
process.env.LOG_LEVEL = "error";
