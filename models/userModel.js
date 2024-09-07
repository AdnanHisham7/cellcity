const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define an address schema
const addressSchema = new mongoose.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    phoneNumber: { type: String },
    zip: { type: String, required: true },
    label: { type: String, unique:true }  // e.g., "Home", "Office"
}, {
    timestamps: true
});

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: false,  // Not required for users signing up manually
    },
    name: { type: String, required: false },
    username: { type: String, required: true },
    email: { type: String, required: true },
    password: {
        type: String, required: function () {
            return !this.googleId;  // Password required only if not a Google user
        }
    },
    phoneNumber : { type: Number, required:false},
    addresses: [addressSchema],  // Array of address objects
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    status: { type: String, default: "active" },
    isAdmin: { type: Boolean, default: false },
}, {
    timestamps: true
});

// Password hashing before saving the user
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Match password method
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('users', userSchema);

module.exports = User;