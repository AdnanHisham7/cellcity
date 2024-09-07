const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  color: { type: String, required: true }, 
  storage: { type: String, required: true }, 
  RAM: { type: String, required: true }, 
  price: { type: Number, required: true },
  stocks: { type: Number, required: true },
  variantImages: [{ type: String, required: false }], // Optional images
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






// To retrieve a product with all its variants, you would typically use a populate query:

// Product.findById(productId)
//   .populate('variants')
//   .exec((err, product) => {
//     if (err) return handleError(err);
//     console.log(product);
//   });



// const mongoose = require('mongoose');

// const reviewSchema = new mongoose.Schema({
//   productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//   variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant', required: false }, // Optional: If the review is specific to a variant
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the user who wrote the review
//   rating: { type: Number, required: true, min: 1, max: 5 }, // Rating out of 5
//   comment: { type: String, required: true }, // User's review text
//   title: { type: String, required: true }, // Title of the review
//   pros: { type: [String], required: false }, // List of pros
//   cons: { type: [String], required: false }, // List of cons
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Review', reviewSchema);



// Fetching Reviews for a Product:

// Product.findById(productId)
//   .populate('reviews')
//   .exec((err, product) => {
//     if (err) return handleError(err);
//     console.log(product.reviews);
//   });



// Fetching Reviews for a Variant:
// Variant.findById(variantId)
//   .populate('reviews')
//   .exec((err, variant) => {
//     if (err) return handleError(err);
//     console.log(variant.reviews);
//   });
