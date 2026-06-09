#!/bin/bash
BOOK_ID="b6b3e176-1788-4230-93ea-f22c3d6dc475"
SESSION_ID="38f30728-7fcb-4fea-81fe-08d520bbe3e7"
OUTFILE="D:/Projects/Write-My-Book-OK/platform-new/tmp-sse-events.txt"

echo "Capturing SSE events for revise session $SESSION_ID..."
echo "" > "$OUTFILE"

# Capture SSE for up to 10 minutes
timeout 600 curl -s -N -L "http://localhost:3000/api/books/${BOOK_ID}/agent/${SESSION_ID}/stream" 2>/dev/null | while IFS= read -r line; do
  if [[ "$line" == data:* ]]; then
    # Extract event type
    TYPE=$(echo "$line" | sed 's/^data: //' | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('type','unknown'))" 2>/dev/null)

    # Log the event type
    echo "[$(date +%H:%M:%S)] type=$TYPE" >> "$OUTFILE"
    echo "[$(date +%H:%M:%S)] type=$TYPE"

    # For approval_request, capture the full payload
    if [ "$TYPE" = "approval_request" ]; then
      echo "$line" | sed 's/^data: //' >> "$OUTFILE"
      echo "APPROVAL_REQUEST found!"
    fi

    # For complete or error, capture and break
    if [ "$TYPE" = "complete" ] || [ "$TYPE" = "error" ]; then
      echo "$line" | sed 's/^data: //' >> "$OUTFILE"
      echo "Session ended with type=$TYPE"
      break
    fi
  fi
done

echo "SSE capture complete. Events saved to $OUTFILE"
