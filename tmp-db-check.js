const { PrismaClient } = require('./src/generated/prisma/client');
const db = new PrismaClient();

async function main() {
  try {
    const book = await db.book.findFirst({
      where: { id: 'b6b3e176-1788-4230-93ea-f22c3d6dc475' }
    });
    console.log('Book:', JSON.stringify(book, null, 2));

    if (book) {
      const chapters = await db.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { chapterNumber: 'asc' },
        select: { chapterNumber: true, title: true, status: true, wordCount: true, betaGate: true }
      });
      console.log('\nChapters:');
      for (const ch of chapters) {
        console.log(`  Ch.${ch.chapterNumber}: ${(ch.title || '?').substring(0, 40)} | status=${ch.status} | words=${ch.wordCount} | betaGate=${ch.betaGate}`);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await db.$disconnect();
  }
}

main();
