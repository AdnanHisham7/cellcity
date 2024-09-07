 const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    brandName: { type: String, required: true , unique:true},
    status: { type: String, default: "active" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Brands = mongoose.model('Brands', brandSchema);

module.exports = Brands; 