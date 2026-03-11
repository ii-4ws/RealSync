#!/usr/bin/env python
"""
Training Monitor Dashboard — serves a live web UI at http://localhost:8501

Parses wav2vec2_training.log and serves a dashboard with:
- Real-time epoch progress (train loss/acc, val loss/acc, LR)
- Loss & accuracy charts
- Phase indicator (P1-frozen / P2-finetune)
- Best model stats
- Raw log tail

Usage:
    cd RealSync-AI-Prototype
    python training/monitor_training.py
"""
import json
import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "wavlm_training.log")
PORT = 8501


def parse_log():
    """Parse training log into structured data."""
    if not os.path.isfile(LOG_FILE):
        return {"epochs": [], "batches": [], "raw_tail": "(waiting for log file...)", "status": "waiting"}

    with open(LOG_FILE, "r") as f:
        lines = f.readlines()

    raw_text = "".join(lines)
    raw_tail = "".join(lines[-50:]) if len(lines) > 50 else raw_text

    epochs = []
    batches = []
    best_val_loss = None
    best_val_acc = None
    best_epoch = None
    phase = "P1-frozen"
    status = "running"
    data_info = {}
    early_stopped = False

    # Regex patterns
    epoch_re = re.compile(
        r"Epoch (\d+)/(\d+) \[(P[12]-\w+)\] \| "
        r"Train Loss: ([\d.]+) Acc: ([\d.]+) \| "
        r"Val Loss: ([\d.]+) Acc: ([\d.]+) \| "
        r"LR: ([\d./e-]+) \| "
        r"Time: ([\d.]+)min \| "
        r"ETA: ([\d.]+)min"
    )
    batch_re = re.compile(
        r"Epoch (\d+) \| Batch (\d+)/(\d+) \| Loss: ([\d.]+)(?: \| ETA: ([\d.]+)min)?"
    )
    saved_re = re.compile(
        r"-> Saved best \(val_loss: ([\d.]+), val_acc: ([\d.]+)\)"
    )
    data_re = re.compile(r"\[train\] Bonafide: (\d+), Spoof: (\d+)")
    phase2_re = re.compile(r"Phase 2: Unfreezing")
    early_re = re.compile(r"Early stopping at epoch (\d+)")
    final_re = re.compile(r"Best Val Loss: ([\d.]+)")
    verify_re = re.compile(r"Verification (PASSED|FAILED)")

    for line in lines:
        m = epoch_re.search(line)
        if m:
            epoch_num = int(m.group(1))
            total_epochs = int(m.group(2))
            phase = m.group(3)
            epochs.append({
                "epoch": epoch_num,
                "total": total_epochs,
                "phase": phase,
                "train_loss": float(m.group(4)),
                "train_acc": float(m.group(5)),
                "val_loss": float(m.group(6)),
                "val_acc": float(m.group(7)),
                "lr": m.group(8),
                "epoch_time_min": float(m.group(9)),
                "eta_min": float(m.group(10)),
            })
            continue

        m = batch_re.search(line)
        if m:
            batches.append({
                "epoch": int(m.group(1)),
                "batch": int(m.group(2)),
                "total_batches": int(m.group(3)),
                "loss": float(m.group(4)),
                "batch_eta_min": float(m.group(5)) if m.group(5) else None,
            })
            continue

        m = saved_re.search(line)
        if m:
            best_val_loss = float(m.group(1))
            best_val_acc = float(m.group(2))
            best_epoch = epochs[-1]["epoch"] if epochs else None
            continue

        m = data_re.search(line)
        if m:
            data_info = {"bonafide": int(m.group(1)), "spoof": int(m.group(2))}
            continue

        if phase2_re.search(line):
            phase = "P2-finetune"
            continue

        m = early_re.search(line)
        if m:
            early_stopped = True
            status = "completed"
            continue

        m = verify_re.search(line)
        if m:
            status = "completed"
            continue

        m = final_re.search(line)
        if m:
            best_val_loss = float(m.group(1))
            status = "completed"

    # Determine current progress
    current_epoch = epochs[-1]["epoch"] if epochs else 0
    total_epochs = epochs[-1]["total"] if epochs else 20

    # Current batch progress
    current_batch = 0
    total_batches = 0
    batch_eta_min = None
    if batches:
        last_batch = batches[-1]
        if not epochs or last_batch["epoch"] > epochs[-1]["epoch"]:
            current_batch = last_batch["batch"]
            total_batches = last_batch["total_batches"]
            batch_eta_min = last_batch.get("batch_eta_min")

    # Total ETA calculation
    total_eta_min = None
    last_epoch_time = None
    if epochs:
        last_epoch_time = epochs[-1].get("epoch_time_min")
        total_eta_min = epochs[-1].get("eta_min")
    elif batch_eta_min is not None:
        # Estimate from batch ETA (epoch hasn't completed yet)
        total_eta_min = batch_eta_min + (batch_eta_min / max(current_batch, 1)) * total_batches * (total_epochs - 1)

    return {
        "epochs": epochs,
        "current_epoch": current_epoch,
        "total_epochs": total_epochs,
        "current_batch": current_batch,
        "total_batches": total_batches,
        "phase": phase,
        "best_val_loss": best_val_loss,
        "best_val_acc": best_val_acc,
        "best_epoch": best_epoch,
        "data_info": data_info,
        "early_stopped": early_stopped,
        "status": status,
        "raw_tail": raw_tail,
        "total_eta_min": total_eta_min,
        "last_epoch_time_min": last_epoch_time,
        "batch_eta_min": batch_eta_min,
    }


DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wav2Vec2 Training Monitor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0e17; color: #e0e6ed; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; }

  .header { background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%); padding: 20px 32px; border-bottom: 1px solid #21262d; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: 600; color: #58a6ff; }
  .header .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
  .status-running { background: #1b4332; color: #40c057; animation: pulse 2s infinite; }
  .status-completed { background: #1a3a5c; color: #58a6ff; }
  .status-waiting { background: #3d2800; color: #d29922; }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px 32px; }
  .card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  .card-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card-value { font-size: 28px; font-weight: 700; }
  .card-sub { font-size: 11px; color: #8b949e; margin-top: 4px; }
  .green { color: #40c057; }
  .blue { color: #58a6ff; }
  .orange { color: #d29922; }
  .red { color: #f85149; }

  .progress-section { padding: 0 32px 16px; }
  .progress-bar-outer { background: #21262d; border-radius: 4px; height: 8px; overflow: hidden; }
  .progress-bar-inner { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
  .progress-label { font-size: 11px; color: #8b949e; margin-top: 6px; display: flex; justify-content: space-between; }
  .p1-bar { background: linear-gradient(90deg, #40c057, #37b24d); }
  .p2-bar { background: linear-gradient(90deg, #58a6ff, #1f6feb); }

  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 32px 16px; }
  .chart-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  .chart-card h3 { font-size: 13px; color: #8b949e; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  canvas { width: 100% !important; height: 200px !important; }

  .table-section { padding: 0 32px 16px; }
  .epoch-table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #21262d; border-radius: 8px; overflow: hidden; }
  .epoch-table th { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262d; }
  .epoch-table td { font-size: 13px; padding: 8px 12px; border-bottom: 1px solid #21262d; }
  .epoch-table tr:hover { background: #1c2128; }
  .epoch-table tr.best { background: #0d2818; }
  .phase-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .phase-p1 { background: #1b4332; color: #40c057; }
  .phase-p2 { background: #1a3a5c; color: #58a6ff; }

  .log-section { padding: 0 32px 32px; }
  .log-card { background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto; }
  .log-card pre { font-size: 11px; line-height: 1.6; color: #8b949e; white-space: pre-wrap; word-break: break-all; }

  .updated { font-size: 11px; color: #484f58; text-align: center; padding: 12px; }
</style>
</head>
<body>

<div class="header">
  <h1>WavLM Audio Deepfake - Training Monitor</h1>
  <span class="status status-waiting" id="status">WAITING</span>
</div>

<div class="grid">
  <div class="card">
    <div class="card-label">Epoch</div>
    <div class="card-value blue" id="epoch">-/-</div>
    <div class="card-sub" id="phase-label">-</div>
  </div>
  <div class="card">
    <div class="card-label">Best Val Accuracy</div>
    <div class="card-value green" id="best-acc">-</div>
    <div class="card-sub" id="best-epoch">-</div>
  </div>
  <div class="card">
    <div class="card-label">Best Val Loss</div>
    <div class="card-value orange" id="best-loss">-</div>
    <div class="card-sub" id="data-info">-</div>
  </div>
  <div class="card">
    <div class="card-label">Learning Rate</div>
    <div class="card-value" id="lr" style="font-size:18px;">-</div>
    <div class="card-sub" id="batch-progress">-</div>
  </div>
</div>

<div class="progress-section">
  <div class="progress-bar-outer">
    <div class="progress-bar-inner p1-bar" id="progress-bar" style="width: 0%"></div>
  </div>
  <div class="progress-label">
    <span id="progress-text">0%</span>
    <span id="eta">-</span>
  </div>
</div>

<div class="charts-grid">
  <div class="chart-card">
    <h3>Loss</h3>
    <canvas id="lossChart"></canvas>
  </div>
  <div class="chart-card">
    <h3>Accuracy</h3>
    <canvas id="accChart"></canvas>
  </div>
</div>

<div class="table-section">
  <table class="epoch-table" id="epoch-table">
    <thead>
      <tr><th>Epoch</th><th>Phase</th><th>Train Loss</th><th>Train Acc</th><th>Val Loss</th><th>Val Acc</th><th>Time</th><th>LR</th><th></th></tr>
    </thead>
    <tbody id="epoch-tbody"></tbody>
  </table>
</div>

<div class="log-section">
  <div class="chart-card">
    <h3>Raw Log (last 50 lines)</h3>
    <div class="log-card"><pre id="raw-log">Waiting for training to start...</pre></div>
  </div>
</div>

<div class="updated" id="updated">-</div>

<script>
// Minimal chart drawing on canvas (no dependencies)
function drawChart(canvasId, datasets, yLabel) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { top: 10, right: 16, bottom: 28, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // Find ranges
  let allVals = [];
  let maxX = 1;
  datasets.forEach(ds => {
    ds.data.forEach((v, i) => { allVals.push(v); maxX = Math.max(maxX, i + 1); });
  });
  if (allVals.length === 0) return;
  let minY = Math.min(...allVals);
  let maxY = Math.max(...allVals);
  if (minY === maxY) { minY -= 0.1; maxY += 0.1; }
  const rangeY = maxY - minY;
  minY -= rangeY * 0.05;
  maxY += rangeY * 0.05;

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const val = maxY - ((maxY - minY) / 4) * i;
    ctx.fillStyle = '#484f58';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(4), pad.left - 6, y + 3);
  }

  // X labels
  ctx.fillStyle = '#484f58';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(maxX / 10));
  for (let i = 0; i < maxX; i += step) {
    const x = pad.left + (i / (maxX - 1 || 1)) * plotW;
    ctx.fillText(i + 1, x, H - 6);
  }

  // Lines
  datasets.forEach(ds => {
    if (ds.data.length < 2) return;
    ctx.strokeStyle = ds.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ds.data.forEach((v, i) => {
      const x = pad.left + (i / (maxX - 1 || 1)) * plotW;
      const y = pad.top + plotH - ((v - minY) / (maxY - minY)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = ds.color;
    ds.data.forEach((v, i) => {
      const x = pad.left + (i / (maxX - 1 || 1)) * plotW;
      const y = pad.top + plotH - ((v - minY) / (maxY - minY)) * plotH;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  });

  // Legend
  let lx = pad.left + 8;
  datasets.forEach(ds => {
    ctx.fillStyle = ds.color;
    ctx.fillRect(lx, pad.top + 4, 12, 3);
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(ds.label, lx + 16, pad.top + 9);
    lx += ctx.measureText(ds.label).width + 36;
  });
}

let prevEpochCount = 0;

function buildEpochRow(e, isBest) {
  const tr = document.createElement('tr');
  if (isBest) tr.className = 'best';

  const phaseClass = e.phase.includes('P1') ? 'phase-p1' : 'phase-p2';

  const epochTime = e.epoch_time_min != null ? e.epoch_time_min.toFixed(1) + 'm' : '-';
  const cells = [
    e.epoch + '/' + e.total,
    null, // phase badge handled separately
    e.train_loss.toFixed(4),
    (e.train_acc * 100).toFixed(2) + '%',
    e.val_loss.toFixed(4),
    (e.val_acc * 100).toFixed(2) + '%',
    epochTime,
    e.lr,
    isBest ? '\u2605' : '',
  ];

  cells.forEach((text, i) => {
    const td = document.createElement('td');
    if (i === 1) {
      const span = document.createElement('span');
      span.className = 'phase-badge ' + phaseClass;
      span.textContent = e.phase;
      td.appendChild(span);
    } else if (i === 7) {
      td.style.fontSize = '11px';
      td.textContent = text;
    } else {
      td.textContent = text;
    }
    tr.appendChild(td);
  });

  return tr;
}

async function refresh() {
  try {
    const res = await fetch('/api/data');
    const d = await res.json();

    // Status
    const statusEl = document.getElementById('status');
    statusEl.textContent = d.status.toUpperCase();
    statusEl.className = 'status status-' + d.status;

    // Cards
    document.getElementById('epoch').textContent = d.current_epoch + '/' + d.total_epochs;
    const phaseText = d.phase === 'P2-finetune' ? 'Phase 2: Fine-tuning' : 'Phase 1: Head Only';
    document.getElementById('phase-label').textContent = phaseText;

    if (d.best_val_acc != null) {
      document.getElementById('best-acc').textContent = (d.best_val_acc * 100).toFixed(2) + '%';
      document.getElementById('best-epoch').textContent = 'at epoch ' + d.best_epoch;
    }
    if (d.best_val_loss != null) {
      document.getElementById('best-loss').textContent = d.best_val_loss.toFixed(4);
    }
    if (d.data_info && d.data_info.bonafide) {
      document.getElementById('data-info').textContent =
        'Data: ' + d.data_info.bonafide + ' real / ' + d.data_info.spoof + ' spoof';
    }

    if (d.epochs.length > 0) {
      const last = d.epochs[d.epochs.length - 1];
      document.getElementById('lr').textContent = last.lr;
    }

    if (d.current_batch > 0 && d.total_batches > 0) {
      document.getElementById('batch-progress').textContent =
        'Batch ' + d.current_batch + '/' + d.total_batches;
    }

    // Progress bar
    let pct = 0;
    if (d.total_epochs > 0) {
      let epochProgress = d.current_epoch / d.total_epochs;
      if (d.current_batch > 0 && d.total_batches > 0) {
        epochProgress = (d.current_epoch - 1 + d.current_batch / d.total_batches) / d.total_epochs;
      }
      pct = Math.min(100, epochProgress * 100);
    }
    if (d.status === 'completed') pct = 100;

    const bar = document.getElementById('progress-bar');
    bar.style.width = pct.toFixed(1) + '%';
    bar.className = 'progress-bar-inner ' + (d.phase === 'P2-finetune' ? 'p2-bar' : 'p1-bar');
    document.getElementById('progress-text').textContent = pct.toFixed(1) + '% complete';

    // ETA
    let etaText = '-';
    if (d.status === 'completed') {
      etaText = 'Done!';
    } else if (d.total_eta_min != null) {
      const mins = Math.round(d.total_eta_min);
      if (mins >= 60) {
        etaText = Math.floor(mins/60) + 'h ' + (mins%60) + 'm remaining';
      } else {
        etaText = mins + 'min remaining';
      }
    } else if (d.batch_eta_min != null) {
      etaText = '~' + Math.round(d.batch_eta_min) + 'min (this epoch)';
    }
    document.getElementById('eta').textContent = etaText;

    // Epoch time
    if (d.last_epoch_time_min != null) {
      document.getElementById('batch-progress').textContent =
        d.last_epoch_time_min.toFixed(1) + 'min/epoch';
    } else if (d.current_batch > 0 && d.total_batches > 0) {
      document.getElementById('batch-progress').textContent =
        'Batch ' + d.current_batch + '/' + d.total_batches;
    }

    // Charts
    if (d.epochs.length > 0 && d.epochs.length !== prevEpochCount) {
      prevEpochCount = d.epochs.length;
      drawChart('lossChart', [
        { label: 'Train', color: '#58a6ff', data: d.epochs.map(e => e.train_loss) },
        { label: 'Val', color: '#f85149', data: d.epochs.map(e => e.val_loss) },
      ]);
      drawChart('accChart', [
        { label: 'Train', color: '#58a6ff', data: d.epochs.map(e => e.train_acc) },
        { label: 'Val', color: '#40c057', data: d.epochs.map(e => e.val_acc) },
      ]);
    }

    // Epoch table — safe DOM construction
    const tbody = document.getElementById('epoch-tbody');
    tbody.replaceChildren();
    d.epochs.slice().reverse().forEach(e => {
      const isBest = d.best_epoch === e.epoch;
      tbody.appendChild(buildEpochRow(e, isBest));
    });

    // Raw log
    document.getElementById('raw-log').textContent = d.raw_tail;
    const logCard = document.querySelector('.log-card');
    logCard.scrollTop = logCard.scrollHeight;

    document.getElementById('updated').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Refresh error:', err);
  }
}

refresh();
setInterval(refresh, 3000);
window.addEventListener('resize', () => { prevEpochCount = 0; refresh(); });
</script>
</body>
</html>"""


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(DASHBOARD_HTML.encode())
        elif self.path == "/api/data":
            data = parse_log()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress request logs


if __name__ == "__main__":
    print(f"Training Monitor Dashboard")
    print(f"  URL:  http://localhost:{PORT}")
    print(f"  Log:  {LOG_FILE}")
    print(f"  Auto-refreshes every 3 seconds")
    print()
    server = HTTPServer(("0.0.0.0", PORT), DashboardHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
        server.server_close()
