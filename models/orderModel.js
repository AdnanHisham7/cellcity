const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // Importing the UUID generator

const addressSchema = new mongoose.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    zip: { type: String, required: true }
}, { _id: false }); // _id: false to avoid creating an additional ID for each address subdocument

const orderSchema = new mongoose.Schema({
    orderId: { type: String, default: uuidv4, unique: true }, // New UUID field for the orderId
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
    items: [{
        variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant', required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required:true },
        priceAfterDiscount: { type: Number },
    }],
    totalAmount: { type: Number, required: true },
    amountAfterDiscount: { type: Number },
    shippingAddress: { type: addressSchema, required: true },
    deliveryCharge: { type: Number },
    paymentMethod: { type: String, required: true },
    paymentStatusFailed: { type: Boolean, default: false },
    coupon: {
        code: String,
        percentage: Number
    },
    status: { type: String, enum: ['Pending', 'Confirmed', 'Returned', 'Delivered', 'Cancelled', 'Failed'], default: 'Pending' },
}, { timestamps: true });

// Update `updatedAt` field before saving
orderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
