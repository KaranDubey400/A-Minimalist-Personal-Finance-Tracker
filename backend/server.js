const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  console.log('Configured custom DNS resolvers (Google DNS: 8.8.8.8, 8.8.4.4)');
} catch (e) {
  console.warn('Could not set custom DNS servers, falling back to system defaults:', e);
}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({
  origin: '*', // Allow all origins during development; can restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection setup (Atlas remote database node)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phonepe-tracker';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connection established successfully.'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// API Routes
const authRoutes = require('./routes/auth');
const ledgerRoutes = require('./routes/ledger');
const authMiddleware = require('./middleware/auth');

app.use('/api/auth', authRoutes);
app.use('/api', authMiddleware, ledgerRoutes);

// Base / Health Route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error' 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
