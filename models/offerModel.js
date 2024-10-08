const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['product', 'brand', 'referral'],
        required: true
    },
    typeId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
