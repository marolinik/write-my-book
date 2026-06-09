#!/bin/sh
# backup-rotate.sh — Retention: 24 hourly, 7 daily, 4 weekly
# Called by db-backup sidecar after each hourly backup

BUCKET="wmb/wmb-projects/backups"
MC="/usr/local/bin/mc"

# Keep last 24 hourly backups, delete older
$MC ls "$BUCKET/hourly/" 2>/dev/null | sort -r | tail -n +25 | awk '{print $NF}' | while read f; do
  [ -n "$f" ] && $MC rm "$BUCKET/hourly/$f" 2>/dev/null
done

# Daily: copy latest hourly to daily/ at midnight (hour 00)
HOUR=$(date +%H)
if [ "$HOUR" = "00" ]; then
  LATEST=$($MC ls "$BUCKET/hourly/" 2>/dev/null | sort -r | head -1 | awk '{print $NF}')
  if [ -n "$LATEST" ]; then
    $MC cp "$BUCKET/hourly/$LATEST" "$BUCKET/daily/$LATEST" 2>/dev/null
  fi
  # Keep last 7 daily
  $MC ls "$BUCKET/daily/" 2>/dev/null | sort -r | tail -n +8 | awk '{print $NF}' | while read f; do
    [ -n "$f" ] && $MC rm "$BUCKET/daily/$f" 2>/dev/null
  done
fi

# Weekly: copy latest daily to weekly/ on Sundays at midnight
DOW=$(date +%u)
if [ "$DOW" = "7" ] && [ "$HOUR" = "00" ]; then
  LATEST=$($MC ls "$BUCKET/daily/" 2>/dev/null | sort -r | head -1 | awk '{print $NF}')
  if [ -n "$LATEST" ]; then
    $MC cp "$BUCKET/daily/$LATEST" "$BUCKET/weekly/$LATEST" 2>/dev/null
  fi
  # Keep last 4 weekly
  $MC ls "$BUCKET/weekly/" 2>/dev/null | sort -r | tail -n +5 | awk '{print $NF}' | while read f; do
    [ -n "$f" ] && $MC rm "$BUCKET/weekly/$f" 2>/dev/null
  done
fi
