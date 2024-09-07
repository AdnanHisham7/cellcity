const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  author: { type: String, default: "Adnan" },
  rating: { type: Number, min: 0, max: 5, default: 4 },
  comment: { type: String, default: "Nice Smartphone" },
  createdAt: { type: Date, default: Date.now }
}, { _id: false }); // _id: false if embedding in product schema


const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  brand: { type: String, required: true },
  description: { type: String, default: '' },
  highlights: { type: String, default: '' },
  batteryCapacity: { type: String, required: true }, 
  display: { type: String, required: true }, 
  processor: { type: String, required: true }, 
  rating: { type: Number, default: 0 },
  reviews: [reviewSchema], // Embedding reviews directly
  status: { type: String, default: "active" },
  variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Variant' }], 
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update `updatedAt` field before saving
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Products = mongoose.model('Product', productSchema);

module.exports = Products;






// const productSchema = new mongoose.Schema({
//   productName: { type: String, required: true },
//   brand: { type: String, required: true },
//   description: { type: String, default: '' },
//   highlights: { type: String, default: '' },
//   productImages: [{ type: String, required: true }], // General images for the product
//   batteryCapacity: { type: String, required: true }, // e.g., 4000mAh
//   displaySize: { type: String, required: true }, // e.g., 6.1 inches, 6.5 inches
//   processor: { type: String, required: true }, // e.g., Snapdragon 888
//   rating: { type: Number, default: 0 },
//   reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }],
//   status: { type: String, default: 'Available' },
//   variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Variant' }], // Reference to the Variant schema
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });



// const mongoose = require('mongoose');

// const variantSchema = new mongoose.Schema({
//   productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//   color: { type: String, required: true }, // e.g., Black, White
//   storage: { type: String, required: true }, // e.g., 64GB, 128GB, 256GB
//   RAM: { type: String, required: true }, // e.g., 4GB, 6GB, 8GB
//   price: { type: Number, required: true },
//   discount: { type: Number, default: 0 },
//   stocks: { type: Number, required: true },
//   variantImages: [{ type: String, required: true }], // Images specific to this variant, such as color variants
//   status: { type: String, default: 'Available' },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Variant', variantSchema);




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
