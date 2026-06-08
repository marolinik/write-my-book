"use client";

import { use } from "react";
import { WritingDashboard } from "@/components/book/writing-dashboard";

export default function WritingDashboardPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);

  return <WritingDashboard bookId={bookId} />;
}
