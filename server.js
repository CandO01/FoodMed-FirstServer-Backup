import http from 'node:http';
// import getPort from 'get-port';
import { ObjectId } from 'mongodb';
import { connectToDB, getDB } from './db.js';
import { 
  initDoctorDB, 
  createDoctor,
  getDoctorByEmail, 
  getDoctorCollection  
} from './doctorModel.js'
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


// const port = await getPort({ port: 5223 });

const PORT = 5228;

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5228';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

// Email Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASS
  }
});


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
      
      // 1️⃣  find a user
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
          image: imageUrl,
          overview: fields.overview?.toString()
        };
        
        // check if doctor already exists by email
        const existingDoctor = await getDoctorByEmail(doctorData.email);
        if(existingDoctor){
          res.writeHead(400, { 'Content-Type':'application/json' });
          res.end(JSON.stringify({ error: 'User already exists' }));
          return;
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
    try {
      const doctorsCollection = getDoctorCollection();
      const doctors = await doctorsCollection.find().toArray();
      
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify(doctors))
    } catch (err) {
      res.writeHead(500, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch doctors', details: err.message }))
    }
  }
  
  // ---------------- UPDATE DOCTOR ----------------
  else if (req.url.startsWith('/doctors/') && req.method === 'PATCH') {
    const parts = req.url.split('/'); 
    const id = parts[2];        // doctor id
    const action = parts[3];    // book
    
    if (action === 'book') {
      let body = ''
      req.on('data', chunk => (body += chunk.toString()))
      req.on('end', async () => {
        try {
          console.log('Booking doctor with ID:', id)
          const doctorsCollection = getDoctorCollection()
          console.log('Got doctorsCollection?', !!doctorsCollection);
          
          const result = await doctorsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { patientsCount: 1 } }
          );
          console.log('Update result:', result)
          
          if (result.modifiedCount > 0) {
            res.writeHead(200, { 'Content-Type':'application/json' });
            res.end(JSON.stringify({ message: 'Appointment booked successfully!!!' }))
          } else {
            res.writeHead(400, { 'Content-Type':'application/json' });
            res.end(JSON.stringify({ error: 'Doctor not found' }))
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type':'application/json' });
          res.end(JSON.stringify({ error: 'Booking failed', details: err.message  }))
        }
      })
    }
  }
  // -------PAYMENT TO BOOK APPOINTMENT---------
else if (req.url === '/pay' && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', async () => {
    try {
      const { email, amount, doctorId } = JSON.parse(body);

      if (!email || !amount || !doctorId) throw new Error('Missing payment info');

      const tx_ref = `foodmed-${Date.now()}` // unique reference
     
      const payload = {
        tx_ref,
        amount,
        currency: 'NGN',
        redirect_url: `${CLIENT_URL}/payment-success?doctorId=${doctorId}&email=${email}&tx_ref=${tx_ref}`,
        payment_options: 'card, mobilemoney, ussd',
        customer: { email },
        customizations: {
          title: 'FoodMed Appointment',
          description: 'Doctor Appointment Payment'
        }
      };

      const flwResponse = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        },
        body: JSON.stringify(payload)
      });

      const flwData = await flwResponse.json();

      // console.log('Flutterwave payment init response:', flwData);

      if (flwData.status === 'success') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          paymentLink: flwData.data.link, 
          tx_ref 
        }));
      } else {
        throw new Error(flwData.message || 'Payment initialization failed');
      }

    } catch (err) {
      console.error('Payment error:', err);
      res.writeHead(500, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ------- Payment Success (Auto Verify & Notify) --------
  else if (req.url.startsWith('/payment-success') && req.method === 'GET') {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  // const tx_ref = urlObj.searchParams.get('tx_ref');
  const transactionId = urlObj.searchParams.get('transaction_id'); // Flutterwave ID
  const doctorId = urlObj.searchParams.get('doctorId');
  const patientEmail = urlObj.searchParams.get('email');

  // console.log("Payment success hit");
  // console.log("Query params:", urlObj.searchParams.toString());

  try {
    if (!doctorId || !patientEmail) {
      throw new Error("Missing doctor or patient info");
    }

   
    if (!transactionId) {
        throw new Error("Missing transaction_id from Flutterwave redirect");
      }

      const verifyUrl = `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`;

      const verifyRes = await fetch(verifyUrl, {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` }
      });

    const verifyData = await verifyRes.json();

    // console.log("Verification response:", verifyData);

    if (!(verifyData.status === "success" && verifyData.data.status === "successful")) {
      throw new Error("Payment not successful");
    }

    // ✅ Payment confirmed
    const doctorsCollection = getDoctorCollection();
    const doctor = await doctorsCollection.findOne({ _id: new ObjectId(doctorId) });
    if (!doctor || !doctor.email) throw new Error("Doctor not found or missing email");

    // console.log("Doctor found:", doctor.email, doctor.name);

    // Update doctor patient count
    // await doctorsCollection.updateOne(
    //   { _id: new ObjectId(doctorId) },
    //   { $inc: { patientsCount: 1, stars: 1 } }
    // );
    // await doctorsCollection.updateOne(
    //     { _id: new ObjectId(doctorId) },
    //     [
    //       {
    //         $set: {
    //           patientsCount: { $add: ["$patientsCount", 1] },
    //           stars: {
    //             $cond: {
    //               if: { $lt: ["$stars", 5] }, // only increment if stars < 5
    //               then: { $add: ["$stars", 1] },
    //               else: "$stars"
    //             }
    //           }
    //         }
    //       }
    //     ]
    //   );

    // Update doctor patient count
    await doctorsCollection.updateOne(
      { _id: new ObjectId(doctorId) },
      { $inc: { patientsCount: 1 } }
    );

    // Recalculate stars based on patient count
    const doctors = await doctorsCollection.findOne({ _id: new ObjectId(doctorId) });
    const newStars = Math.min(Math.floor(doctors.patientsCount / 10), 5);

    await doctorsCollection.updateOne(
      { _id: new ObjectId(doctorId) },
      { $set: { stars: newStars } }
    )

    // console.log("Doctor patient count updated");

    // Email setup
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Email doctor
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: doctor.email,
      subject: "New Appointment Booked",
      text: `Hello ${doctor.name},\n\nA new appointment has been booked.\nPatient email: ${patientEmail}\nAmount Paid: ₦${verifyData.data.amount}\nTransaction Ref: ${verifyData.data.tx_ref}\n\nRegards,\nFoodMed`,
    });
    // console.log("Email sent to doctor");

    // Email patient
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: patientEmail,
      subject: "Appointment Confirmed - FoodMed",
      text: `Hello,\n\nYour appointment with ${doctor.name} has been successfully booked.\nAmount Paid: ₦${verifyData.data.amount}\nTransaction Ref: ${verifyData.data.tx_ref}\nStatus: Paid successfully\n\nThank you for using FoodMed.\n\nRegards,\nFoodMed Team`,
    });
    // console.log("Email sent to patient");

    // Redirect to frontend success page

    res.writeHead(302, {
      Location: `${BASE_URL}/payment-success?status=completed&tx_ref=${verifyData.data.tx_ref}&transaction_id=${verifyData.data.id}&doctorId=${doctorId}&email=${patientEmail}`,
    });
    res.end();
  } catch (err) {
    console.error("Payment handling error:", err);
    res.writeHead(302, {
      Location: `${BASE_URL}/payment-success?status=failed&doctorId=${doctorId}&email=${patientEmail}`,
    });
    res.end();
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
