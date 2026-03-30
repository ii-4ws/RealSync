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

const { getClient } = require("./supabaseClient");
const log = require("./logger");

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
    log.warn("persistence", `createSession error: ${error.message}`);
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
    log.warn("persistence", `endSession error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function getActiveSessions(userId) {
  const db = getClient();
  if (!db) return [];

  let query = db.from("sessions").select("*").is("ended_at", null);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    log.warn("persistence", `getActiveSessions: ${error.message}`);
    return [];
  }
  return data || [];
}

async function getUserSessions(userId, { limit = 50, offset = 0 } = {}) {
  const db = getClient();
  if (!db) return [];

  let query = db.from("sessions").select("*");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    log.warn("persistence", `getUserSessions: ${error.message}`);
    return [];
  }
  return data || [];
}

async function getSessionById(sessionId, userId = null) {
  const db = getClient();
  if (!db) return null;

  let query = db.from("sessions").select("*").eq("id", sessionId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.single();

  if (error) return null;
  return data;
}

async function updateBotStatus(sessionId, botStatus) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  const { error } = await db
    .from("sessions")
    .update({ bot_status: botStatus })
    .eq("id", sessionId);

  if (error) {
    log.warn("persistence", `updateBotStatus error: ${error.message}`);
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
    log.warn("persistence", `insertTranscriptLine error: ${error.message}`);
  }
  return { ok: !error };
}

async function getSessionTranscript(sessionId, { limit = 500, offset = 0 } = {}) {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from("transcript_lines")
    .select("*")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    log.warn("persistence", `getSessionTranscript error: ${error.message}`);
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
    recommendation: alert.recommendation || null,
    ts: alert.ts || new Date().toISOString(),
  });

  if (error) {
    log.warn("persistence", `insertAlert error: ${error.message}`);
  }
  return { ok: !error };
}

async function getSessionAlerts(sessionId, { limit = 200, offset = 0 } = {}) {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from("alerts")
    .select("*")
    .eq("session_id", sessionId)
    .order("ts", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    log.warn("persistence", `getSessionAlerts error: ${error.message}`);
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
    log.warn("persistence", `insertSuggestion error: ${error.message}`);
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
    log.warn("persistence", `insertMetricsSnapshot error: ${error.message}`);
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

  // M10: Single query for alerts — compute count and severity breakdown from one result
  const [alertsRes, transcriptRes] = await Promise.all([
    db
      .from("alerts")
      .select("severity")
      .eq("session_id", sessionId),
    db
      .from("transcript_lines")
      .select("id", { count: "exact" })
      .eq("session_id", sessionId),
  ]);

  if (alertsRes.error) log.warn("persistence", "Failed to fetch alerts for report", alertsRes.error);
  if (transcriptRes.error) log.warn("persistence", "Failed to fetch transcript for report", transcriptRes.error);

  const alertRows = alertsRes.data || [];
  const alertCount = alertRows.length;
  const transcriptCount = transcriptRes.count || 0;

  const severityBreakdown = { low: 0, medium: 0, high: 0, critical: 0 };
  alertRows.forEach((a) => {
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
    log.warn("persistence", `generateReport error: ${error.message}`);
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

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

async function getUserNotifications(userId, { limit = 50, offset = 0 } = {}) {
  const db = getClient();
  if (!db) return { notifications: [], unreadCount: 0 };

  // 7.1: Run alerts query and unread-count RPC in parallel (independent queries)
  const [alertsResult, unreadResult] = await Promise.all([
    db
      .from("alerts")
      .select(`
        id,
        session_id,
        severity,
        category,
        title,
        message,
        confidence,
        source_model,
        recommendation,
        ts,
        created_at,
        sessions!inner(user_id),
        notification_reads!left(read_at, user_id)
      `)
      .eq("sessions.user_id", userId)
      .or(`user_id.eq.${userId},user_id.is.null`, { foreignTable: "notification_reads" })
      .order("ts", { ascending: false })
      .range(offset, offset + limit - 1),
    db.rpc("get_unread_notification_count", { p_user_id: userId }),
  ]);

  if (alertsResult.error) {
    log.warn("persistence", `getUserNotifications error: ${alertsResult.error.message}`);
    return { notifications: [], unreadCount: 0 };
  }

  const notifications = (alertsResult.data || []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    severity: row.severity,
    category: row.category,
    title: row.title,
    message: row.message,
    confidence: row.confidence,
    sourceModel: row.source_model,
    recommendation: row.recommendation || null,
    ts: row.ts,
    read: Array.isArray(row.notification_reads) && row.notification_reads.some(r => r.user_id === userId),
  }));

  // Use RPC result as primary; fall back to client-side count if RPC failed
  let unreadCount;
  if (unreadResult.error) {
    unreadCount = notifications.filter((n) => !n.read).length;
  } else {
    unreadCount = unreadResult.data ?? 0;
  }

  return { notifications, unreadCount };
}

async function markNotificationsRead(userId, alertIds) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  // H21: Verify alerts belong to this user's sessions before marking read
  const { data: owned } = await db
    .from("alerts")
    .select("id, sessions!inner(user_id)")
    .in("id", alertIds)
    .eq("sessions.user_id", userId);

  const ownedIds = (owned || []).map((a) => a.id);
  if (ownedIds.length === 0) return { ok: true };

  const rows = ownedIds.map((alertId) => ({
    user_id: userId,
    alert_id: alertId,
  }));

  const { error } = await db
    .from("notification_reads")
    .upsert(rows, { onConflict: "user_id,alert_id" });

  if (error) {
    log.warn("persistence", `markNotificationsRead error: ${error.message}`);
  }
  return { ok: !error };
}

async function markAllNotificationsRead(userId) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  // Get unread alert IDs for this user (7.2: capped at 1000 to prevent unbounded fetch)
  const { data, error: fetchError } = await db
    .from("alerts")
    .select("id, sessions!inner(user_id)")
    .eq("sessions.user_id", userId)
    .limit(1000);

  if (fetchError || !data || data.length === 0) {
    return { ok: !fetchError };
  }

  const rows = data.map((alert) => ({
    user_id: userId,
    alert_id: alert.id,
  }));

  const { error } = await db
    .from("notification_reads")
    .upsert(rows, { onConflict: "user_id,alert_id" });

  if (error) {
    log.warn("persistence", `markAllNotificationsRead error: ${error.message}`);
  }
  return { ok: !error };
}

async function getUnreadNotificationCount(userId) {
  const db = getClient();
  if (!db) return 0;

  const { data, error } = await db.rpc("get_unread_notification_count", { p_user_id: userId });
  if (error) {
    log.warn("persistence", `getUnreadNotificationCount error: ${error.message}`);
    return 0;
  }
  return data ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Detection settings                                                 */
/* ------------------------------------------------------------------ */

const DEFAULT_DETECTION_SETTINGS = {
  facialAnalysis: true,
  voicePattern: true,
  emotionDetection: true,
};

async function getDetectionSettings(userId) {
  const db = getClient();
  if (!db) return { ...DEFAULT_DETECTION_SETTINGS };

  const { data, error } = await db
    .from("profiles")
    .select("detection_settings")
    .eq("id", userId)
    .single();

  if (error || !data) return { ...DEFAULT_DETECTION_SETTINGS };
  return { ...DEFAULT_DETECTION_SETTINGS, ...data.detection_settings };
}

async function updateDetectionSettings(userId, settings) {
  const db = getClient();
  if (!db) return { ok: true, stub: true };

  // Whitelist allowed keys
  const allowed = ["facialAnalysis", "voicePattern", "emotionDetection"];
  const cleaned = {};
  for (const key of allowed) {
    if (typeof settings[key] === "boolean") {
      cleaned[key] = settings[key];
    }
  }

  const { error } = await db
    .from("profiles")
    .update({
      detection_settings: cleaned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    log.warn("persistence", `updateDetectionSettings error: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Returns true if Supabase client is configured and available. */
function isAvailable() {
  return getClient() !== null;
}

module.exports = {
  createSession,
  endSession,
  getActiveSessions,
  getUserSessions,
  getSessionById,
  updateBotStatus,
  insertTranscriptLine,
  getSessionTranscript,
  insertAlert,
  getSessionAlerts,
  insertSuggestion,
  insertMetricsSnapshot,
  generateReport,
  getSessionReport,
  getUserNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  getDetectionSettings,
  updateDetectionSettings,
  DEFAULT_DETECTION_SETTINGS,
  isAvailable,
};
