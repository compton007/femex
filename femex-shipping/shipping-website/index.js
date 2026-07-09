const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// In-memory simulation (replace with MongoDB in production)
let shipments = [
  { id: 'CS123456', userId: 'user1', status: 'In Transit', location: 'Chicago Warehouse', progress: 60, details: { sender: 'Chicago', receiver: 'NY' } }
];
let users = [{ id: 'user1', email: 'demo@chicagoship.com', password: '$2b$10$demoHash' }]; // Hashed in real

const JWT_SECRET = 'your-super-secret-jwt-key-change-in-prod';

// Middleware for auth
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.cookies?.token;
  if (!token) return res.status(401).send('Access Denied');
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).send('Invalid Token');
  }
};

// Routes
app.get('/', (req, res) => res.render('index'));

app.get('/track', (req, res) => res.render('track', { shipment: null }));

app.post('/track', (req, res) => {
  const { trackingId } = req.body;
  const shipment = shipments.find(s => s.id === trackingId);
  res.render('track', { shipment: shipment || null });
});

app.get('/book', (req, res) => res.render('book'));

app.post('/book', (req, res) => {
  const newShipment = {
    id: 'CS' + Math.floor(100000 + Math.random() * 900000),
    userId: req.body.userId || 'demo',
    ...req.body,
    status: 'Booked',
    progress: 20,
    createdAt: new Date()
  };
  shipments.push(newShipment);
  // TODO: Send email/SMS notification
  res.send(`<h3>Shipment Booked Successfully! Tracking ID: ${newShipment.id}</h3><a href="/track">Track Now</a>`);
});

// User Routes
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  users.push({ id: Date.now().toString(), email, password: hashed });
  res.send('Registered! <a href="/login">Login</a>');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.cookie('token', token); // Or send in response for API
    res.redirect('/dashboard');
  } else {
    res.send('Invalid credentials');
  }
});

app.get('/dashboard', authenticateToken, (req, res) => {
  const userShipments = shipments.filter(s => s.userId === req.user.id);
  res.render('dashboard', { shipments: userShipments });
});

app.get('/admin', (req, res) => { // Add auth later
  res.render('admin', { shipments });
});

app.post('/admin/update', (req, res) => {
  const { id, status, progress } = req.body;
  const shipment = shipments.find(s => s.id === id);
  if (shipment) {
    shipment.status = status;
    shipment.progress = parseInt(progress);
    // TODO: Real-time Socket.io broadcast
    res.send('Updated');
  }
});

app.post('/admin/delete', (req, res) => {
  shipments = shipments.filter(s => s.id !== req.body.id);
  res.send('Deleted');
});

// API Endpoints
app.get('/api/shipments', (req, res) => res.json(shipments));
app.post('/api/book', (req, res) => {
  // Same as book route
  res.json({ success: true, trackingId: 'CSNEW123' });
});

// TODO: Stripe Payment, Socket.io, Nodemailer, PDFKit integration
// Example Stripe: const stripe = require('stripe')('sk_test_...');

console.log(`🚀 ChicagoShip running on http://localhost:${port}`);
app.listen(port);
