const mongoose = require('mongoose');

const userOTPVerificationSchema = new mongoose.Schema({
    userId: String,
    otp: String,
    createdAt: Date,
    expiresAt: Date,
});


const userOTPVerification = mongoose.model(
    "userOTPVerification",
    userOTPVerificationSchema
)

module.exports = userOTPVerification;
