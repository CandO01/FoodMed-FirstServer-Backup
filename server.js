import http from 'node:http'
import { connectToDB, getDB } from './db.js'
import { initDoctorDB, createDoctor, getDoctors, updateDoctor, getDoctorByEmail } from './doctorModel.js'
import dotenv from 'dotenv'
import formidable from 'formidable'
import nodemailer from 'nodemailer'
import bcrypt from 'bcrypt'
import { v2 as cloudinary } from 'cloudinary'

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const PORT = process.env.PORT || 5223

// Email Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS
  }
})

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const db = getDB()
  const usersCollection = db.collection('users')
  const otpsCollection = db.collection('otps')

  const parseBody = async () =>
    new Promise((resolve) => {
      let body = ''
      req.on('data', chunk => (body += chunk.toString()))
      req.on('end', () => resolve(JSON.parse(body)))
    })

  const sendOTPEmail = (email, otp) => {
    return transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: 'Your FOODMED OTP Code',
      text: `Your OTP code is ${otp}`
    })
  }

  // ---------------- USER SIGNUP ----------------
  if (req.url === '/signup' && req.method === 'POST') {
    const { name, email, password, confirm, phone, canDonate, canRequest } = await parseBody()

    if (!name || !email || !password || password !== confirm || !phone || canDonate === undefined || canRequest === undefined) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Invalid input' }))
      return
    }

    const existing = await usersCollection.findOne({ email })
    if (existing) {
      res.writeHead(409)
      res.end(JSON.stringify({ error: 'User already exists' }))
      return
    }

    const saltrounds = 10
    const hashedPassword = await bcrypt.hash(password, saltrounds)

    const result = await usersCollection.insertOne({
      name,
      phone,
      email,
      password: hashedPassword,
      profileImage: '',
      foodPreference: '',
      bio: '',
      location: '',
      canDonate,
      canRequest
    })

    const newUser = {
      id: result.insertedId,
      name,
      phone,
      email,
      canDonate,
      canRequest
    }

    res.writeHead(200)
    res.end(JSON.stringify({ message: 'Signup successful', user: newUser }))
  }

  // ---------------- PROFILE SETUP ----------------
  else if (req.url === '/profile-setup' && req.method === 'POST') {
    const { email, profileImage, bio, location } = await parseBody()

    if (!email || !profileImage || !bio || !location) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Missing required fields' }))
      return
    }

    try {
      const formData = new URLSearchParams()
      formData.append('file', profileImage)
      formData.append('upload_preset', 'foodmed_unsigned')

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      )

      const cloudData = await cloudinaryRes.json()

      if (!cloudData.secure_url) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: 'Image upload failed' }))
        return
      }

      const imageUrl = cloudData.secure_url

      const result = await usersCollection.updateOne(
        { email },
        { $set: { profileImage: imageUrl, bio, location } }
      )

      if (result.modifiedCount === 1) {
        res.writeHead(200)
        res.end(JSON.stringify({ message: 'Profile updated successfully', profileImage: imageUrl, bio }))
      } else {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'User not found or no update made' }))
      }
    } catch (err) {
      console.error(err)
      res.writeHead(500)
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  }

  // ---------------- GET USER PROFILE ----------------
  else if (req.url.startsWith('/user-profile') && req.method === 'GET') {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
    const email = parsedUrl.searchParams.get('email')

    if (!email) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Email query parameter is required' }))
      return
    }

    try {
      const user = await usersCollection.findOne({ email })
      if (!user) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'User not found' }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          name: user.name,
          email: user.email,
          bio: user.bio || '',
          profileImage: user.profileImage || '',
          location: user.location || '',
          phone: user.phone || '',
          canDonate: user.canDonate || false,
          canRequest: user.canRequest || false
        }))
      }
    } catch (err) {
      console.error(err)
      res.writeHead(500)
      res.end(JSON.stringify({ error: 'Server error' }))
    }
  }

  // ---------------- LOGIN ----------------
  else if (req.url === '/login' && req.method === 'POST') {
  try {
    const { email, password } = await parseBody();

    const usersCollection = getDB().collection('users');

    // 1️⃣ Try to find a user
    let user = await usersCollection.findOne({ email });

    // 2️⃣ If not found, try doctors
    if (!user) {
      user = await getDoctorByEmail(email);
    }

    // 3️⃣ If still not found → invalid credentials
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
      return;
    }

    // 4️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
      return;
    }

    // 5️⃣ Successful login response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Login successful',
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      canDonate: user.canDonate || false,
      canRequest: user.canRequest || false,
      role: user.specialty ? 'doctor' : 'user',
      specialty: user.specialty || null,
      image: user.image || null,
      redirect: user.specialty ? 'medical' : 'home'
    }));

  } catch (err) {
    console.error('Login error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error' }));
  }
}
//   else if (req.url === '/login' && req.method === 'POST') {
//   const { email, password } = await parseBody()

//   const usersCollection = getDB().collection('users')

//   // 1️⃣ Try to find user
//   let user = await usersCollection.findOne({ email })

//   // 2️⃣ If not found, try doctors
//   if (!user) {
//     user = await getDoctorByEmail(email) // make sure this function returns null if not found
//   }

//   // 3️⃣ If still not found → invalid credentials
//   if (!user) {
//     res.writeHead(401)
//     res.end(JSON.stringify({ error: 'Invalid credentials' }))
//     return
//   }

//   // 4️⃣ Only now compare password
//   const isMatch = await bcrypt.compare(password, user.password)
//   if (!isMatch) {
//     res.writeHead(401)
//     res.end(JSON.stringify({ error: 'Invalid credentials' }))
//     return
//   }

