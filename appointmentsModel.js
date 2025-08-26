import { MongoClient, ObjectId } from "mongodb";
import dotenv from 'dotenv'

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI

const client = new MongoClient(MONGODB_URI)

let appointmentsCollection;

// Initialize appointments DB
export async function initAppointmentDB() {
  if(!client.topology?.isConnected()){
    await client.connect();
  }

  const db = client.db('foodmed');
  appointmentsCollection = db.collection('appointments');

  console.log('✅ Appointments collection initialized');
}

// Create Appointment
export async function createAppointment(appointment) {
  try {
    const result = await appointmentsCollection.insertOne({
      doctorId: new ObjectId(appointment.doctorId),
      patientId: new ObjectId(appointment.patientId),
      date: appointment.date || new Date().toISOString(),
      time: appointment.time || null,
      notes: appointment.notes || "",
      status: appointment.status || "Confirmed",
    });

    return result;
  } catch (err) {
    console.error("Error creating appointment:", err);
    throw err;
  }
}
// export async function createAppointment({ doctorId, patientId, date, time, notes }) {
//   const appointment = {
//     doctorId: new ObjectId(doctorId),
//     patientId: new ObjectId(patientId),
//     date,
//     time,
//     status: 'Pending', 
//     notes: notes || '',
//     createdAt: new Date(),
//     updatedAt: new Date()
//   }

//   const result = await appointmentsCollection.insertOne(appointment);

//   // increment doctor's patientsCount automatically

//   const doctorsCollection = client.db('foodmed').collection('doctors')
//   await doctorsCollection.updateOne(
//     { _id: new ObjectId(doctorId) },
//     { $inc: { patientsCount: 1 } }
//   )

//   return result
// }

// Get doctor’s appointments
export async function getAppointmentsByDoctor(doctorId) {
  return await appointmentsCollection
    .find({ doctorId: new ObjectId(doctorId) })
    .toArray()
}

// Get patient’s appointments
export async function getAppointmentsByPatient(patientId) {
  return await appointmentsCollection
    .find({ patientId: new ObjectId(patientId) })
    .toArray()
}

// Update appointment (status or time)
export async function updateAppointment(id, updates) {
  updates.updatedAt = new Date()
  return await appointmentsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  )
}

export function getAppointmentCollection() {
  if (!appointmentsCollection) {
    throw new Error("❌ Appointments collection not initialized. Call initAppointmentDB() first.")
  }
  return appointmentsCollection
}