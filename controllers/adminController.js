const User = require('../models/userModel');
const Products = require('../models/productsModel');
const Coupon = require('../models/couponModel');
const Offer = require('../models/offerModel');
const Brands = require('../models/brandsModel');
const Variants = require('../models/variantsModel');
const Order = require('../models/orderModel')
const userOTPVerification = require('../models/userOtpVerification');
const { PDFDocument } = require('pdf-lib');
const path = require('path')
const fs = require('fs')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const nodemailer = require('nodemailer');
const { model, overwriteMiddlewareResult } = require('mongoose');

const adminAuth = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Find the admin user
        const admin = await User.findOne({ email });
        if (!admin) {
            return res.status(400).json({ error: 'No admin in the database' });
        }

        if (admin.isAdmin && (await admin.matchPassword(password))) {
            const token = jwt.sign({ id: admin._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true });
            res.json({ token });
        } else {
            res.status(400).json({ error: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};


const getAdminLoginPage = async (req, res) => {
    if (req.user) {
        return res.redirect('/admin')
    }
    res.render('admin/login', { error: null });
}

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
});

const sendForgotOTPVerificationEmail = async (_id, email, res) => {
    try {
        const otp = `${Math.floor(100000 + Math.random() * 900000)}`;

        const mailOptions = {
            from: `"CellCity" <${process.env.AUTH_EMAIL}>`,
            to: email,
            subject: "Hey Admin,",
            html: `<p>Enter <b>${otp}</b> in the browser to verify your email address and complete the process</p><p>This code <b>expires in 1 minute</b></p>`
        };

        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(otp, saltRounds);
        const newOTPVerification = new userOTPVerification({
            userId: _id,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
            email: email
        });

        await newOTPVerification.save();
        await transporter.sendMail(mailOptions);
        res.redirect(`/admin/forgotOTP?userId=${_id}&email=${email}`);


    } catch (error) {
        // Check if 'res' is valid and not undefined
        if (res && !res.headersSent) {
            res.render('admin/login', {
                error: error.message,
                data: {
                    userId: _id,
                    email,
                }
            });
        } else {
            console.error('Error sending OTP:', error.message);
        }
    }
};

const getForgotPage = async (req, res) => {
    res.render('admin/forgot', { error: null });

};

const sendForgotOTP = async (req, res) => {
    const { email } = req.body;
    console.log('Initiating forgot OTP process for:', email); // Add this line
    const admin = await User.findOne({ email });

    if (!admin.isAdmin) {
        return res.render('admin/forgot', { error: 'authorization denied!' });
    }

    try {
        await sendForgotOTPVerificationEmail(user._id, email, res);

    } catch (error) {
        res.render('admin/forgot', { error: 'Server error' });
    }
};

const getForgotOTPPage = (req, res) => {
    console.log("Entering getForgotOTPPage"); // Add this line
    console.log("This is forgot OTP");
    const { userId, email } = req.query;
    console.log("Received userId:", userId, "and email:", email);
    if (!userId || !email) {
        return res.status(400).json({ error: 'Missing user ID or email' });
    }
    res.render('admin/forgotOTP', { userId, email, error: null });
};

