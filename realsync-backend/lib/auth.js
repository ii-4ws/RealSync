/**
 * Authentication middleware for the RealSync backend.
 *
 * Verifies Supabase JWTs from the Authorization header and attaches
 * `req.userId` to authenticated requests.
 *
 * When Supabase is not configured (prototype / local dev), all requests
 * are allowed through with `req.userId = null` so the app keeps working.
 */

const { getClient } = require("./supabaseClient");

/**
 * Express middleware: extracts Bearer token, verifies with Supabase,
 * and sets `req.userId`. Passes through unauthenticated requests when
 * Supabase is not configured (prototype mode).
 */
async function authenticate(req, res, next) {
  const client = getClient();

  // Prototype mode — no Supabase configured, allow all
  if (!client) {
    req.userId = null;
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    req.userId = null;
    return next();
  }

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.userId = data.user.id;
  } catch {
    return res.status(401).json({ error: "Authentication failed" });
  }

  return next();
}

/**
 * Verify the user from a WebSocket query-string token.
 * Returns the userId or null (for prototype mode / missing config).
 */
async function authenticateWsToken(token) {
  const client = getClient();
  if (!client || !token) return null;

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Middleware factory: ensures the authenticated user owns the session
 * identified by `req.params.id`. Must run after `authenticate`.
 *
 * In prototype mode (req.userId === null) ownership checks are skipped.
 */
function requireSessionOwner(getSessionFn) {
  return (req, res, next) => {
    // Prototype mode — skip ownership check
    if (req.userId === null) return next();

    const session = getSessionFn(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.userId !== null && session.userId !== req.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return next();
  };
}

module.exports = { authenticate, authenticateWsToken, requireSessionOwner };
