const express = require('express');
const dotenv = require('dotenv');
const session = require('express-session')
const flash = require('connect-flash');
const cors = require('cors');
const connectDB = require('./config/db');
const nocache = require('nocache');
// const flash = require('connect-flash');
const cookieParser = require('cookie-parser'); // token cookie
// Import routes
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

dotenv.config();
connectDB();

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public')); // Static files directory
app.use(express.static('uploads')); // Static files directory
app.use(express.json()); // Middleware for JSON bodies
app.use(express.urlencoded({ extended: true })); // Middleware for URL-encoded bodies
app.use(cors()); // Enable CORS
app.use(nocache());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    // cookie: { secure: true }
  }))


// app.use(flash());
// app.use((req, res, next) => {
//       res.locals.error = req.flash('error');
//       next();
//   });


app.use(flash());
// Pass flash messages to views
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});



// Routes
app.use('/admin', adminRoutes);
app.use('/', userRoutes);


// Root route (optional)
app.get('/', (req, res) => {
    console.log('aaaaaaaaaaaaaa')
    res.send('API is running...');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
