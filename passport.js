const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('./models/userModel'); // Import your User model

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback",
    scope: ['profile', 'email'],
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
            return done(null, user);
        } else {
            const referralCode = generateReferralCode();

            user = new User({
                googleId: profile.id,
                username: profile.displayName, // Use email username as username
                email: profile.emails[0].value,
                avatar: profile.photos[0].value,
                referralCode
            });

            await user.save();
            return done(null, user);
        }
    } catch (err) {
        return done(err, null);
    }
}));


const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();  // Generates an 8-character random string
};


passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});