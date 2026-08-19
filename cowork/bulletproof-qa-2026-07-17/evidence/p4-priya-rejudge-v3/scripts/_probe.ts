import { api } from "./_helper";
const bookId = "d633f5ae-8b61-4175-bf31-810a41b30b78";
(async () => {
  const list = await api<{ batches: any[] }>("GET", `/api/books/${bookId}/batch`);
  const batches = (list.body as any).batches;
  console.log(
    "recent batches:",
    JSON.stringify(
      batches.map((b: any) => ({ id: b.id, status: b.status, spent: b.spentUsd, createdAt: b.createdAt, completed: b.completedCount })),
      null,
      1
    )
  );
  const latest = batches[0];
  const det = await api("GET", `/api/books/${bookId}/batch/${latest.id}`);
  console.log("LATEST id:", latest.id);
  console.log("LATEST detail status:", (det.body as any).batch.status, "spent:", (det.body as any).batch.spentUsd, "counts:", JSON.stringify((det.body as any).counts));
})();
