const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const PDFDocument = require('pdfkit');
const stripe = require('stripe')('sk_test_YOUR_KEY_HERE'); // Replace with real key

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const JWT_SECRET = process.env.JWT_SECRET || 'femex-super-secret-2026';

// In-memory data (MongoDB ready)
let shipments = [];
let users = [];

// Socket.io for live tracking
io.on('connection', (socket) => {
  console.log('User connected for live tracking');
  socket.on('track', (trackingId) => {
    const shipment = shipments.find(s => s.id === trackingId);
    if (shipment) socket.emit('update', shipment);
  });
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.redirect('/login');
  }
};

// Routes (Femex branding)
app.get('/', (req, res) => res.render('index', { title: 'Femex - Premium Shipping' }));

app.get('/track', (req, res) => res.render('track', { shipment: null }));

app.post('/track', (req, res) => {
  const shipment = shipments.find(s => s.id === req.body.trackingId);
  res.render('track', { shipment });
});

app.get('/book', authenticateToken, (req, res) => res.render('book'));

app.post('/book', authenticateToken, async (req, res) => {
  const newShipment = {
    id: 'FMX' + Math.floor(100000 + Math.random() * 900000),
    userId: req.user.id,
    ...req.body,
    status: 'Booked',
    progress: 20,
    createdAt: new Date()
  };
  shipments.push(newShipment);
  io.emit('new-shipment', newShipment); // Live update
  res.send(`Shipment created! ID: ${newShipment.id}. <a href="/dashboard">View</a>`);
});

// Stripe Checkout
app.post('/create-checkout', authenticateToken, async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Shipping Fee' }, unit_amount: 2999 }, quantity: 1 }],
    mode: 'payment',
    success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.headers.origin}/book`,
  });
  res.json({ url: session.url });
});

// PDF Invoice
app.get('/invoice/:id', authenticateToken, (req, res) => {
  const shipment = shipments.find(s => s.id === req.params.id);
  if (!shipment) return res.send('Not found');
  
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
  doc.fontSize(25).text('Femex Invoice', 100, 80);
  doc.text(`Tracking: ${shipment.id}`);
  doc.text(`Status: ${shipment.status}`);
  doc.text(`Date: ${shipment.createdAt}`);
  doc.end();
});

// User Routes
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const hashed = await bcrypt.hash(req.body.password, 10);
  const user = { id: Date.now().toString(), email: req.body.email, password: hashed };
  users.push(user);
  res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const user = users.find(u => u.email === req.body.email);
  if (user && await bcrypt.compare(req.body.password, user.password)) {
    const token = jwt.sign({ id: user.id }, JWT_SECRET);
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dashboard');
  } else res.send('Invalid login');
});

app.get('/dashboard', authenticateToken, (req, res) => {
  const userShipments = shipments.filter(s => s.userId === req.user.id);
  res.render('dashboard', { shipments: userShipments });
});

app.get('/profile', authenticateToken, (req, res) => res.render('profile', { user: req.user }));

app.get('/reports', authenticateToken, (req, res) => {
  res.render('reports', { shipments });
});

app.get('/admin', authenticateToken, (req, res) => res.render('admin', { shipments })); // Add role check in prod

// Admin actions
app.post('/admin/update', (req, res) => {
  const sh = shipments.find(s => s.id === req.body.id);
  if (sh) {
    sh.status = req.body.status;
    sh.progress = parseInt(req.body.progress);
    io.emit('update', sh);
  }
  res.redirect('/admin');
});

app.post('/admin/delete', (req, res) => {
  shipments = shipments.filter(s => s.id !== req.body.id);
  res.redirect('/admin');
});

app.get('/success', (req, res) => res.send('<h1>Payment Successful! Thank you for choosing Femex.</h1>'));

server.listen(port, () => console.log(`🚀 Femex Shipping live on http://localhost:${port}`));