const forgotVerifyOTP = async (req, res) => {
    try {
        let { userId, otp } = req.body;
        console.log('Verifying OTP for:', { userId, otp });

        // Ensure userId is treated as a string, not as an object
        userId = userId.toString();

        if (!userId || !otp) {
            throw new Error("Empty OTP details");
        }

        // Query with userId as a string
        const userOTPVerificationRecords = await userOTPVerification.find({ userId });
        console.log('Fetched OTP records:', userOTPVerificationRecords);

        if (userOTPVerificationRecords.length <= 0) {
            throw new Error("Account record doesn't exist or has been verified already");
        }

        userOTPVerificationRecords.sort((a, b) => b.createdAt - a.createdAt);
        const latestOTPRecord = userOTPVerificationRecords[0];
        const { expiresAt } = latestOTPRecord;
        const hashedOTP = latestOTPRecord.otp;
        const user = await User.findById(userId);
        const email = user.email
        console.log(`my email is ----------------------${email}`)

        if (expiresAt < Date.now()) {
            await userOTPVerification.deleteMany({ userId });
            throw new Error("Code has expired. Please request again");
        }

        console.log('Comparing OTP:', otp, 'with hash:', hashedOTP);
        const validOTP = await bcrypt.compare(otp, hashedOTP);

        if (!validOTP) {
            console.error('OTP comparison failed. Invalid code.');
            throw new Error("Invalid code passed. Check your inbox");
        }

        console.log('OTP is valid. Proceeding with password reset.');

        // Pass email in the redirect URL and ensure it is encoded
        res.redirect(`/admin/resetPassword?userId=${userId}&email=${encodeURIComponent(email)}`);

    } catch (error) {
        console.log(`Error message is ${error.message}`);
        const { userId } = req.body;

        // Query with userId as a string
        const userOTPVerificationRecords = await userOTPVerification.find({ userId: userId.toString() });
        const email = userOTPVerificationRecords.length > 0 ? userOTPVerificationRecords[0].email : '';
        res.render('admin/forgotOTP', { error: error.message, userId, email });
    }
};


