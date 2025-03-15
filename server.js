const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static('uploads'));

const port = 3002;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, JPG and PNG allowed.'));
        }
    }
});


// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

mongoose.connect('mongodb://localhost:27017/typeTillSunrise')
    .then(() => {
        console.log('Connected to MongoDB successfully');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });


// Registration Schema
const registrationSchema = new mongoose.Schema({
    name: String,
    email: String,
    mobile: String,
    gender: String,
    isLpu: Boolean,
    regNo: String,
    participationType: String,
    teamDetails: {
        teamName: String,
        members: [{
            name: String,
            mobile: String,
            regNo: String,
            gender: String
        }]
    },
    needAccommodation: String,
    photoUrl: String,
    paymentStatus: {
        type: String,
        default: 'pending'
    },
    registrationDate: {
        type: Date,
        default: Date.now
    }
});

const Registration = mongoose.model('Registration', registrationSchema);

app.post('/api/register', async (req, res) => {
    try {
        const registrationData = req.body;
        console.log('Received registration data:', registrationData);

        if (typeof registrationData.teamDetails === 'string') {
            registrationData.teamDetails = JSON.parse(registrationData.teamDetails);
        }

        registrationData.isLpu = registrationData.isLpu === true || registrationData.isLpu === 'true' || registrationData.isLpu === 'yes';

        const registration = new Registration(registrationData);
        await registration.save();

        console.log('Registration saved with ID:', registration._id);
        
        res.status(201).json({
            success: true,
            registrationId: registration._id
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const registrationId = req.body.registrationId;
        if (!registrationId) {
            throw new Error('No registration ID provided');
        }

        const photoUrl = `/uploads/${req.file.filename}`;
        
        const registration = await Registration.findByIdAndUpdate(
            registrationId,
            { photoUrl },
            { new: true }
        );

        if (!registration) {
            throw new Error('Registration not found');
        }

        res.json({
            success: true,
            photoUrl
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/registrations', async (req, res) => {
    try {
        const registrations = await Registration.find()
            .sort({ registrationDate: -1 }) // Sort by newest first
            .lean(); // Convert to plain JavaScript objects

        console.log(`Found ${registrations.length} registrations`);
        // Transform the data for admin portal
        const transformedRegistrations = registrations.map(reg => ({
            ...reg,
            registrationDate: new Date(reg.registrationDate).toLocaleString(),
            teamSize: reg.teamDetails ? reg.teamDetails.members.length + 1 : 1
        }));
        res.json(transformedRegistrations);
    } catch (error) {
        console.error('Error fetching registrations:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please try a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});