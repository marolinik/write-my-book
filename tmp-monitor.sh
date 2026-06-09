#!/bin/bash
BOOK_ID="b6b3e176-1788-4230-93ea-f22c3d6dc475"
SESSION_A="d56bae0d-2e02-44fc-937e-a22519f25fe3"
SESSION_B="3d90ccee-f3aa-4d74-842c-86e02bed941a"

echo "Monitoring concurrent sessions..."
for i in $(seq 1 40); do
  sleep 15
  STATUS_A=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 5 AND agent_type = 'line-editor';" 2>/dev/null | tr -d ' ')
  STATUS_B=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 6 AND agent_type = 'line-editor';" 2>/dev/null | tr -d ' ')

  SESS_A_STATUS=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT status FROM agent_sessions WHERE id = '$SESSION_A';" 2>/dev/null | tr -d ' ')
  SESS_B_STATUS=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT status FROM agent_sessions WHERE id = '$SESSION_B';" 2>/dev/null | tr -d ' ')

  echo "[$(date +%H:%M:%S)] Ch.5: ${STATUS_A} line-edit findings (${SESS_A_STATUS}) | Ch.6: ${STATUS_B} line-edit findings (${SESS_B_STATUS})"

  if [ "$SESS_A_STATUS" != "running" ] && [ "$SESS_B_STATUS" != "running" ]; then
    echo "Both sessions finished."
    break
  fi
done

echo ""
echo "=== Final session statuses ==="
docker exec platform-new-postgres-1 psql -U postgres -d writemybook -c "
SELECT id, status, tokens_input, tokens_output, started_at, completed_at
FROM agent_sessions
WHERE id IN ('$SESSION_A', '$SESSION_B')
ORDER BY started_at;"
