import http from 'node:http'
import { connectToDB, getDB } from './db.js'
import dotenv from 'dotenv'
import nodemailer from 'nodemailer'

dotenv.config()

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
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

  if (req.url === '/signup' && req.method === 'POST') {
    const { name, email, password, confirm } = await parseBody()
    if (!name || !email || !password || password !== confirm) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Invalid input' }))
    } else {
      const existing = await usersCollection.findOne({ email })
      if (existing) {
        res.writeHead(409)
        res.end(JSON.stringify({ error: 'User already exists' }))
      } else {
        await usersCollection.insertOne({ name, email, password })
        res.writeHead(200)
        res.end(JSON.stringify({ message: 'Signup successful', redirect: '/home' }))
      }
    }
  } else if (req.url === '/login' && req.method === 'POST') {
    const { email, password } = await parseBody()
    const user = await usersCollection.findOne({ email, password })

    if (!user) {
      res.writeHead(401)
      res.end(JSON.stringify({ error: 'Invalid credentials' }))
    } else {
      res.writeHead(200)
      res.end(JSON.stringify({ message: 'Login successful', name: user.name, redirect: 'landing-page' }))
    }
  } else if (req.url === '/send-otp' && req.method === 'POST') {
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
  } else if (req.url === '/verify-otp' && req.method === 'POST') {
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
  } else if (req.url === '/reset-password' && req.method === 'POST') {
    const { email, password, confirm } = await parseBody()
    if (password !== confirm) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'Passwords do not match' }))
    } else {
      const updated = await usersCollection.updateOne({ email }, { $set: { password } })
      if (updated.matchedCount === 0) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'User not found' }))
      } else {
        res.writeHead(200)
        res.end(JSON.stringify({ message: 'Password reset successful' }))
      }
    }
  } else if (req.url === '/users' && req.method === 'GET') {
    const users = await usersCollection.find().toArray()
    res.writeHead(200)
    res.end(JSON.stringify(users))
  } else {
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Route not found' }))
  }
})

connectToDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
})


































































// // server.js
// import http from 'node:http'
// import fs from 'node:fs'
// import path from 'node:path'
// import nodemailer from 'nodemailer'
// import { connectToDB, getDB } from './db.js'
// import dotenv from 'dotenv'

// dotenv.config()

// const PORT = 5223
// const usersPath = path.resolve('./users.json')
// const otpsPath = path.resolve('./otps.json')

// // Helper to send email
// async function sendOTPEmail(email, otp) {
//   let transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//       user: process.env.EMAIL,
//       pass: process.env.EMAIL_PASS
//     }
//   })

//   const mailOptions = {
//     from: process.env.EMAIL,
//     to: email,
//     subject: 'Your FOODMED OTP Code',
//     text: `Your OTP code is ${otp}`
//   }

//   return transporter.sendMail(mailOptions)
// }

// const server = http.createServer((req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

//   // if (req.method === 'OPTIONS') {
//   //   res.writeHead(204)
//   //   res.end()
//   //   return
//   // }
  //   if (req.method === 'OPTIONS') {
  //   res.writeHead(204, {
  //     'Access-Control-Allow-Origin': '*',
  //     'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
  //     'Access-Control-Allow-Headers': 'Content-Type'
  //   });
  //   return res.end();
  // }

//   // Sign Up
// if (req.url === '/signup' && req.method === 'POST') {
//   let body = ''
//   req.on('data', chunk => (body += chunk.toString()))
//   req.on('end', () => {
//     try {
//       const { name, email, password, confirm } = JSON.parse(body)
//       console.log('📨 New signup request received:')
//       console.log('➡️ Name:', name)
//       console.log('➡️ Email:', email)

//       if (!name || !email || !password || password !== confirm) {
//         throw new Error('Invalid sign up details')
//       }

//       // const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]')
//       // if (users.some(u => u.email === email)) {
//       //   console.log('⚠️ Email already exists:', email)
//       //   res.writeHead(409, { 'Content-Type': 'application/json' })
//       //   return res.end(JSON.stringify({ error: 'User already exists' }))
//       // }
//       const db = getDB()
//         const usersCollection = db.collection('users')
//         const existingUser = await usersCollection.findOne({ email })

//         if (existingUser) {
//           res.writeHead(409, { 'Content-Type': 'application/json' })
//           return res.end(JSON.stringify({ error: 'User already exists' }))
//         }

//         await usersCollection.insertOne({ name, email, password })


//       users.push({ name, email, password })
//       fs.writeFileSync(usersPath, JSON.stringify(users, null, 2))
//       console.log('✅ User added:', { name, email })

//       res.writeHead(200, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify({ message: 'Signup successful', redirect: '/home' }))
//     } catch (err) {
//       console.log('❌ Signup error:', err.message)
//       res.writeHead(400, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify({ error: err.message }))
//     }
//   })
// }