//   // 5️⃣ Successful login
//   res.writeHead(200)
//   res.end(JSON.stringify({
//     message: 'Login successful',
//     id: user._id,
//     name: user.name,
//     email: user.email,
//     phone: user.phone,
//     canDonate: user.canDonate || false,
//     canRequest: user.canRequest || false,
//     role: user.specialty ? 'doctor' : 'user',
//     redirect: 'landing-page'
//   }))
// }

  // else if (req.url === '/login' && req.method === 'POST') {
  //   const { email, password } = await parseBody()
  //   const user = await usersCollection.findOne({ email })

  //   if (!user) {
  //     res.writeHead(401)
  //     res.end(JSON.stringify({ error: 'Invalid credentials' }))
  //   }

  //   const isMatch = await bcrypt.compare(password, user.password)
  //   if (!isMatch) {
  //     res.writeHead(401)
  //     res.end(JSON.stringify({ error: 'Invalid credentials' }))
  //   } else {
  //     res.writeHead(200)
  //     res.end(JSON.stringify({
  //       message: 'You have logged in successfully',
  //       id: user._id,
  //       name: user.name,
  //       email: user.email,
  //       phone: user.phone,
  //       canDonate: user.canDonate,
  //       canRequest: user.canRequest,
  //       redirect: 'landing-page'
  //     }))
  //   }
  // }

  // ---------------- OTP ----------------
  else if (req.url === '/send-otp' && req.method === 'POST') {
    const { email } = await parseBody()
    const user = await usersCollection.findOne({ email })

    if (!user) {
      res.writeHead(404)
      res.end(JSON.stringify({ error: 'User not found' }))
    } else {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await otpsCollection.updateOne(
        { email },
        { $set: { otp, createdAt: Date.now() } },
        { upsert: true }
      )

      await sendOTPEmail(email, otp)
      res.writeHead(200)
      res.end(JSON.stringify({ message: 'OTP sent to email' }))
    }
  }

  else if (req.url === '/verify-otp' && req.method === 'POST') {
    const { email, otp } = await parseBody()
    const record = await otpsCollection.findOne({ email })

    if (!record || record.otp !== otp.trim()) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Invalid OTP' }))
    } else {
      const expired = Date.now() - record.createdAt > 5 * 60 * 1000
      if (expired) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'OTP expired' }))
      } else {
        res.writeHead(200)
        res.end(JSON.stringify({ message: 'OTP verified' }))
      }
    }
  }

  else if (req.url === '/reset-password' && req.method === 'POST') {
    const { email, password, confirm } = await parseBody()
    if (password !== confirm) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Passwords do not match' }))
    } else {
      const saltRounds = 10
      const hashedPassword = await bcrypt.hash(password, saltRounds)
      const updated = await usersCollection.updateOne({ email }, { $set: { password: hashedPassword } })
      if (updated.matchedCount === 0) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'User not found' }))
      } else {
        res.writeHead(200)
        res.end(JSON.stringify({ message: 'Password reset successful' }))
      }
    }
  }

  else if (req.url === '/users' && req.method === 'GET') {
    const users = await usersCollection.find().toArray()
    res.writeHead(200)
    res.end(JSON.stringify(users))
  }

  // ---------------- DOCTOR SIGNUP ----------------
  else if (req.url === '/doctors' && req.method === 'POST') {
    const form = formidable({ multiples: false })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.writeHead(400, { 'Content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Form parsing failed' }))
        return
      }

      try {
        let imageUrl = ''
        if (files.image && files.image[0]) {
          const uploadResult = await cloudinary.uploader.upload(files.image[0].filepath, {
            folder: 'foodmed/doctors'
          })
          imageUrl = uploadResult.secure_url
        }

          const saltrounds = 10
         const hashedPassword = await bcrypt.hash(fields.password?.toString(), saltrounds)

        const doctorData = {
          name: fields.name?.toString(),
          specialty: fields.specialty?.toString(),
          email: fields.email?.toString(),
          password: hashedPassword,
          phone: fields.phone?.toString(),
          image: imageUrl
        }

        const result = await createDoctor(doctorData)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Doctor created', id: result.insertedId }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // ---------------- GET ALL DOCTORS ----------------
  else if (req.url === '/doctors' && req.method === 'GET') {
    const doctors = await getDoctors()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(doctors))
  }

  // ---------------- UPDATE DOCTOR ----------------
  else if (req.url.startsWith('/doctors/') && req.method === 'PATCH') {
    const action = req.url.split('/')[2]   // <-- fixed index
    if(action === 'book'){
      let body = ''
      req.on('data', chunk => (body += chunk.toString()))
      req.on('end', async () => {
        try {
          const result = await doctorsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { patientsCount: 1 } }
          );

          if(result.modifiedCount > 0){
            res.writeHead(200, { 'Content-Type':'application' });
            res.end(JSON.stringify({ message: 'Appointment booked successfully!!!' }))
          } else{
            res.writeHead(400, { 'Content-Type':'application' });
            res.end(JSON.stringify({ error: 'Doctor not found' }))
          }
        } catch (err) {
            res.writeHead(500, { 'Content-Type':'application' });
            res.end(JSON.stringify({ error: 'Booking failed', details: err.message  }))
        }
      })
    }
  }

  else {
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Route not found' }))
  }
})

Promise.all([connectToDB(), initDoctorDB()])
  .then(() => {
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
  })
  .catch(err => {
    console.error('❌ Failed to initialize DBs:', err)
  })
