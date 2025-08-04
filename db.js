// db.js
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
dotenv.config()

let db = null

export async function connectToDB() {
  const client = new MongoClient(process.env.AUTH_DB_URI)
  await client.connect()
  db = client.db() // will use foodmed_auth
  console.log('✅ Connected to MongoDB')
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}
