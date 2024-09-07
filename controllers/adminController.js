const User = require('../models/userModel');    
const Products = require('../models/productsModel');
const Brands = require('../models/brandsModel');
const Variants = require('../models/variantsModel');
const Order = require('../models/orderModel')
const userOTPVerification = require('../models/userOtpVerification');

const path = require('path')
const fs = require('fs')
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const nodemailer = require('nodemailer');

const adminAuth = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(req.body)
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
        console.error('Login error:', error);
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
        console.error(error);
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
        console.log(user)
        console.log(email)
        if (!user || user.email !== email) {
            return res.status(404).json({ error: 'User not found or email does not match' });
        }

        // Set the new password (assuming password hashing is done in a pre-save hook)
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
        const users = await User.find({});
        return res.render('admin/dashboard', { users, currentUrl: req.originalUrl });
    }
    res.render('admin/login', { error: null })
}


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
        if (req.user) {
            const products = await Products.find({})
            const brands = await Brands.find({})
            return res.render('admin/products', { products, brands, currentUrl: req.originalUrl })
        }
        res.redirect('/admin')

    } catch (error) {
        res.status(500).send('Server Error');
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

        // Create a new product
        const product = await Products.create({
            productName, brand, description, highlights, batteryCapacity, display, processor
        });

        // Redirect to the products page
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


const getProductDetails = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id);
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
        console.log('hey sinamika')
        const productId = req.params.id;
        const { productName, brand, description, highlights, batteryCapacity, display, processor } = req.body;

        // Find the product and update it
        const updatedProduct = await Products.findByIdAndUpdate(
            productId,
            { productName, brand, description, highlights, batteryCapacity, display, processor },  // Update fields
            { new: true }  // Return the updated document
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Product updated successfully!', product: updatedProduct });
    } catch (error) {
        console.error('Error updating product:', error);
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
            const product = await Products.findById(productId)
            const variants = await Variants.find({ productId });

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
        const { color, storage, RAM, price, stocks } = req.body;
        const variantImages = req.files.map(file => file.path);

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
        console.error('Error creating variant:', error);
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
        console.error('Error fetching details:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};


const updateVariantDetails = async (req, res) => {
    try {
        console.log(req.params)
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
        console.log(typeof price)

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
        console.error('Error updating variant:', error);
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
        console.error('Error uploading images:', err);
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
        console.error('Error changing image:', error);
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
        const { brandName } = req.body;
        console.log(`Received brand name: ${brandName}`); // Debugging log

        await Brands.create({ brandName });
        res.redirect('/admin/brands');
    } catch (error) {
        console.error('Error creating brand:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
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
        console.error('Error updating brand:', error);
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
            .populate('user', 'username email') // Populate user with username and email
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product', // Assuming the variant has a reference to a Product
                    select: 'productName brand' // Select specific fields from the Product
                }
            })
            .sort({ createdAt: -1 }); // Sort by creation date, newest first

        res.render('admin/adminOrderList', { orders, currentUrl: req.originalUrl });
    } catch (error) {
        console.error('Error fetching orders:', error); // Log the error
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
        console.error('Error fetching order details:', error); // Log the error
        res.status(500).json({ message: 'Error fetching order details', error: error.message || error });
    }
};

const updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    try {
        const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.redirect(`/admin/orders/${orderId}`);
    } catch (error) {
        res.status(500).json({ message: 'Error updating order status', error });
    }
};


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
};
