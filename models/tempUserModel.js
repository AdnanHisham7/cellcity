const mongoose = require('mongoose');

const tempUserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    referralCode: { type: String, unique: true },

});

const TempUser = mongoose.model('TempUser', tempUserSchema);

module.exports = TempUser;
