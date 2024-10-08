const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    percentage: { type: Number, required: true },
    minAmount: { type: Number, required: true },
    expirationDate: { type: Date, required: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // New field for user references
    status: { type: String, default: "active" }
}, {
    timestamps: true
});


couponSchema.pre('save', function(next) {
    this.code = this.code.toUpperCase();  
    next();
});

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
