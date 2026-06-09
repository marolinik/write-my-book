/**
 * Redis connection factory for BullMQ.
 *
 * Provides connection instances for the queue, workers, and pub/sub.
 * BullMQ requires `maxRetriesPerRequest: null` on its connections.
 *
 * Expected REDIS_URL format: redis://:password@host:port
 * Example: redis://:wmb-redis-prod@localhost:6379
 */

import IORedis from "ioredis";
import type { RedisOptions } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Connection options required by BullMQ.
 * - maxRetriesPerRequest: null is mandatory for BullMQ (it manages retries internally)
 * - enableReadyCheck: false avoids startup delays when Redis is in cluster/sentinel mode
 */
const bullmqOptions: Partial<RedisOptions> = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Create a new Redis connection for BullMQ use.
 * Each worker and subscriber should have its own connection.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, bullmqOptions);
}

// ── Singleton connections for the Next.js process ─────────────────────

let appConnection: IORedis | null = null;
let subscriberConnection: IORedis | null = null;

/**
 * Get the shared Redis connection for the main application process.
 * Used by the Queue instance and for general Redis commands.
 * Lazy-initialized singleton stored in module scope.
 */
export function getAppConnection(): IORedis {
  if (!appConnection) {
    appConnection = new IORedis(REDIS_URL, bullmqOptions);
  }
  return appConnection;
}

/**
 * Get a dedicated subscriber connection for Redis pub/sub.
 * Redis requires a separate connection for subscriptions because
 * a connection in subscriber mode cannot execute regular commands.
 */
export function getSubscriberConnection(): IORedis {
  if (!subscriberConnection) {
    subscriberConnection = new IORedis(REDIS_URL, bullmqOptions);
  }
  return subscriberConnection;
}
