// db.js
import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

let db = null

export async function connectToDB() {
  console.log('MONGODB_URI from env:', process.env.MONGODB_URI)
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  db = client.db('foodmed')   // single database
  console.log('✅ Connected to MongoDB')
}

export function getDB() {
  if (!db) throw new Error('DB not initialized')
  return db
}


