import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const client = new MongoClient(MONGODB_URI)

let doctorsCollection = null

// Initialize doctors DB
export async function initDoctorDB() {
  if (!client.topology?.isConnected()) {
    await client.connect()
  }
  const db = client.db('foodmed') // single database
  doctorsCollection = db.collection('doctors')
  console.log('✅ Doctors collection initialized')
}

// Create doctor
export async function createDoctor(doctorData) {
  doctorData.patientsCount = 0
  doctorData.stars = 0
  doctorData.createdAt = new Date()
  doctorData.overview = doctorData.overview || ''
  const result = await doctorsCollection.insertOne(doctorData)
  return result
}

// Get doctor by email
export async function getDoctorByEmail(email) {
  return await doctorsCollection.findOne({ email })
}

// Get all doctors
export async function getDoctors() {
  return await doctorsCollection.find().toArray()
}

// Update doctor info
export async function updateDoctor(id, updates) {
  return await doctorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  )
}

// Always return the current collection
export function getDoctorCollection() {
  if (!doctorsCollection) {
    throw new Error('❌ Doctors collection not initialized. Call initDoctorDB() first.')
  }
  return doctorsCollection
}