//   // Login
//   else if (req.url === '/login' && req.method === 'POST') {
//     let body = ''
//     req.on('data', chunk => (body += chunk.toString()))
//     req.on('end', () => {
//       try {
//         const { email, password } = JSON.parse(body)
//         const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]')
//         const user = users.find(u => u.email === email && u.password === password)

//         if (!user) throw new Error('Invalid credentials')

//         res.writeHead(200, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ message: 'Login successful', name: user.name, redirect: 'landing-page' }))
//       } catch (err) {
//         res.writeHead(401, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ error: err.message }))
//       }
//     })
//   }
//    //GET users information
//     else if (req.url === '/users' && req.method === 'GET') {
//         try {
//           const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]')
//           res.writeHead(200, { 'Content-Type': 'application/json' })
//           res.end(JSON.stringify(users))
//         } catch (err) {
//           res.writeHead(500, { 'Content-Type': 'application/json' })
//           res.end(JSON.stringify({ error: 'Failed to read users file' }))
//         }
//       }

//   // Send OTP
//   else if (req.url === '/send-otp' && req.method === 'POST') {
//     let body = ''
//     req.on('data', chunk => (body += chunk.toString()))
//     req.on('end', async () => {
//       try {
//         const { email } = JSON.parse(body)
//         if (!email) throw new Error('Email required')

//         const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]')
//         if (!users.find(u => u.email === email)) throw new Error('User not found')

//         const otp = Math.floor(100000 + Math.random() * 900000).toString()
//         const otps = JSON.parse(fs.readFileSync(otpsPath, 'utf8') || '{}')
//         otps[email] = { otp, createdAt: Date.now() }

//         fs.writeFileSync(otpsPath, JSON.stringify(otps, null, 2))
//         await sendOTPEmail(email, otp)

//         res.writeHead(200, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ message: 'An OTP has been sent to your email' }))
//       } catch (err) {
//         res.writeHead(400, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ error: err.message }))
//       }
//     })
//   }

//   // Verify OTP
//  else if (req.url === '/verify-otp' && req.method === 'POST') {
//   let body = ''
//   req.on('data', chunk => (body += chunk.toString()))
//   req.on('end', () => {
//     try {
//       const { email, otp } = JSON.parse(body)
//       const otps = JSON.parse(fs.readFileSync(otpsPath, 'utf8') || '{}')

//       console.log('🔐 Incoming email:', email)
//       console.log('🔐 Incoming OTP:', otp)

//       if (!otps[email]) {
//         console.log('❌ No OTP record found for email:', email)
//         throw new Error('Invalid OTP')
//       }

//       console.log('📦 Stored OTP:', otps[email].otp)

//       const normalizedOTP = otp.trim()
//       if (otps[email].otp !== normalizedOTP) {
//         console.log('❌ OTP mismatch — stored:', otps[email].otp, ' vs entered:', normalizedOTP)
//         throw new Error('Invalid OTP')
//       }

//       // Optional: Check for OTP expiry (5 min)
//       const now = Date.now()
//       const MAX_AGE = 5 * 60 * 1000
//       if (now - otps[email].createdAt > MAX_AGE) {
//         throw new Error('OTP expired')
//       }

//       console.log('✅ OTP verified successfully for', email)

//       res.writeHead(200, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify({ message: 'OTP verified' }))
//     } catch (err) {
//       console.log('🚨 Error in OTP verification:', err.message)
//       res.writeHead(400, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify({ error: err.message }))
//     }
//   })
// }


//   // Reset Password
//   else if (req.url === '/reset-password' && req.method === 'POST') {
//     let body = ''
//     req.on('data', chunk => (body += chunk.toString()))
//     req.on('end', () => {
//       try {
//         const { email, password, confirm } = JSON.parse(body)
//         if (password !== confirm) throw new Error('Passwords do not match')

//         const users = JSON.parse(fs.readFileSync(usersPath, 'utf8') || '[]')
//         const index = users.findIndex(u => u.email === email)
//         if (index === -1) throw new Error('User not found')

//         users[index].password = password
//         fs.writeFileSync(usersPath, JSON.stringify(users, null, 2))

//         res.writeHead(200, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ message: 'Password reset successful' }))
//       } catch (err) {
//         res.writeHead(400, { 'Content-Type': 'application/json' })
//         res.end(JSON.stringify({ error: err.message }))
//       }
//     })
//   }

//   // Default
//   else {
//     res.writeHead(404, { 'Content-Type': 'application/json' })
//     res.end(JSON.stringify({ error: 'Route not found' }))
//   }
// })


// connectToDB().then(() => {
//   server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
// })

// // server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
