/**
 * Shared Supabase client singleton.
 * Used by auth.js and persistence.js to avoid duplicate client instances.
 */
const { createClient } = require("@supabase/supabase-js");

let supabase = null;

function getClient() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;

  try {
    supabase = createClient(url, key);
    return supabase;
  } catch {
    return null;
  }
}

module.exports = { getClient };
