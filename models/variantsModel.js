const mongoose = require('mongoose');


const reviewSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },  // Reference to user
  rating: { type: Number, min: 0, max: 5, default: 4 },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
})

const variantSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  color: { type: String, required: true }, 
  storage: { type: String, required: true }, 
  RAM: { type: String, required: true }, 
  price: { type: Number, required: true },
  stocks: { type: Number, required: true },
  variantImages: [{ type: String, required: false }], // Optional images
  reviews: [reviewSchema],
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update `updatedAt` field before saving
variantSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Variants = mongoose.model('Variant', variantSchema);

module.exports = Variants;