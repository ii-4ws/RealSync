/**
 * Supabase Persistence Layer.
 *
 * Provides read/write access to the Supabase Postgres database for
 * sessions, transcripts, alerts, suggestions, metrics snapshots, and
 * session reports.
 *
 * When Supabase is not configured (env vars missing), all write
 * operations silently succeed and reads return empty results. This
 * allows the rest of the pipeline to function during local development.
 */

let supabase = null;

function getClient() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.warn(
      "[persistence] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — persistence disabled."
    );
    return null;
  }

  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(url, key);
    console.log("[persistence] Supabase client initialized.");
    return supabase;
  } catch (err) {
    console.warn(
      `[persistence] Failed to init Supabase client: ${err?.message ?? err}`
    );
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Sessions                                                           */
/* ------------------------------------------------------------------ */

async function createSession({
  id,
  title,
  meetingType,
  userId = null,
  meetingUrl = null,
}) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db.from("sessions").insert({
    id,
    title,
    meeting_type: meetingType,
    user_id: userId,
    meeting_url: meetingUrl,
  });

  if (error) {
    console.warn(`[persistence] createSession error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function endSession(sessionId) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) {
    console.warn(`[persistence] endSession error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function updateBotStatus(sessionId, botStatus) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db
    .from("sessions")
    .update({ bot_status: botStatus })
    .eq("id", sessionId);

  if (error) {
    console.warn(`[persistence] updateBotStatus error: ${error.message}`);
  }
  return { ok: !error };
}

/* ------------------------------------------------------------------ */
/*  Transcript lines                                                   */
/* ------------------------------------------------------------------ */

async function insertTranscriptLine(sessionId, line) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db.from("transcript_lines").insert({
    session_id: sessionId,
    text: line.text,
    speaker: line.speaker || null,
    is_final: line.isFinal !== false,
    confidence: line.confidence ?? null,
    ts: line.ts || new Date().toISOString(),
  });

  if (error) {
    console.warn(`[persistence] insertTranscriptLine error: ${error.message}`);
  }
  return { ok: !error };
}

async function getSessionTranscript(sessionId) {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from("transcript_lines")
    .select("*")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true });

  if (error) {
    console.warn(
      `[persistence] getSessionTranscript error: ${error.message}`
    );
    return [];
  }
  return data || [];
}

/* ------------------------------------------------------------------ */
/*  Alerts                                                             */
/* ------------------------------------------------------------------ */

async function insertAlert(sessionId, alert) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db.from("alerts").insert({
    id: alert.alertId,
    session_id: sessionId,
    severity: alert.severity,
    category: alert.category,
    title: alert.title,
    message: alert.message,
    confidence: alert.source?.confidence ?? null,
    source_model: alert.source?.model ?? null,
    ts: alert.ts || new Date().toISOString(),
  });

  if (error) {
    console.warn(`[persistence] insertAlert error: ${error.message}`);
  }
  return { ok: !error };
}

async function getSessionAlerts(sessionId) {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from("alerts")
    .select("*")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true });

  if (error) {
    console.warn(`[persistence] getSessionAlerts error: ${error.message}`);
    return [];
  }
  return data || [];
}

/* ------------------------------------------------------------------ */
/*  Suggestions                                                        */
/* ------------------------------------------------------------------ */

async function insertSuggestion(sessionId, suggestion) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db.from("suggestions").insert({
    session_id: sessionId,
    severity: suggestion.severity,
    title: suggestion.title,
    message: suggestion.message,
    ts: suggestion.ts || new Date().toISOString(),
  });

  if (error) {
    console.warn(`[persistence] insertSuggestion error: ${error.message}`);
  }
  return { ok: !error };
}

/* ------------------------------------------------------------------ */
/*  Metrics snapshots                                                  */
/* ------------------------------------------------------------------ */

async function insertMetricsSnapshot(sessionId, metrics) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db.from("metrics_snapshots").insert({
    session_id: sessionId,
    data: metrics,
    ts: metrics.timestamp || new Date().toISOString(),
  });

  if (error) {
    console.warn(
      `[persistence] insertMetricsSnapshot error: ${error.message}`
    );
  }
  return { ok: !error };
}

/* ------------------------------------------------------------------ */
/*  Session reports                                                    */
/* ------------------------------------------------------------------ */

async function generateReport(sessionId) {
  const db = getClient();
  if (!db) {
    return {
      ok: true,
      stub: true,
      report: {
        sessionId,
        totalAlerts: 0,
        totalTranscriptLines: 0,
        summary: "Persistence disabled — no report data.",
      },
    };
  }

  // Gather counts
  const [alertsRes, transcriptRes] = await Promise.all([
    db
      .from("alerts")
      .select("severity", { count: "exact" })
      .eq("session_id", sessionId),
    db
      .from("transcript_lines")
      .select("id", { count: "exact" })
      .eq("session_id", sessionId),
  ]);

  const alertCount = alertsRes.count || 0;
  const transcriptCount = transcriptRes.count || 0;

  // Severity breakdown
  const { data: severityCounts } = await db
    .from("alerts")
    .select("severity")
    .eq("session_id", sessionId);

  const severityBreakdown = { low: 0, medium: 0, high: 0, critical: 0 };
  (severityCounts || []).forEach((a) => {
    if (severityBreakdown[a.severity] !== undefined) {
      severityBreakdown[a.severity]++;
    }
  });

  const summary = {
    sessionId,
    totalAlerts: alertCount,
    totalTranscriptLines: transcriptCount,
    severityBreakdown,
    generatedAt: new Date().toISOString(),
  };

  const { error } = await db.from("session_reports").insert({
    session_id: sessionId,
    summary,
  });

  if (error) {
    console.warn(`[persistence] generateReport error: ${error.message}`);
  }

  return { ok: !error, report: summary };
}

async function getSessionReport(sessionId) {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from("session_reports")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

module.exports = {
  createSession,
  endSession,
  updateBotStatus,
  insertTranscriptLine,
  getSessionTranscript,
  insertAlert,
  getSessionAlerts,
  insertSuggestion,
  insertMetricsSnapshot,
  generateReport,
  getSessionReport,
};
