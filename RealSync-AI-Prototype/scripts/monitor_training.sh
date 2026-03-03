#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  RealSync Training Monitor
#  Live dashboard for Audio (AASIST) & Deepfake (EfficientNet-B4) training
# ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

AUDIO_LOG="${BASE_DIR}/training_audio_v2.log"
DEEPFAKE_LOG="${BASE_DIR}/training_deepfake_labeled_v4.log"

REFRESH=2  # seconds

# ── Colors ───────────────────────────────────────────────
RST="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
RED="\033[31m"
BOLD_GREEN="\033[1;32m"
BOLD_YELLOW="\033[1;33m"
BOLD_RED="\033[1;31m"
BOLD_WHITE="\033[1;97m"

# Dashboard width
W=58

# ── Helpers ──────────────────────────────────────────────

hline() {
    local left="$1" fill="$2" right="$3"
    printf "%b%s" "$CYAN" "$left"
    for ((i = 0; i < W; i++)); do printf "%s" "$fill"; done
    printf "%s%b\n" "$right" "$RST"
}

row() {
    printf "%b║%b %b" "$CYAN" "$RST" "${1:-}"
    printf "\033[%dG%b║%b\n" "$((W + 3))" "$CYAN" "$RST"
}

progress_bar() {
    local current="${1:-0}" total="${2:-0}" width="${3:-22}"
    if ((total <= 0)); then
        printf "["
        for ((i = 0; i < width; i++)); do printf "░"; done
        printf "]  0%%"
        return
    fi
    local pct=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    printf "[%b" "$GREEN"
    for ((i = 0; i < filled; i++)); do printf "█"; done
    printf "%b" "$DIM"
    for ((i = 0; i < empty; i++)); do printf "░"; done
    printf "%b] %3d%%" "$RST" "$pct"
}

color_loss() {
    local val="${1:---}"
    if [[ "$val" == "--" ]]; then printf "%b--%b" "$DIM" "$RST"; return; fi
    local int_part
    int_part=$(awk "BEGIN {printf \"%d\", $val * 1000}")
    if ((int_part < 100)); then
        printf "%b%s%b" "$BOLD_GREEN" "$val" "$RST"
    elif ((int_part < 500)); then
        printf "%b%s%b" "$BOLD_YELLOW" "$val" "$RST"
    else
        printf "%b%s%b" "$BOLD_RED" "$val" "$RST"
    fi
}

color_acc() {
    local val="${1:---}"
    if [[ "$val" == "--" ]]; then printf "%b--%b" "$DIM" "$RST"; return; fi
    local pct
    pct=$(awk "BEGIN {printf \"%d\", $val * 100}")
    if ((pct >= 90)); then
        printf "%b%s%b" "$BOLD_GREEN" "$val" "$RST"
    elif ((pct >= 70)); then
        printf "%b%s%b" "$BOLD_YELLOW" "$val" "$RST"
    else
        printf "%b%s%b" "$BOLD_RED" "$val" "$RST"
    fi
}

trend_arrow() {
    local prev="${1:---}" curr="${2:---}" mode="${3:-higher_better}"
    if [[ "$prev" == "--" || "$curr" == "--" ]]; then printf " "; return; fi
    local cmp
    cmp=$(awk "BEGIN {print ($curr > $prev) ? 1 : ($curr < $prev) ? -1 : 0}")
    if [[ "$mode" == "higher_better" ]]; then
        case "$cmp" in
            1)  printf "%b↑%b" "$GREEN" "$RST" ;;
            -1) printf "%b↓%b" "$RED" "$RST" ;;
            *)  printf "%b→%b" "$DIM" "$RST" ;;
        esac
    else
        case "$cmp" in
            -1) printf "%b↓%b" "$GREEN" "$RST" ;;
            1)  printf "%b↑%b" "$RED" "$RST" ;;
            *)  printf "%b→%b" "$DIM" "$RST" ;;
        esac
    fi
}

check_process() {
    if pgrep -f "$1" > /dev/null 2>&1; then
        printf "%b[RUNNING]%b" "$BOLD_GREEN" "$RST"
    else
        printf "%b[STOPPED]%b" "$BOLD_RED" "$RST"
    fi
}

fmt_time() {
    local secs="${1:-0}"
    if ((secs < 60)); then
        printf "%ds" "$secs"
    elif ((secs < 3600)); then
        printf "%dm %ds" "$((secs / 60))" "$((secs % 60))"
    else
        printf "%dh %dm" "$((secs / 3600))" "$(((secs % 3600) / 60))"
    fi
}

# ── Log Parsers ──────────────────────────────────────────

