// db.js
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

let db = null

export async function connectToDB() {
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  db = client.db('foodmed')   // single database
  console.log('✅ Connected to MongoDB')
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}


