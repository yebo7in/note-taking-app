const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const User = require('./models/User'); // Import your User model
const Note = require('./models/Note'); // Import the Note model
const bcrypt = require('bcrypt'); // For hashing passwords
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB using the MONGO_URI from .env
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.set('view engine', 'ejs'); // Using EJS for templating
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET, // Ensure this is in your .env file
    resave: false,
    saveUninitialized: true,
}));
app.use(flash());

// Flash messages middleware
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    next();
});

// Define routes here
app.get('/', (req, res) => {
    res.render('index'); // Render index.ejs for the welcome page
});

// Registration Page
app.get('/register', (req, res) => {
    res.render('register'); // Render register.ejs
});

// Login Page
app.get('/login', (req, res) => {
    res.render('login'); // Render login.ejs
});

//Node Page
app.get('/notes', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login'); // Redirect to login if not authenticated
    }

    try {
        const { filter, startDate, endDate } = req.query; // Get filter and dates from query params
        let notes;

        // Build the query for notes based on the filters
        let query = { userId: req.session.userId };

        if (filter === 'starred') {
            query.isStarred = true;
        } else if (filter === 'pinned') {
            query.isPinned = true;
        }

        // Add date filtering
        if (startDate || endDate) {
            query.createdAt = {}; // Create a new object for createdAt filtering
            
            // Log incoming date values for debugging
            console.log("Incoming Dates: ", { startDate, endDate });

            if (startDate) {
                query.createdAt.$gte = new Date(startDate); // Greater than or equal to start date
            }
            if (endDate) {
                const endDateObject = new Date(endDate);
                // Check the end date before modifying it
                console.log("Original End Date: ", endDateObject);

                // Set end date to the end of the day
                endDateObject.setHours(23, 59, 59, 999); 
                console.log("Adjusted End Date: ", endDateObject);

                query.createdAt.$lte = endDateObject; // Less than or equal to end date
            }
        }

        // Log the query to check its structure
        console.log("Query being used:", query);

        notes = await Note.find(query); // Fetch notes based on the constructed query
        res.render('notes', { notes }); // Pass notes to the view
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.render('notes', { notes: [] }); // If error, render with an empty array
    }
});

// Handle Registration
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
        });
        await newUser.save();
        req.flash('success_msg', 'You are now registered!');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error in registration');
        res.redirect('/register');
    }
});

// Handle Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/login');
        }
        req.session.userId = user._id;
        req.flash('success_msg', 'You are now logged in!');
        res.redirect('/notes');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error logging in');
        res.redirect('/login');
    }
});

// Add Note Route
app.post('/add-note', async (req, res) => {
    const { title, content } = req.body;
    const note = new Note({
        userId: req.session.userId, // Use session user ID
        title: title,
        content: content, // Save raw HTML content
    });

    try {
        await note.save();
        res.redirect('/notes');
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).send('Error saving note');
    }
});

// Route to delete a note
app.post('/delete-note/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    
    try {
        await Note.findByIdAndDelete(req.params.id); // Delete note by ID
        req.flash('success_msg', 'Note deleted successfully!');
        res.redirect('/notes');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error deleting note');
        res.redirect('/notes');
    }
});

// Edit Note Route
app.get('/edit-note/:id', async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);
        if (!note) {
            return res.status(404).send('Note not found');
        }
        res.render('edit-note', { note }); // Pass the note to the view
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).send('Server error');
    }
});

// Route to update a note
app.post('/update-note/:id', async (req, res) => {
    const { title, content } = req.body;
    try {
        await Note.findByIdAndUpdate(req.params.id, {
            title: title,
            content: content, // Raw HTML content
        });
        res.redirect('/notes');
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send('Error updating note');
    }
});

// Star/Unstar Note Route
app.post('/toggle-star/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    
    try {
        const note = await Note.findById(req.params.id);
        note.isStarred = !note.isStarred; // Toggle star status
        await note.save();
        req.flash('success_msg', `Note ${note.isStarred ? 'starred' : 'unstarred'}!`);
        res.redirect('/notes');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating star status');
        res.redirect('/notes');
    }
});

// Pin/Unpin Note Route
app.post('/toggle-pin/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const note = await Note.findById(req.params.id);
        note.isPinned = !note.isPinned; // Toggle pinned status
        await note.save();
        req.flash('success_msg', `Note ${note.isPinned ? 'pinned' : 'unpinned'}!`);
        res.redirect('/notes');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error updating pin status');
        res.redirect('/notes');
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/notes');
        }
        req.flash('success_msg', 'You have logged out successfully!');
        res.redirect('/login');
    });
});

// Search Notes Route
app.get('/search-notes', async (req, res) => {
    const { query } = req.query; // Get search query
    try {
        const notes = await Note.find({
            userId: req.session.userId,
            $or: [{ title: new RegExp(query, 'i') }, { content: new RegExp(query, 'i') }],
        });
        res.render('notes', { notes });
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error searching notes');
        res.redirect('/notes');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});