const getResetPasswordPage = (req, res) => {
    try {
        const { userId, email } = req.query;
        console.log('Received userId:', userId, 'and email:', email); // Add this line
        if (!userId || !email) {
            return res.status(400).json({ error: 'Missing user ID or email' });
        }
        res.render('admin/resetPassword', { userId, email, error: null });
    } catch (error) {
        console.error('Error rendering reset password page:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const resetPassword = async (req, res) => {
    try {

        const { userId, email, password, cpassword } = req.body;

        // Check if userId, email, password, and confirmPassword are provided
        if (!password || !cpassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if password and confirmPassword match
        if (password !== cpassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        // Find the user by ID
        const user = await User.findById(userId);
        if (!user || user.email !== email) {
            return res.status(404).json({ error: 'User not found or email does not match' });
        }

        user.password = password;
        await user.save();

        res.redirect('/admin/login')

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const logout = (req, res) => {
    res.clearCookie('token', { httpOnly: true });
    res.redirect('/admin');
};

const getAdminPanel = async (req, res) => {
    if (req.user) {
        try {
            const users = await User.find({});
            const orders = await Order.find(); // Fetch all orders for the initial graph
            
            // Fetch the best-selling product and brand
            const bestProducts = await getBestSellingProduct();
            const bestBrands = await getBestSellingBrand();

            // Provide fallback if the arrays are empty
            const bestProductName = bestProducts.length ? bestProducts[0].productName : 'No product found';
            const bestBrandName = bestBrands.length ? bestBrands[0]._id : 'No brand found';

            // Render the admin dashboard with all the data
            return res.render('admin/dashboard', {
                users,
                orders,
                bestProducts,
                bestBrands,
                bestProductName,
                bestBrandName,
                currentUrl: req.originalUrl
            });
        } catch (error) {
            return res.status(500).render('admin/dashboard', {
                error: 'An error occurred while loading the admin panel',
                users: [],
                orders: [],
                bestProductName: 'N/A',
                bestBrandName: 'N/A'
            });
        }
    }
    res.render('admin/login', { error: null });
};




const getUsersPage = async (req, res) => {
    try {
        if (req.user) {
            const users = await User.find({});
            return res.render('admin/users', { users, currentUrl: req.originalUrl });
        }
        res.redirect('/admin')

    } catch (error) {
        res.status(500).send('Server Error');
    }
};

const getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const takeUserAction = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Toggle user status
        user.status = user.status === 'active' ? 'inactive' : 'active';
        await user.save();

        res.json({ status: user.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

const getProductsPage = async (req, res) => {
    try {
        
        if (!req.user) {
            return res.redirect('/admin');
        }
        
        
        // Fetch products sorted by last modified date (updatedAt)
        const products = await Products.find({}).populate('brandId').sort({ updatedAt: -1 });
        
        const brands = await Brands.find({});
        // Render the page
        return res.render('admin/products', { products, brands, currentUrl: req.originalUrl });
        
    } catch (error) {
        return res.status(500).send('Server Error');
    }
}


const addProducts = async (req, res) => {
    try {
        const { productName, brand, description, highlights, batteryCapacity, display, processor } = req.body;
        // Validation errors object
        let errors = {};

        // Validate input data
        if (!productName) errors.productName = 'Product Name is required';
        if (!brand) errors.brand = 'Brand is required';
        if (!batteryCapacity || isNaN(batteryCapacity) || Number(batteryCapacity) <= 0) {
            errors.batteryCapacity = 'Valid Battery Capacity in mAh is required';
        }
        if (!display || isNaN(display) || Number(display) <= 0) {
            errors.display = 'Valid Display Size in inches is required';
        }
        if (!processor) errors.processor = 'Processor is required';

        // Check if there are any errors
        if (Object.keys(errors).length > 0) {
            return res.status(400).json(errors);
        }

        const brandDocument = await Brands.findOne({ brandName: brand });
        // If no brand is found, return an error
        if (!brandDocument) {
            return res.status(400).json({ message: 'Brand not found' });
        }

        const product = await Products.create({
            productName,
            brandId: brandDocument._id, // Assign the ObjectId of the brand
            description,
            highlights,
            batteryCapacity,
            display,
            processor
        });

        // Redirect to the products page
        res.redirect('/admin/products');
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


const getProductDetails = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id).populate('brandId');
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const updateProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const { productName, brand, description, highlights, batteryCapacity, display, processor } = req.body;

        const brandDocument = await Brands.findOne({ brandName: brand });
        // If no brand is found, return an error
        if (!brandDocument) {
            return res.status(400).json({ message: 'Brand not found' });
        }


        // Find the product and update it
        const updatedProduct = await Products.findByIdAndUpdate(
            productId,
            { productName, brandId:brandDocument._id, description, highlights, batteryCapacity, display, processor },  // Update fields
            { new: true }  // Return the updated document
        );
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Product updated successfully!', product: updatedProduct });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const takeProductAction = async (req, res) => {
    try {
        const productId = req.params.productId;
        const product = await Products.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Toggle product status
        product.status = product.status === 'active' ? 'inactive' : 'active';
        await product.save();

        res.json({ status: product.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

const getVariantsPage = async (req, res) => {
    try {
        if (req.user) {
            const productId = req.params.productId;
            const product = await Products.findById(productId).populate('brandId')
            const variants = await Variants.find({ productId }).sort({ updatedAt: -1 });
            return res.render('admin/variants', { product, variants, currentUrl: req.originalUrl })
        }
        res.redirect('/admin')

    } catch (error) {
        res.status(500).send('Server Error');
    }
}

const addVariant = async (req, res) => {
    try {
        const productId = req.params.productId;
        let { color, storage, RAM, price, stocks } = req.body;
        const variantImages = req.files.map(file => file.path);

        // Helper function to capitalize the first letter of each word in a string
        const formatColor = (str) => {
            return str
                .toLowerCase()  // Convert entire string to lowercase first
                .split(' ')      // Split string into an array of words
                .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
                .join(' ');      // Join the array back into a string
        };

        // Apply color formatting
        if (color) {
            color = formatColor(color);
        }

        // Validation errors object
        let errors = {};

        // Validate input data
        if (!color) errors.color = 'Color is required';
        if (!storage) errors.storage = 'Storage is required';
        if (!RAM) errors.RAM = 'RAM is required';
        if (!price || isNaN(price) || Number(price) <= 0) errors.price = 'Valid Price is required';
        if (!stocks || isNaN(stocks) || Number(stocks) < 0) errors.stocks = 'Valid Stock quantity is required';
        if (variantImages.length === 0) errors.variantImages = 'At least one image is required';

        // Check if there are any errors
        if (Object.keys(errors).length > 0) {
            return res.status(400).json(errors);
        }

        // Create a new variant
        const variant = await Variants.create({ productId, color, storage, RAM, price, stocks, variantImages });

        // Update the product with the new variant
        await Products.findByIdAndUpdate(productId, { $push: { variants: variant._id } });

        // Redirect to the variants page for the product
        res.redirect(`/admin/products/${productId}/variants`);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};





const getVariantDetails = async (req, res) => {
    try {
        const { productId, variantId } = req.params;
        const product = await Products.findById(productId).lean(); // Fetch product details
        const variant = await Variants.findById(variantId).lean(); // Fetch variant details

        if (!product || !variant) {
            return res.status(404).json({ message: 'Product or variant not found' });
        }

        // Send both product and variant as JSON
        res.json({ product, variant });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};


const updateVariantDetails = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { color, storage, RAM, price, stocks } = req.body;

        if (!color || !storage || !RAM || !price || !stocks) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (typeof color !== 'string' || color.trim() === '') {
            return res.status(400).json({ message: 'Invalid color value' });
        }

        if (typeof storage !== 'string' || storage <= 0) {
            return res.status(400).json({ message: 'Storage must be a positive integer' });
        }

        if (typeof RAM !== 'string' || RAM <= 0) {
            return res.status(400).json({ message: 'RAM must be a positive integer' });
        }

        if (typeof price !== 'string' || price <= 0) {
            return res.status(400).json({ message: 'Price must be a positive number' });
        }

        if (typeof stocks !== 'string' || stocks < 0) {
            return res.status(400).json({ message: 'Stocks must be a non-negative integer' });
        }


        const updatedVariant = await Variants.findByIdAndUpdate(
            variantId,
            { color, storage, RAM, price, stocks, updatedAt: Date.now() },
            { new: true }
        );

        if (!updatedVariant) {
            return res.status(404).json({ message: 'Variant not found' });
        }

        res.json({ message: 'Variant updated successfully!', variant: updatedVariant });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const editVariantImages = async (req, res) => {
    try {
        const variant = await Variants.findById(req.params.id);

        if (!variant) {
            return res.status(404).json({ error: 'Variant not found.' });
        }

        if (req.files) {
            const existingImageCount = variant.variantImages.length;
            const remainingSlots = 3 - existingImageCount;

            if (req.files.length > remainingSlots) {
                return res.status(400).json({ error: `You can only upload ${remainingSlots} more image(s).` });
            }

            const newImagePaths = req.files.map(file => path.join('uploads', file.filename));
            variant.variantImages = [...variant.variantImages, ...newImagePaths];

            await variant.save();
            return res.json({ success: true });
        }

        res.status(400).json({ error: 'No files uploaded.' });
    } catch (err) {
        res.status(500).json({ error: 'Error uploading images' });
    }
};


const getEditImagesPage = async (req, res) => {
    try {
        const product = await Products.findById(req.params.productId)
        const variant = await Variants.findById(req.params.variantId);
        res.render('admin/edit-product-images', { variant, product });
    } catch (err) {
        res.status(500).send('Error fetching variant data');
    }
}

const changeVariantImage = async (req, res) => {
    try {
        const { variantId, productId } = req.params;
        const { oldImage } = req.body;
        const newImage = req.file.path;

        // 1. Delete the old image from the file system
        fs.unlink(path.join(__dirname, '..', oldImage), (err) => {
            if (err) {
                console.error('Error deleting the old image:', err);
            }
        });

        // 2. Update the product's image array in the database
        await Variants.updateOne(
            { _id: variantId },
            { $set: { "variantImages.$[elem]": newImage } },
            { arrayFilters: [{ "elem": oldImage }] }
        );

        res.redirect(`/admin/${productId}/edit-images/${variantId}`);
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
};

const deleteVariantImage = async (req, res) => {
    try {
        const { variantId, productId } = req.params;
        const variant = await Variants.findById(variantId);
        const imageToRemove = req.body.image;

        // Remove image path from variant images array
        variant.variantImages = variant.variantImages.filter(image => image !== imageToRemove);
        await variant.save();

        // Delete the image file from the server
        fs.unlink(path.join(__dirname, '..', 'uploads', path.basename(imageToRemove)), (err) => {
            if (err) {
                console.error('Error deleting image file:', err);
            }
        });

        res.redirect(`/admin/${productId}/edit-images/${variantId}`);
    } catch (err) {
        res.status(500).send('Error deleting image');
    }
}

const takeVariantAction = async (req, res) => {
    try {
        const variantId = req.params.variantId;
        const variant = await Variants.findById(variantId);

        if (!variant) {
            return res.status(404).json({ message: 'Variant not found' });
        }

        // Toggle variant status
        variant.status = variant.status === 'active' ? 'inactive' : 'active';
        await variant.save();

        res.json({ status: variant.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}



const getBrandsPage = async (req, res) => {
    try {
        if (req.user) {
            const brands = await Brands.find({})
            return res.render('admin/brands', { brands, currentUrl: req.originalUrl })
        }
        res.redirect('/admin')

    } catch (error) {
        res.status(500).send('Server Error');
    }
}

const addBrands = async (req, res) => {
    try {
        let { brandName } = req.body;
        // Validate the brand name
        if (!brandName || typeof brandName !== 'string') {
            return res.status(400).json({ message: 'Brand name is required and must be a string.' });
        }
        
        if (brandName.length < 2) {
            return res.status(400).json({ message: 'Brand name must be at least 2 characters long.' });
        }

        
        // Normalize the brand name
        brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1).toLowerCase();

        // Check for existing brand name (case-insensitive)
        const existingBrand = await Brands.findOne({ 
            brandName: brandName.trim()
        }).collation({ locale: 'en', strength: 2 });

        if (existingBrand) {
            return res.status(400).json({ message: 'Brand name already exists. Please choose a different name.' });
        }
        
        await Brands.create({ brandName: brandName.trim() });
        res.status(201).json({ message: 'Brand created successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Server error. Please try again later.' });
    }
};



const getBrandDetails = async (req, res) => {
    try {
        const brand = await Brands.findById(req.params.id);
        if (!brand) {
            return res.status(404).json({ error: 'brand not found' });
        }
        res.json(brand);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const updateBrandDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { brandName, updatedAt } = req.body;

        const updatedBrand = await Brands.findByIdAndUpdate(
            id,
            { brandName, updatedAt },
            { new: true, runValidators: true }
        );

        if (!updatedBrand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        res.status(200).json(updatedBrand);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update brand' });
    }
};

const takeBrandAction = async (req, res) => {
    try {
        const brandId = req.params.brandId;
        const brand = await Brands.findById(brandId);

        if (!brand) {
            return res.status(404).json({ message: 'brand not found' });
        }

        // Toggle product status
        brand.status = brand.status === 'active' ? 'inactive' : 'active';
        await brand.save();

        res.json({ status: brand.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

const listAdminOrders = async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate('user', 'username email')
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product',
                    select: 'productName brand'
                }
            })
            .sort({ createdAt: -1 }); 

        res.render('admin/adminOrderList', { orders, currentUrl: req.originalUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching orders', error: error.message || error });
    }
};

const getOrderDetails = async (req, res) => {


    try {
        const order = await Order.findById(req.params.orderId)
            .populate('user', 'username email') // Populate user details
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product',
                    select: 'productName brand'
                }
            });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.render('admin/adminOrderDetails', { order, currentUrl: req.originalUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order details', error: error.message || error });
    }
};

const updateOrderStatus = async (req, res) => {

    const { orderId } = req.params;
    const { status } = req.body;
    try {
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check the current status and enforce business rules
        if (order.status === 'Cancelled' || order.status === 'Delivered') {
            return res.status(400).json({ message: 'Cannot change status from ' + order.status });
        }

        // Proceed to update the status
        order.status = status;
        await order.save();

        res.redirect(`/admin/orders/${orderId}`);
    } catch (error) {
        res.status(500).json({ message: 'Error updating order status', error });
    }
};



// Get all coupons
const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find();
        if (!coupons || coupons.length === 0) {
            return res.render('admin/coupons', { coupons: [], noCoupons: true, currentUrl: req.originalUrl });
        }
        res.render('admin/coupons', { coupons, noCoupons: false, currentUrl: req.originalUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching coupons', error });
    }
};


// Add Coupon
const addCoupon = async (req, res) => {
    const { code, percentage, minAmount, expirationDate } = req.body;

    const errors = {};

    // Validate coupon data
    if (!code) errors.code = 'Coupon code is required';
    if (!percentage || percentage < 0 || percentage > 100) errors.percentage = 'Percentage should be between 0 and 100';
    if (!minAmount || minAmount <= 0) errors.minAmount = 'Max amount should be greater than 0';
    if (!expirationDate) {
        errors.expirationDate = 'Expiration date is required.';
    } else {
        const now = new Date();
        const expiration = new Date(expirationDate);
        if (expiration < now) {
            errors.expirationDate = 'Expiration date must be in the future.';
        }
    }

    // Return validation errors if any
    if (Object.keys(errors).length > 0) {
        return res.status(400).json(errors);
    }

    try {
        // Check if the coupon with the given code already exists
        const existingCoupon = await Coupon.findOne({ code });
        if (existingCoupon) {
            return res.status(400).json({ code: 'Coupon code already exists' });
        }

        // If coupon code is unique, proceed to create a new coupon
        const newCoupon = new Coupon({
            code,
            percentage: parseFloat(percentage),
            minAmount: parseFloat(minAmount),
            expirationDate
        });

        await newCoupon.save();
        res.redirect('/admin/coupons');
    } catch (error) {

        // Handle duplicate key error (E11000) or other errors
        if (error.code === 11000) {
            res.status(400).json({ code: 'Coupon code already exists' });
        } else {
            res.status(500).json({ general: 'Error creating coupon. Please try again later.' });
        }
    }
};







// Edit a coupon
const editCoupon = async (req, res) => {
    const { id: couponId } = req.params;
    const { code, percentage, expirationDate } = req.body;

    try {
        const coupon = await Coupon.findByIdAndUpdate(couponId, {
            code,
            percentage,
            expirationDate,
        });

        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        res.status(200).json({ message: 'Coupon updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating coupon', error });
    }
};


const takeCouponAction = async (req, res) => {
    try {
        const couponId = req.params.couponId;
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Toggle product status
        coupon.status = coupon.status === 'active' ? 'inactive' : 'active';
        await coupon.save();

        res.json({ status: coupon.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}


// Delete a coupon
const deleteCoupon = async (req, res) => {
    const { couponId } = req.params;

    try {
        await Coupon.findByIdAndDelete(couponId);
        res.redirect('/admin/coupons');
    } catch (error) {
        res.status(500).json({ message: 'Error deleting coupon', error });
    }
};

// Controller to get coupon details by ID
const getCouponDetails = async (req, res) => {
    try {
        const { id } = req.params; // Get coupon ID from URL params
        const coupon = await Coupon.findById(id); // Fetch the coupon from DB

        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        // Return the coupon details as JSON
        res.status(200).json(coupon);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching coupon details', error });
    }
};

// Controller to update coupon details by ID
const updateCouponDetails = async (req, res) => {
    try {
        const { id } = req.params; // Get coupon ID from URL params
        const { code, percentage, minAmount, expirationDate } = req.body; // Get updated coupon data from request body

        // Validate input data (this can also be done in the frontend as you have)
        if (!code || percentage < 0 || minAmount < 0 || !expirationDate) {
            return res.status(400).json({ message: 'Invalid data provided' });
        }

        // Find the coupon by ID and update it with new data
        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            {
                code,
                percentage,
                minAmount,
                expirationDate
            },
            { new: true, runValidators: true }
        );

        if (!updatedCoupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }

        // Send the updated coupon as the response
        res.status(200).json({ message: 'Coupon updated successfully', coupon: updatedCoupon });
    } catch (error) {
        res.status(500).json({ message: 'Error updating coupon', error });
    }
};

const getOffersPage = async (req, res) => {
    try {
        // Fetch product offers (variants)
        const variants = await Offer.find({ type: 'product' })
            .populate({
                path: 'typeId',
                model: 'Variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });

        // Fetch brand offers
        const brands = await Offer.find({ type: 'brand' })
            .populate({
                path: 'typeId',
                model: 'Brands'
            });

        res.render('admin/offers', { variants, brands, currentUrl: req.originalUrl });
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
};


const getProductOffersPage = async (req, res) => {
    try {
        const offers = await Offer.find({ type: 'product' }).select('typeId');
        const offerVariantIds = offers.map(offer => offer.typeId);
        const variants = await Variants.find({
            _id: { $nin: offerVariantIds }  // Exclude variants whose _id is in offerVariantIds
        }).populate('productId');
        res.render('admin/product-offers', { variants, currentUrl: req.originalUrl });
    } catch (err) {
        res.status(500).send(err);
    }
};


// Get Brand Offers Page
const getBrandOffersPage = async (req, res) => {
    try {
        const offers = await Offer.find({ type: 'brand' }).select('typeId');
        const offeredBrandIds = offers.map(offer => offer.typeId);
        const brands = await Brands.find({
            _id: { $nin: offeredBrandIds }  // Exclude brands whose _id is in offeredBrandIds
        });

        res.render('admin/brand-offers', { brands, currentUrl: req.originalUrl });
    } catch (err) {
        res.status(500).send(err);
    }
};

const addOffer = async (req, res) => {
    const { type, typeId, percentage } = req.body;

    try {
        const newOffer = new Offer({ type, typeId, percentage });
        await newOffer.save();
        res.status(201).json({ message: 'Offer added successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to add offer', error: err });
    }
};

const removeOffer = async (req, res) => {
    try {
        const { typeId, offerType } = req.body;

        const offer = await Offer.findOneAndDelete({ typeId, type: offerType });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found.' });
        }

        return res.json({ success: true, message: 'Offer removed successfully.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};




const generateReport = async (req, res) => {
    const { reportType, startDate, endDate } = req.body;

    let filter = {};

    // Filter logic based on report type
    switch (reportType) {
        case 'daily':
            filter = { createdAt: { $gte: new Date().setHours(0, 0, 0, 0) } };
            break;
        case 'weekly':
            filter = { createdAt: { $gte: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) } }; // Last 7 days
            break;
        case 'monthly':
            filter = { createdAt: { $gte: new Date(new Date().setDate(1)) } }; // From start of the month
            break;
        case 'yearly':
            filter = { createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } }; // From start of the year
            break;
        case 'custom':
            filter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
            break;
        default:
            return res.status(400).json({ message: 'Invalid report type' });
    }
    
    try {
        const orders = await Order.find(filter)
            .populate('user', 'username')
            .sort({ createdAt: -1 })
            .exec();

        res.json({ orders });
    } catch (error) {
        res.status(500).json({ message: 'Error generating report' });
    }
};

const getAllOrdersGraph = async (req, res) => {
    try {
        const orders = await Order.find();
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching orders' });
    }
}


const getOverallStats = async (req, res) => {
    try {
        // Total number of orders
        const salesCount = await Order.countDocuments();
        // Sum of total amounts from orders
        const totalOrderAmount = await Order.aggregate([
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);

        // Calculate total discount from used coupons
        const totalDiscount = await Order.aggregate([
            {
                $match: { 'coupon.percentage': { $exists: true, $ne: null } }
            },
            {
                $project: {
                    discountAmount: {
                        $multiply: ['$totalAmount', { $divide: ['$coupon.percentage', 100] }]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalDiscount: { $sum: '$discountAmount' }
                }
            }
        ]);



        res.json({
            salesCount,
            totalOrderAmount: totalOrderAmount[0]?.total || 0,
            totalDiscount: totalDiscount[0]?.totalDiscount || 0,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching overall stats', error });
    }
};

const getBestSellingProduct = async () => {
    try {
        const bestSellingProduct = await Order.aggregate([
            { $unwind: "$items" },  // Unwind the items array to process each variant separately
            {
                $lookup: {
                    from: 'variants',
                    localField: 'items.variant',
                    foreignField: '_id',
                    as: 'variantDetails'
                }
            },  // Join with the Variants collection
            { $unwind: "$variantDetails" },
            {
                $lookup: {
                    from: 'products',
                    localField: 'variantDetails.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },  // Join with the Products collection
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails._id",  // Group by product ID
                    productName: { $first: "$productDetails.productName" },  // Get the product name
                    totalSold: { $sum: "$items.quantity" }  // Sum up the quantities sold
                }
            },
            { $sort: { totalSold: -1 } },  // Sort by total sold in descending order
            { $limit: 10 }  // Get the top-selling product
        ]);

       return bestSellingProduct

    } catch (error) {
        console.error('Error fetching best-selling product:', error);
    }
};

const getBestSellingBrand = async () => {
    try {
        const bestSellingBrand = await Order.aggregate([
            { $unwind: "$items" },  // Unwind the items array to process each variant separately
            {
                $lookup: {
                    from: 'variants',
                    localField: 'items.variant',
                    foreignField: '_id',
                    as: 'variantDetails'
                }
            },
            { $unwind: "$variantDetails" },
            {
                $lookup: {
                    from: 'products',
                    localField: 'variantDetails.productId',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: "$productDetails" },
            {
                $lookup: {
                    from: 'brands',  // Make sure the collection name is correct
                    localField: 'productDetails.brandId',  // Use brandId for the lookup
                    foreignField: '_id',
                    as: 'brandDetails'
                }
            },
            { $unwind: "$brandDetails" }, // Unwind brand details to get the brand name
            {
                $group: {
                    _id: "$brandDetails.brandName",  // Group by brand name
                    totalSold: { $sum: "$items.quantity" }  // Sum up the quantities sold per brand
                }
            },
            { $sort: { totalSold: -1 } },  // Sort by total sold in descending order
            { $limit: 10 }  // Get the top-selling brands
        ]);

        return bestSellingBrand;
    } catch (error) {
        console.error('Error fetching best-selling brand:', error);
    }
};



const getBestAnalytics = async (req,res) => {
    if (req.user) {
        try {
            const users = await User.find({});
            const orders = await Order.find(); // Fetch all orders for the initial graph
            
            // Fetch the best-selling product and brand
            const bestProducts = await getBestSellingProduct();
            const bestBrands = await getBestSellingBrand();
            

            // Render the admin dashboard with all the data
            return res.render('admin/bestAnalytics', {
                users,
                orders,
                bestProducts,
                bestBrands,
                currentUrl: req.originalUrl
            });
        } catch (error) {
            return res.status(500).render('admin/dashboard', {
                error: 'An error occurred while loading the admin panel',
                users: [],
                orders: [],
                bestProductName: 'N/A',
                bestBrandName: 'N/A'
            });
        }
    }
    res.render('admin/login', { error: null });
}



module.exports = {
    adminAuth,
    logout,
    getAdminLoginPage,
    getForgotPage,
    resetPassword,
    getForgotOTPPage,
    sendForgotOTP,
    forgotVerifyOTP,
    getResetPasswordPage,
    getAdminPanel,
    getUsersPage,
    getUserDetails,
    takeUserAction,
    getProductsPage,
    addProducts,
    getProductDetails,
    updateProductDetails,
    takeProductAction,
    getVariantsPage,
    addVariant,
    getVariantDetails,
    updateVariantDetails,
    getEditImagesPage,
    editVariantImages,
    changeVariantImage,
    deleteVariantImage,
    takeVariantAction,
    getBrandsPage,
    addBrands,
    getBrandDetails,
    updateBrandDetails,
    takeBrandAction,
    listAdminOrders,
    getOrderDetails,
    updateOrderStatus,
    getAllCoupons,
    addCoupon,
    editCoupon,
    takeCouponAction,
    deleteCoupon,
    getCouponDetails,
    updateCouponDetails,
    addOffer,
    getProductOffersPage,
    getBrandOffersPage,
    getOffersPage,
    removeOffer,
    generateReport,
    getAllOrdersGraph,
    getOverallStats,
    getBestAnalytics,
    getBestSellingProduct
};
