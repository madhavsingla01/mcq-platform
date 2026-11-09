// Read-only operational report. Never prints a connection URI or document data.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireAuth = createRequire(new URL('../services/auth-service/package.json', import.meta.url));
requireAuth('dotenv').config({ path: fileURLToPath(new URL('../services/auth-service/.env', import.meta.url)) });
const { MongoClient } = requireAuth('mongoose').mongo;
const uri = process.env.DATABASE_CHECK_URI || process.env.MONGO_URI;
if (!uri) throw new Error('Set DATABASE_CHECK_URI or configure auth-service MONGO_URI.');
const client = new MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, waitQueueTimeoutMS: 5000 });
try {
  await client.connect();
  const db = client.db();
  const stats = await db.stats({ scale: 1024 * 1024 });
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const report = { database: db.databaseName, dataMiB: stats.dataSize, indexMiB: stats.indexSize, collections: [] };
  for (const { name } of collections.sort((a,b) => a.name.localeCompare(b.name))) {
    if (name.startsWith('system.')) continue;
    const collection = db.collection(name);
    const indexes = await collection.listIndexes().toArray();
    report.collections.push({ name, estimatedDocuments: await collection.estimatedDocumentCount(),
      indexes: indexes.map(({ name, key, unique, partialFilterExpression }) => ({ name, key, unique: Boolean(unique), ...(partialFilterExpression ? { partialFilterExpression } : {}) })) });
  }
  const duplicatePairs = await db.collection('conversations').aggregate([
    { $match: { isGroup: { $ne: true }, participants: { $size: 2 } } },
    { $project: { pair: { $sortArray: { input: '$participants', sortBy: 1 } } } },
    { $group: { _id: '$pair', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $count: 'count' },
  ], { maxTimeMS: 5000 }).toArray();
  report.duplicateDirectConversationPairs = duplicatePairs[0]?.count || 0;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Database inspection failed:', error.codeName || error.name, '(check credentials, connectivity and read permissions)');
  process.exitCode = 1;
} finally { await client.close(); }
