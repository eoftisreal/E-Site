const mongoose = require('mongoose');

// Shared counters survive Appwrite cold starts and are consistent across instances.
// The collection's TTL index is created during DB connection setup.
class MongoRateLimitStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  bucket(key) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return { id: `${this.prefix}:${start}:${key}`, resetTime: new Date(start + this.windowMs) };
  }
  async increment(key) {
    const { id, resetTime } = this.bucket(key);
    const counter = await mongoose.connection.collection('rate_limits').findOneAndUpdate(
      { _id: id }, { $inc: { hits: 1 }, $setOnInsert: { resetAt: resetTime } },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false }
    );
    return { totalHits: counter.hits, resetTime };
  }
  async decrement(key) {
    const { id } = this.bucket(key);
    await mongoose.connection.collection('rate_limits').updateOne({ _id: id, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) {
    await mongoose.connection.collection('rate_limits').deleteOne({ _id: this.bucket(key).id });
  }
}

module.exports = MongoRateLimitStore;
