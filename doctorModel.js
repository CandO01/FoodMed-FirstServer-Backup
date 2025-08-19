import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const client = new MongoClient(MONGODB_URI)

let doctorsCollection

// Initialize doctors DB
export async function initDoctorDB() {
  await client.connect()
  const db = client.db('foodmed') //single database
  doctorsCollection = db.collection('doctors') 
}

// Create doctor
export async function createDoctor(doctorData) {
  doctorData.patientsCount = 0
  doctorData.stars = 0
  doctorData.createdAt = new Date()
  doctorData.overview = doctorData.overview || ''
  const result = await doctorsCollection.insertOne(doctorData)
  return result // use result.insertedId in server response
}

// export async function getDoctorByEmail(email) {
//   const doctorsCollection = getDB().collection('doctors');
//   return await doctorsCollection.findOne({ email });
// }

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

export function getDoctorCollection(){
  return doctorsCollection;
}
