import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Find the most recent ANALYSIS_REPORT document
    const doc = await db.document.findFirst({
      where: { bookId, type: "ANALYSIS_REPORT" },
      orderBy: { updatedAt: "desc" },
      select: { storageKey: true },
    });

    if (!doc) {
      return NextResponse.json({
        empty: true,
        message: "No analysis report found. Run the manuscript analyst agent to generate one.",
      });
    }

    // Read content from S3
    try {
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || "us-east-1",
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      });

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: doc.storageKey,
      });
      const result = await s3.send(command);
      const content = await result.Body?.transformToString("utf-8");

      if (!content) {
        return NextResponse.json({ empty: true, message: "Analysis report is empty." });
      }

      // Try to parse as JSON (structured analysis data)
      try {
        const data = JSON.parse(content);
        return NextResponse.json(data);
      } catch {
        // If not JSON, return raw content with empty flag false
        return NextResponse.json({
          empty: false,
          readability: {
            fleschKincaid: 0,
            gunningFog: 0,
            colemanLiau: 0,
            genreBenchmark: null,
          },
          pacing: [],
          dialogue: [],
          overuse: [],
          rawContent: content,
        });
      }
    } catch (err) {
      console.error("S3 read error:", err);
      return NextResponse.json({ empty: true, message: "Could not read analysis report." });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