parse_audio() {
    A_EPOCH=0; A_TOTAL=50; A_TLOSS="--"; A_TACC="--"
    A_VLOSS="--"; A_VACC="--"; A_LR="--"
    A_BATCH=0; A_BATCH_TOTAL=0; A_BEST_ACC="--"
    A_PREV_VLOSS="--"; A_PREV_VACC="--"

    [[ -f "$AUDIO_LOG" ]] || return 0

    # Last two epoch summaries for trend comparison
    local summaries last prev
    summaries=$(grep -E "^Epoch [0-9]+/[0-9]+ \|" "$AUDIO_LOG" 2>/dev/null | tail -2) || true
    last=$(echo "$summaries" | tail -1)
    prev=$(echo "$summaries" | head -1)

    if [[ -n "$last" ]]; then
        A_EPOCH=$(echo "$last" | sed -E 's/Epoch ([0-9]+)\/.*/\1/')
        A_TOTAL=$(echo "$last" | sed -E 's/Epoch [0-9]+\/([0-9]+).*/\1/')
        A_TLOSS=$(echo "$last" | sed -E 's/.*Train Loss: ([0-9.]+).*/\1/')
        A_TACC=$(echo "$last" | sed -E 's/.*Train Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        A_VLOSS=$(echo "$last" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        A_VACC=$(echo "$last" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        A_LR=$(echo "$last" | sed -E 's/.*LR: ([0-9.]+).*/\1/')
    fi

    # Trend from previous epoch
    if [[ -n "$prev" && "$prev" != "$last" ]]; then
        A_PREV_VLOSS=$(echo "$prev" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        A_PREV_VACC=$(echo "$prev" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
    fi

    # Batch progress within current epoch
    local last_batch
    last_batch=$(grep -E "Epoch [0-9]+ \| Batch" "$AUDIO_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$last_batch" ]]; then
        local b_epoch b_num b_total
        b_epoch=$(echo "$last_batch" | sed -E 's/.*Epoch ([0-9]+).*/\1/')
        b_num=$(echo "$last_batch" | sed -E 's/.*Batch ([0-9]+)\/.*/\1/')
        b_total=$(echo "$last_batch" | sed -E 's/.*Batch [0-9]+\/([0-9]+).*/\1/')
        if ((b_epoch > A_EPOCH)); then
            A_BATCH=$b_num
            A_BATCH_TOTAL=$b_total
            A_EPOCH=$b_epoch
        fi
    fi

    # Best checkpoint
    local best
    best=$(grep "Saved best" "$AUDIO_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$best" ]]; then
        A_BEST_ACC=$(echo "$best" | sed -E 's/.*val_acc: ([0-9.]+).*/\1/')
    fi
}

parse_deepfake() {
    D_EPOCH=0; D_TOTAL=30; D_TLOSS="--"; D_TACC="--"
    D_VLOSS="--"; D_VACC="--"; D_LR="--"
    D_BEST_ACC="--"; D_PREV_VLOSS="--"; D_PREV_VACC="--"

    [[ -f "$DEEPFAKE_LOG" ]] || return 0

    local summaries last prev
    summaries=$(grep -E "^Epoch [0-9]+/[0-9]+ \|" "$DEEPFAKE_LOG" 2>/dev/null | tail -2) || true
    last=$(echo "$summaries" | tail -1)
    prev=$(echo "$summaries" | head -1)

    if [[ -n "$last" ]]; then
        D_EPOCH=$(echo "$last" | sed -E 's/Epoch ([0-9]+)\/.*/\1/')
        D_TOTAL=$(echo "$last" | sed -E 's/Epoch [0-9]+\/([0-9]+).*/\1/')
        D_TLOSS=$(echo "$last" | sed -E 's/.*Train Loss: ([0-9.]+).*/\1/')
        D_TACC=$(echo "$last" | sed -E 's/.*Train Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        D_VLOSS=$(echo "$last" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        D_VACC=$(echo "$last" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
        # Dual LR format: bb=X hd=Y — show head LR
        D_LR=$(echo "$last" | sed -E 's/.*hd=([0-9.]+).*/\1/')
    fi

    if [[ -n "$prev" && "$prev" != "$last" ]]; then
        D_PREV_VLOSS=$(echo "$prev" | sed -E 's/.*Val Loss: ([0-9.]+).*/\1/')
        D_PREV_VACC=$(echo "$prev" | sed -E 's/.*Val Loss: [0-9.]+ Acc: ([0-9.]+).*/\1/')
    fi

    local best
    best=$(grep "Saved best" "$DEEPFAKE_LOG" 2>/dev/null | tail -1) || true
    if [[ -n "$best" ]]; then
        D_BEST_ACC=$(echo "$best" | sed -E 's/.*val_acc: ([0-9.]+).*/\1/')
    fi
}

estimate_eta() {
    local log_file="$1" current_epoch="$2" total_epochs="$3"
    if [[ ! -f "$log_file" ]] || ((current_epoch <= 0 || current_epoch >= total_epochs)); then
        printf "--"
        return
    fi

    local completed now file_birth elapsed
    completed=$(grep -c -E "^Epoch [0-9]+/[0-9]+ \|" "$log_file" 2>/dev/null) || true
    if ((completed < 2)); then
        printf "calculating..."
        return
    fi

    now=$(date +%s)
    file_birth=$(stat -f %B "$log_file" 2>/dev/null) || true
    if [[ -n "$file_birth" && "$file_birth" != "0" ]]; then
        elapsed=$((now - file_birth))
        ((elapsed > 30)) && elapsed=$((elapsed - 30))  # subtract data loading time
        local secs_per_epoch=$((elapsed / completed))
        local remaining=$((total_epochs - current_epoch))
        local eta_secs=$((secs_per_epoch * remaining))
        printf "~%s" "$(fmt_time $eta_secs)"
    else
        printf "calculating..."
    fi
}

# ── Render ───────────────────────────────────────────────

render_model() {
    local label="$1" process_name="$2"
    local epoch="$3" total="$4" batch="$5" batch_total="$6"
    local tloss="$7" tacc="$8" vloss="$9" vacc="${10}"
    local lr="${11}" prev_vloss="${12}" prev_vacc="${13}" best_acc="${14}"
    local log_file="${15}"

    local status
    status=$(check_process "$process_name")
    row "$(printf "%b  %s%b   %s" "$BOLD_WHITE" "$label" "$RST" "$status")"
    row ""

    # Epoch progress
    local bar
    bar=$(progress_bar "$epoch" "$total" 22)
    row "$(printf "  Epoch: %b%d/%d%b  %s" "$BOLD_WHITE" "$epoch" "$total" "$RST" "$bar")"

    # Batch progress (audio only)
    if ((batch > 0 && batch_total > 0)); then
        local b_bar
        b_bar=$(progress_bar "$batch" "$batch_total" 16)
        row "$(printf "  Batch: %d/%d  %s" "$batch" "$batch_total" "$b_bar")"
    fi

    # Train metrics
    row "$(printf "  Train Loss: %s     Acc: %s" "$(color_loss "$tloss")" "$(color_acc "$tacc")")"

    # Val metrics + trends
    local vl_trend va_trend best_mark=""
    vl_trend=$(trend_arrow "$prev_vloss" "$vloss" "lower_better")
    va_trend=$(trend_arrow "$prev_vacc" "$vacc" "higher_better")
    if [[ "$vacc" == "$best_acc" && "$vacc" != "--" ]]; then
        best_mark=$(printf " %b★ Best%b" "$BOLD_GREEN" "$RST")
    fi
    row "$(printf "  Val   Loss: %s %s  Acc: %s %s%s" "$(color_loss "$vloss")" "$vl_trend" "$(color_acc "$vacc")" "$va_trend" "$best_mark")"

    # LR + ETA
    local eta
    eta=$(estimate_eta "$log_file" "$epoch" "$total")
    row "$(printf "  LR: %b%s%b  │  ETA: %b%s%b" "$DIM" "$lr" "$RST" "$BOLD_WHITE" "$eta" "$RST")"

    # Best checkpoint
    if [[ "$best_acc" != "--" ]]; then
        local best_pct
        best_pct=$(awk "BEGIN {printf \"%.2f%%\", $best_acc * 100}")
        row "$(printf "  Best checkpoint: %b%s%b val acc" "$BOLD_GREEN" "$best_pct" "$RST")"
    fi
}

render() {
    printf "\033[H\033[J"

    parse_audio
    parse_deepfake

    local now
    now=$(date "+%H:%M:%S")

    # Header
    hline "╔" "═" "╗"
    row "$(printf "%b%b       ⚡ RealSync Training Monitor ⚡       %b" "$BOLD" "$CYAN" "$RST")"
    row "$(printf "%b          Last updated: %s            %b" "$DIM" "$now" "$RST")"
    hline "╠" "═" "╣"

    # Audio panel
    render_model "AUDIO MODEL (AASIST)          " "train_audio_sincconv" \
        "$A_EPOCH" "$A_TOTAL" "$A_BATCH" "$A_BATCH_TOTAL" \
        "$A_TLOSS" "$A_TACC" "$A_VLOSS" "$A_VACC" \
        "$A_LR" "$A_PREV_VLOSS" "$A_PREV_VACC" "$A_BEST_ACC" \
        "$AUDIO_LOG"

    hline "╠" "═" "╣"

    # Deepfake panel
    render_model "DEEPFAKE MODEL (EfficientNet-B4)" "finetune_deepfake_labeled" \
        "$D_EPOCH" "$D_TOTAL" 0 0 \
        "$D_TLOSS" "$D_TACC" "$D_VLOSS" "$D_VACC" \
        "$D_LR" "$D_PREV_VLOSS" "$D_PREV_VACC" "$D_BEST_ACC" \
        "$DEEPFAKE_LOG"

    # Footer
    hline "╚" "═" "╝"
    printf "%b  Press Ctrl+C to exit  │  Refreshing every %ds%b\n" "$DIM" "$REFRESH" "$RST"
}

# ── Main ─────────────────────────────────────────────────

printf "\033[?25l"  # hide cursor
trap 'printf "\033[?25h\n"; exit 0' INT TERM EXIT

while true; do
    render
    sleep "$REFRESH"
done
