#!/bin/bash
BOOK_ID="b6b3e176-1788-4230-93ea-f22c3d6dc475"

echo "=== Cross-contamination check ==="

CH5_LINE_COUNT=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 5 AND agent_type = 'line-editor';" | tr -d ' ')
echo "Ch.5 line-edit findings: $CH5_LINE_COUNT"

CH6_LINE_COUNT=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 6 AND agent_type = 'line-editor';" | tr -d ' ')
echo "Ch.6 line-edit findings: $CH6_LINE_COUNT"

echo ""
echo "Session-finding isolation (should all be 0):"
CH5_REF_CH6=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 5 AND agent_type = 'line-editor' AND (description LIKE '%Simboli%' OR description LIKE '%poglavlje 6%');" | tr -d ' ')
echo "Ch.5 findings referencing ch.6 content: $CH5_REF_CH6"

CH6_REF_CH5=$(docker exec platform-new-postgres-1 psql -U postgres -d writemybook -t -c "SELECT COUNT(*) FROM edit_findings WHERE book_id = '$BOOK_ID' AND chapter_number = 6 AND agent_type = 'line-editor' AND (description LIKE '%Milovanovi%' OR description LIKE '%poglavlje 5%');" | tr -d ' ')
echo "Ch.6 findings referencing ch.5 content: $CH6_REF_CH5"

echo ""
echo "=== Chapter statuses ==="
docker exec platform-new-postgres-1 psql -U postgres -d writemybook -c "SELECT chapter_number, status FROM chapters WHERE book_id = '$BOOK_ID' AND chapter_number IN (5, 6) ORDER BY chapter_number;"
