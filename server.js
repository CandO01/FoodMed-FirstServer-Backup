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
        const { name, email, password, confirm, phone, canDonate, canRequest } = await parseBody();

        if (!name || !email || !password || password !== confirm ||!phone || (canDonate === undefined) || (canRequest === undefined)) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid input' }));
          return;
        }

        const existing = await usersCollection.findOne({ email });
        if (existing) {
          res.writeHead(409);
          res.end(JSON.stringify({ error: 'User already exists' }));
          return;
        }

        const result  = await usersCollection.insertOne({
                      name,
                      phone,
                      email,
                      password,
                      confirm,
                      profileImage: '',
                      foodPreference: '',
                      bio: '',
                      location: '',  // add this
                      canDonate,
                      canRequest
                    });

        const newUser = {
          id: result.insertedId,
          name,
          phone,
          email,
          password,
          confirm,
          canDonate,
          canRequest
        };

        res.writeHead(200);
        res.end(JSON.stringify({
          message: 'Signup successful',
          user: newUser
        }));
      }

      //User profile upload
      else if (req.url === '/profile-setup' && req.method === 'POST') {
        const { email, profileImage, bio, location } = await parseBody();

        if (!email || !profileImage || !bio || !location) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        try {
          // 1. Upload image to Cloudinary
          const formData = new URLSearchParams();
          formData.append('file', profileImage); // base64 string from frontend
          formData.append('upload_preset', 'foodmed_unsigned');

          const cloudinaryRes = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
          });

          const cloudData = await cloudinaryRes.json();

          if (!cloudData.secure_url) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Image upload failed' }));
            return;
          }

          const imageUrl = cloudData.secure_url;

          // 2. Save to database
        const result = await usersCollection.updateOne(
          { email: email }, 
          { $set: { profileImage: imageUrl, bio, location } }
        );


          if (result.modifiedCount === 1) {
            res.writeHead(200);
            res.end(JSON.stringify({
              message: 'Profile updated successfully',
              profileImage: imageUrl,
              bio
            }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'User not found or no update made' }));
          }
        } catch (err) {
          console.error(err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }

        // Get a single user's profile by email
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


  // -- LOGIN SECTION--
      else if (req.url === '/login' && req.method === 'POST') {
      const { email, password } = await parseBody();
      const user = await usersCollection.findOne({ email, password });

      if (!user) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({
          message: 'You have logged in successfully',
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          canDonate: user.canDonate,
          canRequest: user.canRequest,
          redirect: 'landing-page'
        }));
      }
    }

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

