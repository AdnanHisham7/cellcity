  const mongoose = require('mongoose');

  const productSchema = new mongoose.Schema({
    productName: { type: String, required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brands', required: true },
    description: { type: String, default: '' },
    highlights: { type: String, default: '' },
    batteryCapacity: { type: String, required: true }, 
    display: { type: String, required: true }, 
    processor: { type: String, required: true }, 
    rating: { type: Number, default: 0 },
    status: { type: String, default: "active" },
    variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Variant' }], 
  },{ timestamps: true });

  // Update `updatedAt` field before saving
  productSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
  });

  const Products = mongoose.model('Product', productSchema);

  module.exports = Products;
