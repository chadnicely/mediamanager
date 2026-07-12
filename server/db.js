import mongoose from 'mongoose'

// Cache the connection across (serverless) invocations so we don't open a new
// pool on every request. This is the standard pattern for Mongo on Vercel.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sniddy'

let cached = global._sniddyMongo
if (!cached) cached = global._sniddyMongo = { conn: null, promise: null }

export async function connectDb() {
  if (cached.conn) return cached.conn
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { maxPoolSize: 5 }).then((m) => m)
  }
  cached.conn = await cached.promise
  return cached.conn
}
