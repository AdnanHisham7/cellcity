const User = require('../models/userModel');
const Products = require('../models/productsModel');
const Variants = require('../models/variantsModel');
const Offer = require('../models/offerModel');
const Brands = require('../models/brandsModel');
const Cart = require('../models/cartModel')
const Coupon = require('../models/couponModel')
const Order = require('../models/orderModel')
const userOTPVerification = require('../models/userOtpVerification');
const TempUser = require('../models/tempUserModel');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const path = require('path');
const Razorpay = require("razorpay");
const crypto = require('crypto');

const { validateName, validateEmail, validateStrongPassword, validatePhoneNumber, validateZipCode } = require('../public/js/validate');

const { getBestSellingProduct } = require('./adminController')

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const nodemailer = require('nodemailer');

const successGoogleLogin = (req, res) => {
    if (!req.user) {
        return res.redirect('/failure');
    }

    // Generate a JWT token for the authenticated user
    const token = jwt.sign(
        { id: req.user._id, role: "user" },
        process.env.JWT_SECRET, 
        { expiresIn: '1h' }
    );

    // Send the token back to the client
    res.cookie('token', token, { httpOnly: true }); // Secure: true in production with HTTPS
    res.redirect('/');
};

const failureGoogleLogin = (req, res) => {
    res.send("Error");
};


const registerUser = async (req, res) => {
    const { email, username, password, cpassword, referralCode } = req.body;

    // Check if all required fields are present and not empty
    if (!username || !email || !password || !cpassword) {
        return res.render('user/signup', { error: 'All fields are required.' });
    }

    // Validate username
    const usernameValidation = validateName(username);
    if (!usernameValidation.valid) {
        return res.render('user/signup', { error: usernameValidation.message });
    }

    //validate Email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return res.render('user/signup', { error: emailValidation.message });
    }

    // Validate password
    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
        return res.render('user/signup', { error: passwordValidation.message });
    }

    // Check if passwords match
    if (password !== cpassword) {
        return res.render('user/signup', { error: 'Passwords should match' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email }) || await TempUser.findOne({ email });
    if (userExists) {
        return res.render('user/signup', { error: 'User already exists' });
    }

    try {
        //creating temorary user and sending an OTP

        const tempUser = await TempUser.create({ username, email, password, referralCode });
        await sendOTPVerificationEmail(tempUser._id, email, res);
    } catch (error) {
        console.error(error);
        res.render('user/signup', { error: 'Server error' });
    }
};

const authUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (user.googleId) {
            return res.status(400).json({ error: 'Continue the process using Google' });
        }
        if (!user || !await user.matchPassword(password)) { // Adjust password checking
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true }); // Store token in a cookie
        res.json({ token }); // Send token in response (optional)

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error ayo' });
    }
};

const logout = (req, res) => {
    if (req.session.passport) {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).send('Failed to destroy session');
            }
        })
    } else {
        console.log('suiiiiiiiiiii')
    }
    res.clearCookie('token', { httpOnly: true });
    res.redirect('/login');
};

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
});

const sendOTPVerificationEmail = async (userId, email, res) => {
    try {
        const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(otp, saltRounds);
        console.log("this is the otp", otp)
        const mailOptions = {
            from: `"CellCity" <${process.env.AUTH_EMAIL}>`,
            to: email,
            subject: "Verify Your Email",
            html: `<p>Enter <b>${otp}</b> in the browser to verify your email address and complete the process.</p><p>This code <b>expires in 1 minute</b>.</p>`
        };

        const newOTPVerification = new userOTPVerification({
            userId,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
            email
        });

        await newOTPVerification.save();
        await transporter.sendMail(mailOptions);

        // Redirect to verify OTP page
        if (!res.headersSent) {
            res.redirect(`/verifyOTP?userId=${userId}&email=${email}`);
        }

    } catch (error) {
        if (res && !res.headersSent) {
            res.render('user/signup', {
                error: error.message,
                data: {
                    userId,
                    email,
                }
            });
        } else {
            console.error('Error sending OTP:', error.message);
        }
    }
};


const verifyOTP = async (req, res) => {
    try {
        let { userId, otp } = req.body;
        if (!userId || !otp) {
            throw new Error("Empty OTP details");
        } else {
            const userOTPVerificationRecords = await userOTPVerification.find({ userId });
            if (userOTPVerificationRecords.length <= 0) {
                throw new Error("Account record doesn't exist or has been verified already");
            } else {
                const { expiresAt, email } = userOTPVerificationRecords[0];
                const hashedOTP = userOTPVerificationRecords[0].otp;

                if (expiresAt < Date.now()) {
                    await userOTPVerification.deleteMany({ userId });
                    throw new Error("Code has expired. Please request again");
                } else {
                    const validOTP = await bcrypt.compare(otp, hashedOTP);
                    if (!validOTP) {
                        throw new Error("Invalid code passed. Check your inbox");
                    } else {
                        const tempUser = await TempUser.findById(userId);

                        if (tempUser) {
                            const referralCode = generateReferralCode();

                            const newUser = new User({
                                username: tempUser.username,
                                email: tempUser.email,
                                password: tempUser.password,
                                referralCode,
                                createdAt: Date.now(),
                            });


                            if (tempUser.referralCode) {
                                const referrer = await User.findOne({ referralCode: tempUser.referralCode });
                                if (referrer) {
                                    newUser.referredBy = referrer._id; // Set the referrer
                                    referrer.walletBalance += 300; // Reward referrer
                                    referrer.transactionHistory.push({
                                        type: 'deposit',
                                        amount: 300,
                                        description: `Referral reward from user ${newUser.username}`,
                                    });
                                    await referrer.save();
                                }
                                newUser.walletBalance += 100; // Reward the new user
                                newUser.transactionHistory.push({
                                    type: 'deposit',
                                    amount: 100,
                                    description: `Referral bonus for signing up with code ${tempUser.referralCode}`,
                                });
                            }


                            await newUser.save();
                            await tempUser.deleteOne();
                            await userOTPVerification.deleteMany({ userId });
                            console.log("OTP successfully verified");
                            return res.json({ success: true, redirectUrl: '/login' });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log(`Error message is ${error.message}`);
        return res.json({ success: false, error: error.message });
    }
};

const generateReferralCode = () => {
    return crypto.randomBytes(4).toString('hex').toUpperCase();  // Generates an 8-character random string
};

const resendOTPVerification = async (req, res) => {
    try {
        const { userId, email } = req.body;
        console.log('NEE ETHADA', email, userId)
        // Ensure both userId and email are available
        if (!userId || !email) {
            throw new Error("User ID or email is missing");
        }

        // Remove existing OTP verifications for the user
        await userOTPVerification.deleteMany({ userId });

        // Send a new OTP and handle response within the sendOTPVerificationEmail function
        await sendOTPVerificationEmail(userId, email, res);
        // res.json({
        //     status: "SUCCESS",
        //     message: "OTP has been resent successfully."
        // });

    } catch (error) {
        if (!res.headersSent) {
            res.json({
                status: "FAILED",
                message: error.message
            });
        }
    }
};


const getHomePage = async (req, res) => {
    try {
        let isLoggedIn = false;
        if (req.user && req.user.role === 'user') {
            isLoggedIn = true;
        }

        // Fetch all variants and populate the associated product details
        const variants = await Variants.find({ status: 'active' })
            .populate('productId')  // Populate product details based on the productId
            .exec();


             // Iterate through each variant to calculate the best offer
        for (let variant of variants) {
            const product = variant.productId;

            // Fetch offers for the brand and product
            const offers = await Offer.find({
                $or: [
                    { type: 'product', typeId: variant._id },
                    { type: 'brand', typeId: product.brandId }
                ]
            });

            // Calculate best discount
            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(product.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;
            const bestDiscount = Math.max(brandDiscount, productDiscount);

            // Calculate final price after discount
            const discountMultiplier = (100 - bestDiscount) / 100;
            variant.finalPrice = variant.price * discountMultiplier;
            variant.bestDiscount = bestDiscount; 
        }
        // Fetch best selling products
        const bestSellingProducts = await getBestSellingProduct();

        // Ensure there are best selling products before trying to access them
        let bestSellingProduct = null;
        if (bestSellingProducts.length > 0) {
            const bestSellingProductId = bestSellingProducts[0]._id;
            // Fetch the best selling product and populate the brand and variants
            bestSellingProduct = await Products.findById(bestSellingProductId)
                .populate('brandId')
                .populate({
                    path: 'variants',  // Populate the variants array to get images
                    select: 'variantImages' // Select only the variantImages to reduce data load
                });
        }

        
        
      



        // Render tuser/he home page with separate data
        return res.render('user/home', { 
            user: req.user, 
            variants, 
            isLoggedIn, 
            bestSellingProducts, 
            bestSellingProduct 
        });
        
    } catch (error) {
        console.error('Error fetching home page data:', error);
        return res.status(500).send('An error occurred while loading the home page.');
    }
};


const getShopPage = async (req, res) => {
    try {

        let isLoggedIn = false;
        if (req.user && req.user.role === 'user') {
            isLoggedIn = true;
        }

        const { sortBy, selectedBrands, priceRange, search, page = 1 } = req.query;
        const limit = 6;  // Results per page
        const skip = (page - 1) * limit;  // Calculate the skip value for pagination

        let user
        if(req.user){
            user = await User.findById(req.user.id).populate('wishlist');
        }else{
            user = null
        }

        

        let selectedBrandsArray = [];
        if (selectedBrands) {
            try {
                const decodedBrands = decodeURIComponent(selectedBrands);
                selectedBrandsArray = JSON.parse(decodedBrands);
                selectedBrandsArray = selectedBrandsArray.filter(brandId => mongoose.Types.ObjectId.isValid(brandId));
            } catch (error) {
                selectedBrandsArray = [];
                console.error('Error parsing selectedBrands:', error);
            }
        }

        const filterConditions = {};
        if (selectedBrandsArray.length > 0) {
            const products = await Products.find({ brandId: { $in: selectedBrandsArray } });
            const productIds = products.map(product => product._id);
            filterConditions.productId = { $in: productIds };
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            const productsWithName = await Products.find({ productName: { $regex: searchRegex } });
            const productIds = productsWithName.map(product => product._id);
            filterConditions.productId = { $in: productIds };
        }

        // Fetch variants with pagination
        const variantsQuery = Variants.find(filterConditions)
            .populate({
                path: 'productId',
                populate: { path: 'brandId', model: 'Brands' }
            })
            .skip(skip)
            .limit(limit);  // Pagination logic: Skip and Limit

        if (sortBy === 'price-asc') {
            variantsQuery.sort({ price: 1 });
        } else if (sortBy === 'price-desc') {
            variantsQuery.sort({ price: -1 });
        }

        let variants = await variantsQuery;

        if (sortBy === 'name-asc') {
            variants = variants.sort((a, b) => a.productId.productName.localeCompare(b.productId.productName));
        } else if (sortBy === 'name-desc') {
            variants = variants.sort((a, b) => b.productId.productName.localeCompare(a.productId.productName));
        }

        const brands = await Brands.find({});
        const totalResults = await Variants.countDocuments(filterConditions);  // Total number of results

        // Log result counts for debugging
        const databaseVariants = await Variants.find({})
        for (let variant of variants) {
            const product = variant.productId;

            // Fetch offers for the brand and product
            const offers = await Offer.find({
                $or: [
                    { type: 'product', typeId: variant._id },
                    { type: 'brand', typeId: product.brandId }
                ]
            });

            // Calculate best discount
            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(product.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;
            const bestDiscount = Math.max(brandDiscount, productDiscount);

            // Calculate final price after discount
            const discountMultiplier = (100 - bestDiscount) / 100;
            variant.finalPrice = variant.price * discountMultiplier;
            variant.bestDiscount = bestDiscount; 
        }

        const shuffledRelatedVariants = variants.sort(() => Math.random() - 0.5);

        res.render('user/shop', {
            user,
            products: await Products.find({}),
            query: req.query,
            selectedBrands: selectedBrandsArray,
            brands,
            variants:shuffledRelatedVariants,
            databaseVariants,
            totalResults,
            isLoggedIn,
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalResults / limit)
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};








const getProductDetailsPage = async (req, res) => {
    try {

        let isLoggedIn = false;
        if (req.user && req.user.role === 'user') {
            isLoggedIn = true;
        }

        const { id } = req.params; // Variant ID from URL params

        // Find the variant by ID and populate the associated product details
        const variant = await Variants.findById(id)
            .populate('productId')            // Populate product data
            .populate('reviews.author', 'username')
            .exec();

        if (!variant) {
            return res.status(404).send('Variant not found');
        }

        const product = await Products.findById(variant.productId).populate('variants').exec();
        if (!product) {
            return res.status(404).send('Product not found');
        }
        // Fetch offers for the brand and product
        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: variant._id },
                { type: 'brand', typeId: product.brandId }
            ]
        });

        // Calculate best discount
        const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(product.brandId));
        const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(variant._id));

        const brandDiscount = brandOffer ? brandOffer.percentage : 0;
        const productDiscount = productOffer ? productOffer.percentage : 0;
        const bestDiscount = Math.max(brandDiscount, productDiscount);

        // Calculate final price after discount
        const discountMultiplier = (100 - bestDiscount) / 100;
        const finalPrice = variant.price * discountMultiplier;


        const reviews = variant.reviews;
        const overallRating = reviews.length > 0 
            ? reviews.reduce((acc, review) => acc + review.rating, 0) / reviews.length 
            : 0;

        const relatedVariants = await Variants.find({ 
            productId: { $in: await Products.find({ brandId: product.brandId }).distinct('_id') }, // Find product IDs of the same brand
            _id: { $ne: variant._id } // Exclude the current variant
        }).populate('productId');

        const shuffledRelatedVariants = relatedVariants.sort(() => Math.random() - 0.5);
        const limitedRelatedVariants = shuffledRelatedVariants.slice(0, 4);

        for (let relatedVariant of limitedRelatedVariants) {
            const relatedOffers = await Offer.find({
                $or: [
                    { type: 'product', typeId: relatedVariant._id },
                    { type: 'brand', typeId: product.brandId }
                ]
            });

            const relatedBrandOffer = relatedOffers.find(offer => offer.type === 'brand' && offer.typeId.equals(product.brandId));
            const relatedProductOffer = relatedOffers.find(offer => offer.type === 'product' && offer.typeId.equals(relatedVariant._id));

            const relatedBrandDiscount = relatedBrandOffer ? relatedBrandOffer.percentage : 0;
            const relatedProductDiscount = relatedProductOffer ? relatedProductOffer.percentage : 0;
            const relatedBestDiscount = Math.max(relatedBrandDiscount, relatedProductDiscount);

            // Calculate final price after discount for related variant
            const relatedDiscountMultiplier = (100 - relatedBestDiscount) / 100;
            relatedVariant.finalPrice = relatedVariant.price * relatedDiscountMultiplier; // Assign final price to related variant
            relatedVariant.bestDiscount = relatedBestDiscount; // Assign best discount to related variant
        }


        let user
        if(req.user){
            user = await User.findById(req.user.id).populate('wishlist');
        }else{
            user = null
        }
        // Render tuser/he product details page with the necessary data
        res.render('user/product-details', {
            user,
            variant: { ...variant.toObject(), bestDiscount, finalPrice, overallRating  },
            product,
            relatedVariants:limitedRelatedVariants,
            isLoggedIn
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};








const getRegisterPage = async (req, res) => {
    res.render('user/signup', { error: null });
};

const getLoginPage = async (req, res) => {
    if (req.user) {
        return res.redirect('/') // Redirect if user is already logged in
    }
    res.render('user/login', { error: null });
};

const sendForgotOTPVerificationEmail = async (_id, email, res) => {
    try {
        const otp = `${Math.floor(100000 + Math.random() * 900000)}`;

        const mailOptions = {
            from: `"CellCity" <${process.env.AUTH_EMAIL}>`,
            to: email,
            subject: "Verify Your Email",
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
        res.redirect(`/forgotOTP?userId=${_id}&email=${email}`);


    } catch (error) {
        // Check if 'res' is valid and not undefined
        if (res && !res.headersSent) {
            res.render('user/signup', {
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
    res.render('user/forgot', { error: null });

};

const sendForgotOTP = async (req, res) => {
    const { email } = req.body;
    console.log('Initiating forgot OTP process for:', email); // Add this line
    const user = await User.findOne({ email });

    if (!user) {
        return res.render('user/forgot', { error: 'No user found in the database' });
    }

    try {
        await sendForgotOTPVerificationEmail(user._id, email, res);
    } catch (error) {
        console.error(error);
        res.render('user/forgot', { error: 'Server error' });
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
    res.render('user/forgotOTP', { userId, email, error: null });
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
        const email = user.email;
        console.log(`my email is ::::::::::::::::::${email}`)

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
        res.json({ success: true, redirectUrl: `/resetPassword?userId=${userId}&email=${encodeURIComponent(email)}` });

    } catch (error) {
        console.log(`Error message is ${error.message}`);
        res.status(400).json({ error: error.message });
    }
};



const getResetPasswordPage = (req, res) => {
    try {
        const { userId, email } = req.query;
        console.log('Received userId:', userId, 'and email:', email); // Add this line
        if (!userId || !email) {
            return res.status(400).json({ error: 'Missing user ID or email' });
        }
        res.render('user/resetPassword', { userId, email, error: null });
    } catch (error) {
        console.error('Error renderinuser/g reset password page:', error);
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

        const passwordValidation = validateStrongPassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ error: passwordValidation.message });
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

        // Success response
        return res.json({ success: true, redirectUrl: '/login' });

    } catch (error) {
        console.error('Error resetting password:', error);
        // Return the error message in the response
        return res.status(500).json({ error: 'Internal server error' });
    }
};




const getOTPPage = async (req, res) => {
    const { userId, email } = req.query;
    console.log('This is Normal OTP')
    console.log(req.query)
    return res.render('user/OTP', { userId, email, error: null });
};

const getCartPage = async (req, res) => {
    if (req.user) {
        return res.render('user/shopping-cart')
    }
    res.redirect('/login')
};


const getUserProfile = async (req, res) => {
    if (req.user) {
        const user = await User.findById(req.user.id)
        return res.render('user/profile', { user, currentUrl: req.originalUrl })
    }
    res.redirect('/login')
};

const updateProfile = async (req, res) => {
    const { username, email, phoneNumber } = req.body;
    try {
        if (!username || !phoneNumber) {
            return res.status(400).json({ message: 'All fields are required' });

        }

        // Validate username
        const usernameValidation = validateName(username);
        if (!usernameValidation.valid) {
            return res.status(400).json({ message: usernameValidation.message });
        }

        // Validate Phone Number
        const phoneValidation = validatePhoneNumber(phoneNumber);
        if (!phoneValidation.valid) {
            return res.status(400).json({ message: phoneValidation.message });
        }

        await User.findByIdAndUpdate(req.user.id, {
            username,
            email,
            phoneNumber,
        });
        res.status(200).json({ message: 'Profile updated successfully' });

    } catch (error) {
        res.status(500).send('Server Error');
    }
};


const getAddressPage = async (req, res) => {
    if(!req.user){
        return res.redirect('/login')
    }

    try {
        const user = await User.findById(req.user.id)
        res.render('user/address', { user, currentUrl: req.originalUrl });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};



const addAddress = async (req, res) => {
    const userId = req.user.id;
    const newAddress = req.body;
    // Validate Phone Number
    const phoneValidation = validatePhoneNumber(newAddress.phoneNumber);
    if (!phoneValidation.valid) {
        return res.status(400).json({ errors: { phoneNumber: phoneValidation.message } });
    }

    const zipCodeValidation = validateZipCode(newAddress.zip);
    if (!zipCodeValidation.valid) {
        return res.status(400).json({ errors: { zip: zipCodeValidation.message } });
    }

    try {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        user.addresses.push(newAddress);
        await user.save();
        res.status(200).json({ success: true, redirectUrl: '/profile/address' });
    } catch (error) {
        res.status(500).json({ errors: { general: 'Error adding address: ' + error.message } });
    }
};


const addAddressCheckout = async (req, res) => {
    const { label, street, city, state, country, phoneNumber, zip } = req.body;
    try {
        // Check if the user already has an address with the same label
        const user = await User.findById(req.user.id).lean();

        // If no address with the same label, add the new address
        const newAddress = { label, street, city, state, country, phoneNumber, zip };
        await User.findByIdAndUpdate(req.user.id, { $push: { addresses: newAddress } });

        // Fetch updated list of addresses
        const updatedUser = await User.findById(req.user.id).lean();
        res.json({ success: true, addresses: updatedUser.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding address' });
    }
};



const updateAddress = async (req, res) => {
    const userId = req.user.id;
    const addressId = req.params.addressId;
    const updatedAddress = req.body;


    // Validate Phone Number
    const phoneValidation = validatePhoneNumber(updatedAddress.phoneNumber);
    if (!phoneValidation.valid) {
        return res.status(400).json({ errors: { phoneNumber: phoneValidation.message } });
    }

    // Validate ZIP Code
    const zipCodeValidation = validateZipCode(updatedAddress.zip);
    if (!zipCodeValidation.valid) {
        return res.status(400).json({ errors: { zip: zipCodeValidation.message } });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ errors: { general: 'User not found' } });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(404).json({ errors: { general: 'Address not found' } });
        }

        // Update the address fields
        address.set(updatedAddress);
        await user.save();

        res.status(200).json({ success: true, message: 'Address updated successfully' });
    } catch (error) {
        res.status(500).json({ errors: { general: 'Error updating address: ' + error.message } });
    }
};


const removeAddress = async (req, res) => {
    const userId = req.user.id;
    const addressId = req.params.addressId;
    try {
        const user = await User.findByIdAndUpdate(
            userId,
            { $pull: { addresses: { _id: addressId } } },
            { new: true }
        );
        if (!user) throw new Error('User not found');
        await user.save();
        res.redirect('/profile/address');
    } catch (error) {
        res.status(500).send('Error removing address: ' + error.message);
    }
};

const getUserResetPasswordPage = (req, res) => {
    try {
        if (req.user) {
            return res.render('user/userResetPassword', { currentUrl: req.originalUrl });
        }
        res.redirect('/profile')

    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

const userResetPassword = async (req, res) => {
    const userId = req.user.id;
    try {
        const { currentPassword, password, cpassword } = req.body;

        if (!currentPassword || !password || !cpassword) {
            return res.render('user/userResetPassword', {
                currentUrl: req.originalUrl,
                error: 'All fields are required'
            });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.render('user/userResetPassword', {
                currentUrl: req.originalUrl,
                error: 'User not found'
            });
        }

        // Check if current password matches
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.render('user/userResetPassword', {
                currentUrl: req.originalUrl,
                error: 'Current password is incorrect'
            });
        }

        const passwordValidation = validateStrongPassword(password);
        if (!passwordValidation.valid) {
            return res.render('user/userResetPassword', {
                currentUrl: req.originalUrl,
                error: passwordValidation.message
            });
        }

        if (password !== cpassword) {
            return res.render('user/userResetPassword', {
                currentUrl: req.originalUrl,
                error: 'Passwords do not match'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        // Redirect to profile page after successful password reset
        res.redirect('/profile');
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).send('Server Error');
    }
};




const addToCart = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'User not authenticated, please log in.' });
    }


    const { variantId } = req.body;
    const userId = req.user.id;

    try {
        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => item.variant.toString() === variantId);

        // Fetch the variant and associated product details
        const variant = await Variants.findById(variantId).populate('productId');

        if(variant.status === 'inactive'){
            return res.status(400).json({ title: 'Product Unavailable', message:'Cannot add this product to cart.', variantId });
        }

        if (variant.stocks <= 0) {
            return res.status(400).json({ title: 'Insufficient Stock.', message:'Cannot add this product to cart due to the lack of stocks.', variantId });
        }
        
        const product = variant.productId;

        // Check for applicable offers
        const brands = await Brands.find({}).lean();
        const brandMap = Object.fromEntries(brands.map(brand => [brand.brandName, brand._id]));

        // Fetch offers for the brand and product
        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: product._id },
                { type: 'brand', typeId: brandMap[product.brand] }
            ]
        });

        let bestDiscount = 0;

        if (offers.length > 0) {
            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(brandMap[product.brand]));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(product._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            bestDiscount = Math.max(brandDiscount, productDiscount);
        }

        const discountMultiplier = (100 - bestDiscount) / 100;
        const finalPrice = (variant.price * discountMultiplier).toFixed(2);

        if (itemIndex !== -1) {
            // Item is already in the cart, update the final price if necessary
            cart.items[itemIndex].finalPrice = finalPrice; // Update final price
        } else {
            // Item is not in the cart, so add it
            cart.items.push({ variant: variantId, finalPrice });
        }

        await cart.save();

        // Send a JSON response with a success message
        res.json({
            message: 'Item added to cart successfully with applicable offers.',
            variantId // Include the variantId for redirecting
        });
    } catch (error) {
        // Send a JSON response with an error message
        res.status(500).json({ message: 'Error adding variant to cart' });
    }
};





const listCartProducts = async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    let isLoggedIn = true;
    
    const userId = req.user.id;

    try {
        // Populate variant and then populate the productId within each variant
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });


        // Process each cart item to apply the best offer
        cart.items.forEach(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;


            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));


            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            // Determine which offer to apply
            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            item.finalPrice = (item.variant.price * discountMultiplier).toFixed(2); // Update final price
        });

        await cart.save()
        // Render tuser/he cart EJS view and pass the cart data
        res.render('user/cart', { cart, isLoggedIn });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching cart products', error });
    }
};




const updateCartItemQuantity = async (req, res) => {
    const { variantId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.id;

    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const itemIndex = cart.items.findIndex(item => item.variant.toString() === variantId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        const variant = await Variants.findById(variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }

        const availableStock = variant.stocks;
        let newQuantity = Number(quantity);

        // Ensure quantity does not go below 1 or exceed stock
        if (newQuantity < 1 || newQuantity > availableStock || newQuantity > 10) {
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
        }

        // Update the quantity
        cart.items[itemIndex].quantity = newQuantity;

        // Recalculate totals
        const item = cart.items[itemIndex];
        const subtotal = cart.items.reduce((acc, item) => acc + (item.variant.price * item.quantity), 0);
        const total = cart.items.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0);

        await cart.save();

        res.json({
            success: true,
            message: 'Cart updated successfully',
            updatedItem: { finalPrice: item.finalPrice },
            subtotal,
            total
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating cart item quantity', error: error.message });
    }
};




const checkVariantStocks = async (req, res) => {
    try {
        const { variantId } = req.params;
        const variant = await Variants.findById(variantId);
        if (!variant) {
            return res.status(404).json({ message: 'Variant not found' });
        }
        res.json({ stocks: variant.stocks });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stock information', error });
    }
};

const removeFromCart = async (req, res) => {
    const { variantId } = req.params;
    const userId = req.user.id;

    try {
        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        cart.items = cart.items.filter(item => item.variant.toString() !== variantId);

        await cart.save();

        res.redirect('/cart'); // Redirect to the cart page after removal
    } catch (error) {
        res.status(500).json({ message: 'Error removing variant from cart', error });
    }
};

const getCheckoutPage = async (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }

    let isLoggedIn = false;
        if (req.user && req.user.role === 'user') {
            isLoggedIn = true;
        }


    const userId = req.user.id;
    try {
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });

        const user = await User.findById(userId);

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });


        // Process each cart item to apply the best offer
        cart.items.forEach(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;


            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));


            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            // Determine which offer to apply
            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            item.finalPrice = (item.variant.price * discountMultiplier).toFixed(2); // Update final price
        });

        const currentDate = new Date();

        // Find all coupons that are not expired and the user has not used yet
        const coupons = await Coupon.find({
            expirationDate: { $gt: currentDate },   // Unexpired coupons
            users: { $ne: new mongoose.Types.ObjectId(userId) }, // Coupons not used by the user
            status: 'active' // Only active coupons
        }).lean();

        // Render tuser/he checkout page
        return res.render('user/checkout', { cart, user, session: req.session, coupons, isLoggedIn });
    } catch (error) {
        return res.status(500).json({ message: 'Error loading checkout page', error });
    }
};






const proceedToCheckout = async (req, res) => {
    const userId = req.user.id;

    try {
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });

        if (!cart || cart.items.length === 0) {
            // Send error message as a response
            return res.status(400).json({ success: false, message: 'Your cart is empty.' });
        }

        for (let item of cart.items) {
            const variant = item.variant;
           
            if (variant.stocks < item.quantity) {
                // Send error message as a response
                return res.status(400).json({ success: false, message: `Insufficient stock for ${variant.productId.productName}. Available: ${variant.stocks}, Requested: ${item.quantity}` });
            }
        }

        // If everything is fine, proceed to checkout
        res.json({ success: true, redirectUrl: '/checkout' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Error during checkout', error: error.message || 'Unknown error' });
    }
};




const verifyPayment = async (req, res) => {
    const { orderId, paymentId, signature } = req.body;
    const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET_ID)
        .update(orderId + "|" + paymentId)
        .digest('hex');
 
    if (generatedSignature === signature) {
        // await Order.updateOne({ status: 'Completed' });
        res.redirect('/order-success');
    } else {
        res.status(400).json({ message: 'Payment verification failed' });
    }
};



const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET_ID,
});

const createRazorpayOrder = async (req, res) => {
    const userId = req.user.id;
    const { paymentMethod, shippingAddress } = req.body;
    let { amount } = req.body;
    amount = Number(amount);


    if (req.session.coupon) {
        const coupon = await Coupon.findOne({ code: req.session.coupon.code });

        if (!coupon) {
            return res.status(500).json({message:`Invalid Coupon Code` })
        }

        if (coupon.status === 'inactive') {
            return res.status(500).json({message:`This coupon is temporarily unavailable` })
        }

        if (new Date(coupon.expirationDate).getTime() < Date.now()) {
            return res.status(500).json({message:`Coupon has expired!`})
        }

        if (coupon.users.includes(userId)) {
            return res.status(500).json({message:`Coupon has already used!`})
        }
        
        await Coupon.findOneAndUpdate({ code: req.session.coupon.code }, { $addToSet: { users: userId } });
    }
    const discountPercentage = req.session.coupon ? req.session.coupon.percentage : 0;
    const discount = (amount * discountPercentage) / 100;
    amount -= discount;

    let amountAfterDiscount = amount;
    
    const selectedAddress = shippingAddress.selectedAddress;
    const userAddressVerification = await User.findOne({
        _id: userId,
        'addresses._id': selectedAddress  // This checks if the addressId exists in the addresses array
    });

    if(!userAddressVerification){
        return res.status(500).json({message:`Check your Address!` })
    }

    const options = {
        amount: Math.round(Number(amount) * 100), // Razorpay requires amount in the smallest currency unit
        currency: "INR",
        receipt: "order_rcptid_11",
    };

    try {
        // Attempt to create a Razorpay order
        const order = await razorpay.orders.create(options);

        if (!order || !order.id) {
            throw new Error('Razorpay order creation failed.');
        }

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        let shippingDetails;
        if (selectedAddress) {
            const user = await User.findById(userId).select('addresses');
            shippingDetails = user.addresses.id(selectedAddress);
        } else {
            const { street, city, state, country, phoneNumber, zip } = shippingAddress;
            shippingDetails = { street, city, state, country, phoneNumber, zip };
            await User.findByIdAndUpdate(userId, { $push: { addresses: shippingDetails } });
        }

        // Calculate itemTotal for each item
        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });

        let totalAmount = 0;

        // Create a new items array with itemTotal explicitly included
        const updatedItems = cart.items.map(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;

            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            // const priceAfterDiscount = item.variant.price -((item.variant.price*bestDiscount)/100)

            const itemTotal = (item.variant.price * item.quantity * discountMultiplier).toFixed(2);

            totalAmount += parseFloat(itemTotal);

            // Return the item object with itemTotal included
            return {
                variant: item.variant,
                quantity: item.quantity,
                price: item.variant.price,
                priceAfterDiscount: parseFloat(itemTotal) // explicitly add itemTotal to each item
            };
        });


        let deliveryChargeChecker = totalAmount; // Initialize with totalAmount
        let deliveryCharge = 0;
        if (deliveryChargeChecker < 10000) {
            deliveryCharge = 40; // Set delivery charge based on amountAfterDiscount
        }
        const finalAmount = deliveryChargeChecker + deliveryCharge;


        const newOrder = new Order({
            user: userId,
            items: updatedItems, // Use the updated items array with itemTotal
            totalAmount: finalAmount,
            shippingAddress: shippingDetails,
            paymentMethod,
            deliveryCharge,
            amountAfterDiscount: req.session.coupon ? amountAfterDiscount : totalAmount,
            coupon: req.session.coupon ? req.session.coupon : null,
            status: 'Pending'
        });

        for (let item of cart.items) {
            const variant = item.variant;
            variant.stocks -= item.quantity;

            if (variant.stocks < 0) {
                return res.status(500).json({message:`Insufficient stock for product: ${variant.productId.productName}. Go to cart` })
            }

            await variant.save();
        }


        if (totalAmount > 500000 ) {
            return res.status(500).json({message:`Transaction amount exceeds the limit of ₹5,00,000.` })
        }

        await newOrder.save();

        // Clear the cart
        cart.items = [];
        await cart.save();

        res.cookie('orderId', newOrder._id, { maxAge: 900000, httpOnly: true });

        // Now destroy session safely
        req.session.destroy(err => {
            if (err) {
                console.error('Error clearing session:', err);
            }
        });
        res.json({ orderId: order.id, totalAmount: newOrder.totalAmount });

    } catch (error) {
        res.status(500).send('Error creating s order');
    }
};


const placeOrder = async (req, res) => {
    const userId = req.user.id;
    const { selectedAddress, street, city, state, country, zip, phoneNumber, paymentMethod } = req.body;

    try {
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product'
                }
            });


        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        let shippingAddress;
        if (selectedAddress) {
            const user = await User.findById(userId).select('addresses');
            shippingAddress = user.addresses.id(selectedAddress);
        } 
        
        
        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });

        let totalAmount = 0;

        // Create a new items array with itemTotal explicitly included
        const updatedItems = cart.items.map(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;

            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            // const priceAfterDiscount = item.variant.price -((item.variant.price*bestDiscount)/100)

            const itemTotal = (item.variant.price * item.quantity * discountMultiplier).toFixed(2);

            totalAmount += parseFloat(itemTotal);

            // Return the item object with itemTotal included
            return {
                variant: item.variant,
                quantity: item.quantity,
                price: item.variant.price,
                priceAfterDiscount: parseFloat(itemTotal) // explicitly add itemTotal to each item
            };
        });

        let percentage = 0;
        let deliveryChargeChecker = totalAmount; // Initialize with totalAmount

        if (req.session.coupon) {
            percentage = req.session.coupon.percentage;
            const couponReduction = (totalAmount * percentage) / 100;
            totalAmount = totalAmount - couponReduction; // Update amountAfterDiscount with coupon reduction
        }

        let deliveryCharge = 0;
        if (deliveryChargeChecker < 10000) {
            deliveryCharge = 40; // Set delivery charge based on amountAfterDiscount
        }

        const finalAmount = deliveryChargeChecker + deliveryCharge;

        if (totalAmount > 10000 && paymentMethod === "COD") {
            return res.redirect(`/checkout?error=Order above Rs 1000 is not allowed for COD`);
        }

        if(!selectedAddress){
            shippingAddress = { street, city, state, country, phoneNumber, zip };
            await User.findByIdAndUpdate(userId, { $push: { addresses: shippingAddress } });
        }

        const newOrder = new Order({
            user: userId,
            items: updatedItems, // use the updated items array
            totalAmount: finalAmount,
            shippingAddress,
            paymentMethod,
            deliveryCharge,
            amountAfterDiscount: totalAmount,
            coupon: req.session.coupon ? req.session.coupon : null,
            status: 'Pending'
        });

        if (req.session.coupon) {
            const coupon = await Coupon.findOne({ code: req.session.coupon.code });

            if (!coupon) {
                return res.redirect(`/checkout?error=Invalid Coupon Code`);
            }

            if (coupon.status === 'inactive') {
                return res.redirect('/checkout?error=This coupon is temporarily unavailable');
            }

            if (new Date(coupon.expirationDate).getTime() < Date.now()) {
                return res.redirect('checkout?error=Coupon has expired');
            }

            if (coupon.users.includes(userId)) {
                return res.redirect('/checkout?error=Coupon already used');
            }
            await Coupon.findOneAndUpdate({ code: req.session.coupon.code }, { $addToSet: { users: userId } });
        }


        for (let item of cart.items) {
            const variant = item.variant;
            variant.stocks -= item.quantity;

            if (variant.stocks < 0) {
                return res.redirect(`/checkout?error=Insufficient stock for product: ${variant.productId.productName}. Go to cart`);
            }

            await variant.save();
        }
       
        

        await newOrder.save();


          
       
        // Clear the cart
        cart.items = [];
        await cart.save();
        req.session.destroy(err => {
            if (err) {
                console.error('Error clearing session:', err);
            }
        });

        res.redirect('/order-success');

    } catch (error) {
        res.redirect(`/checkout?error=${encodeURIComponent('Error placing order')}`);
    }
};


const orderSuccessPage = async (req, res) => {
    res.render('user/order-success')
}
const retryOrderSuccessPage = async (req, res) => {
    const orderId = req.params.orderId
    await Order.findByIdAndUpdate(orderId, { paymentStatusFailed: false, status: 'Pending' });


    const order = await Order.findById(orderId).populate('items.variant');

    if (!order.paymentStatusFailed) {
        // Update stock for each item in the order
        for (let item of order.items) {
            const variant = item.variant;
            if (!variant) {
                req.flash('error', `Variant not found for item.`);
                return res.redirect('/orders');
            }

            // Decrease the stock based on the quantity ordered
            if (variant.stocks < item.quantity) {
                req.flash('error', `Insufficient stock for product: ${variant}`);
                return res.redirect('/orders');
            }

            // Decrease the stock
            variant.stocks -= item.quantity;

            // Save the updated variant stock
            await variant.save();
        }
    }
    res.render('user/order-success')
}

const createRazorpayPayment = async (amount, orderId) => {
    const options = {
        amount: amount * 100, // amount in paise
        currency: "INR",
        receipt: orderId.toString(),
    };
    return await razorpay.orders.create(options);
};


const cancelOrder = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        // Find the order and check if it belongs to the user
        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if the order can be cancelled
        if (order.status === 'Shipped' || order.status === 'Delivered') {
            return res.status(400).json({ message: 'Cannot cancel an order that has been shipped or delivered' });
        }

        // Update order status to 'Cancelled'
        order.status = 'Cancelled';
        await order.save();

        for (const item of order.items) {
            const variant = await Variants.findById(item.variant._id);

            if (variant) {
                variant.stocks += item.quantity;
                await variant.save();
            }
        }

        if (order.paymentMethod === 'Razorpay') {
            // Find the user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Credit the order amount to the user's wallet
            user.walletBalance += order.amountAfterDiscount ? order.amountAfterDiscount : order.totalAmount;

            // Add a transaction record for the wallet
            user.transactionHistory.push({
                type: 'deposit',
                amount: order.amountAfterDiscount ? order.amountAfterDiscount : order.totalAmount,
                description: `Refund for cancelled order ${order._id}`
            });

            // Save the user with updated wallet balance and transaction history
            await user.save();
        }

        res.redirect('/orders');
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling order', error });
    }
};

const returnOrder = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        // Find the order and check if it belongs to the user
        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if the order can be returned
        if (order.status !== 'Delivered') {
            return res.status(400).json({ message: 'Only delivered orders can be returned' });
        }

        // Update order status to 'Returned'
        order.status = 'Returned';
        await order.save();


        // Increment the stock for each variant in the items array
        for (const item of order.items) {
            const variant = await Variants.findById(item.variant._id);

            if (variant) {
                variant.stocks += item.quantity;
                await variant.save();
            }
        }


        if (order.paymentMethod === 'Razorpay') {
            // Find the user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Credit the order amount to the user's wallet
            user.walletBalance += order.amountAfterDiscount ? order.amountAfterDiscount : order.totalAmount;

            // Add a transaction record for the wallet
            user.transactionHistory.push({
                type: 'deposit',
                amount: order.amountAfterDiscount ? order.amountAfterDiscount : order.totalAmount,
                description: `Refund for cancelled order ${order._id}`
            });

            // Save the user with updated wallet balance and transaction history
            await user.save();
        }

        res.redirect('/orders');
    } catch (error) {
        res.status(500).json({ message: 'Error returning order', error });
    }
};



const listUserOrders = async (req, res) => {

    if(!req.user){
        return res.redirect('/login')
    }

    const userId = req.user.id;
    try {
        const user = await User.findById(req.user.id)
        const orders = await Order.find({ user: userId }).populate('items.variant').sort({ updatedAt: -1 });
        res.render('user/orderHistory', { orders, currentUrl: req.originalUrl, user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order history', error });
    }
};


const getOrderDetails = async (req, res) => {
    if(!req.user){
        return res.redirect('/login')
    }

    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        const user = await User.findById(req.user.id)
        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product',
                    select: 'productName',
                }
            }).populate({
                path: 'user',
                model: 'users', 
                select: 'username',
            });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.render('user/orderDetails', { order, currentUrl: req.originalUrl, user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order details', error: error.message || error });
    }
};


const getWishlist = async (req, res) => {
    try {
        // Find the user and populate the wishlist with product details
        const user = await User.findById(req.user.id)
            .populate({
                path: 'wishlist', // First populate the wishlist
                populate: {
                    path: 'productId', // Then populate productId within each wishlist item
                    model: 'Product',  // Ensure this matches the product model name
                    select: 'productName' // Only select the fields you need (e.g., productName)
                }
            });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Pass populated wishlist to the view
        res.render('user/wishlist', { variants: user.wishlist, currentUrl: req.originalUrl, user });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load wishlist' });
    }
};

const addToWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const productId = req.params.productId;
        
        if (!user.wishlist.includes(productId)) {
            user.wishlist.push(productId);
            await user.save();
            res.status(200).json({ title:'Added to Wishlist', message: 'Product added to wishlist successfully', status: 'success' });
        } else {
            res.status(400).json({ message: 'Product already in wishlist', status: 'warning' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to add product to wishlist', status: 'error' });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const productId = req.params.productId;
        
        user.wishlist = user.wishlist.filter(item => item.toString() !== productId);
        await user.save();
        
        res.status(200).json({ title:'Removed from Wishlist', message: 'Product removed from wishlist successfully', status: 'success' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to remove product from wishlist', status: 'error' });
    }
};



// Apply Coupon
const applyCoupon = async (req, res) => {
    let { couponCode } = req.body;
    couponCode = couponCode.toUpperCase();
    const userId = req.user.id;

    try {
        // Find the coupon by code
        const coupon = await Coupon.findOne({ code: couponCode });

        if (!coupon) {
            return res.status(400).json({ message: 'Invalid coupon code' });
        }

        if (coupon.status === 'inactive') {
            return res.status(400).json({ message: 'This coupon is temporarily unavailable' });
        }

        if (new Date(coupon.expirationDate).getTime() < Date.now()) {
            return res.status(400).json({ message: 'Coupon has expired' });
        }

        // Check if the user has already used the coupon
        if (coupon.users.includes(userId)) {
            return res.status(400).json({ message: 'Coupon already used' });
        }

        // Find the user's cart and calculate total
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.variant',
            populate: {
                path: 'productId',
                model: 'Product'
            }
        });
        if (!cart) {
            return res.status(400).json({ message: 'Cart not found' });
        }

        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });
        let totalAmount = 0;

        cart.items.forEach(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;

            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            const itemTotal = (item.variant.price * item.quantity * discountMultiplier).toFixed(2);

            totalAmount += parseFloat(itemTotal);
        });

        if (totalAmount < coupon.minAmount) {
            return res.status(400).json({ message: `Requires minimum purchase of ₹${coupon.minAmount} to use the coupon` });
        }

        // Calculate the discount
        const discount = (coupon.percentage / 100) * totalAmount
        const discountedTotal = Math.max(totalAmount - discount, 0);

        // Store coupon in session
        req.session.coupon = { code: coupon.code, discount, percentage: coupon.percentage };
        req.session.totalAmount = discountedTotal;


        return res.status(200).json({
            message: 'Coupon applied successfully',
            discount,
            percentage: coupon.percentage,
            newTotalAmount: discountedTotal
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};




// Remove Coupon
const removeCoupon = async (req, res) => {
    try {
        const userId = req.user.id;
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.variant',
            populate: {
                path: 'productId',
                model: 'Product'
            }
        });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const cartTotal = cart.items.reduce((acc, item) => acc + item.variant.price * item.quantity, 0);



        const productIds = cart.items.map(item => item.variant._id);
        const brandIds = cart.items.map(item => item.variant.productId.brandId);

        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });

        let totalAmount = 0;

        cart.items.forEach(item => {
            const product = item.variant.productId;
            const brand = item.variant.productId.brandId;

            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));

            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            const itemTotal = (item.variant.price * item.quantity * discountMultiplier).toFixed(2);

            totalAmount += parseFloat(itemTotal);
        });


        // Remove the coupon from session
        delete req.session.coupon;
        req.session.totalAmount = totalAmount;

        return res.status(200).json({
            message: 'Coupon removed successfully',
            newTotalAmount: totalAmount
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};


const getWalletPage = async (req, res) => {
    if(!req.user){
        return res.redirect('/login')
    }

    try {
        const userId = req.user.id; 
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const sortedTransactionHistory = user.transactionHistory.sort((a, b) => b.date - a.date);

        // Render tuser/he wallet page with walletBalance and transactionHistory
        res.render('user/wallet', {
            currentUrl: req.originalUrl,
            user,
            walletBalance: user.walletBalance || 0,
            transactionHistory: sortedTransactionHistory || []
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet details' });
    }
};

const getCouponsPage = async (req, res) => {

    if(!req.user){
        return res.redirect('/login')
    }
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        const currentDate = new Date();

        // Find all coupons that are not expired and the user has not used yet
        const coupons = await Coupon.find({
            expirationDate: { $gt: currentDate },   // Unexpired coupons
            users: { $ne: new mongoose.Types.ObjectId(userId) }, // Coupons not used by the user
            status: 'active' // Only active coupons
        });

        // Render tuser/he coupons.ejs with the list of available coupons
        res.render('user/coupons', { coupons, currentUrl: req.originalUrl, user });
    } catch (error) {
        res.status(500).send("Internal Server Error");
    }
};


const paymentFailedPost = async (req, res) => {
    try {
        const orderId = req.cookies.orderId;
        
        // Find the order based on the orderId
        const order = await Order.findById(orderId).populate('items.variant');

        if (!order) {
            return res.status(404).send('Order not found');
        }
        // Update stock for each variant in the order
        for (const item of order.items) {
            const variantId = item.variant._id;
            const quantity = item.quantity;

            // Find the variant and update the stock
            await Variants.findByIdAndUpdate(variantId, {
                $inc: { stocks: quantity } // Increment the stocks by the quantity in the order
            });
        }

        // Update the order with paymentStatusFailed = true and status = 'Failed'
        await Order.findByIdAndUpdate(orderId, { 
            paymentStatusFailed: true, 
            status: 'Failed' 
        });

        res.status(200).send('Payment status updated to failed and stock replenished.');
    } catch (error) {
        res.status(500).send('Server error');
    }
};


const paymentFailedGet = (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }

    let isLoggedIn = false;
        if (req.user && req.user.role === 'user') {
            isLoggedIn = true;
        }
    res.render('user/order-failed', {
        message: 'Oops! Payment Failed',
        orderId: req.cookies.orderId,
        retryButton: true, // Show retry button
        isLoggedIn
    });
};

const retryPayment = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('items.variant');

        let stockAvailable = true;
        let priceChanged = false;

        // Check if stock is available and price is the same
        for (let item of order.items) {
            const variant = item.variant;

            if (variant.stocks < item.quantity) {
                stockAvailable = false;
                break;
            }

            if (variant.price !== item.variant.price) {
                priceChanged = true;
                break;
            }
        }

        if (!stockAvailable || priceChanged) {
            // Cancel the order if there's an issue
            await Order.findByIdAndUpdate(req.params.orderId, { status: 'Cancelled' });
            return res.render('user/errorPage', {
                message: 'Error retrying payment. Order has been cancelled due to stock or price issues.'
            });
        }

        // If everything is fine, initiate payment again
        const amount = order.amountAfterDiscount || order.totalAmount;
        res.redirect('/orders')

    } catch (error) {
        res.status(500).send('Server error');
    }
};

const updateRazorPayOrder = async (req, res) => {
    const { orderId, amount } = req.body;

    try {
        // Fetch the order by ID and populate variant info
        const order = await Order.findById(orderId).populate({
            path: 'items.variant',
            populate: {
                path: 'productId',
                model: 'Product'
            }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        if(order.coupon.code){
            order.status = 'Cancelled';
                await order.save();
            return res.status(404).json({ message: `Can't Rery the order since you used coupon in the last process` });
        }

        // Extract product and brand IDs from the order items
        const productIds = order.items.map(item => item.variant._id);
        const brandIds = order.items.map(item => item.variant.productId.brandId);

        // Find all offers for the relevant products and brands
        const offers = await Offer.find({
            $or: [
                { type: 'product', typeId: { $in: productIds } },
                { type: 'brand', typeId: { $in: brandIds } }
            ]
        });

        // Check each item in the order for price, stock, and offer consistency
        for (let item of order.items) {
            const variant = await Variants.findById(item.variant._id);
            if (!variant) {
                return res.status(404).json({ message: `Variant ${item.variant._id} not found` });
            }

            // 1. Check for price changes
            if (item.price !== variant.price) {
                order.status = 'Cancelled';
                await order.save();
                return res.status(400).json({ message: `Price for variant ${variant._id} has changed. Order cancelled.` });
            }

            // 2. Check for stock changes
            if (item.quantity > variant.stocks) {
                order.status = 'Cancelled';
                await order.save();
                return res.status(400).json({ message: `Insufficient stock for variant ${variant._id}. Order cancelled.` });
            }

            // 3. Find the best discount between product offer and brand offer
            const brandOffer = offers.find(offer => offer.type === 'brand' && offer.typeId.equals(item.variant.productId.brandId));
            const productOffer = offers.find(offer => offer.type === 'product' && offer.typeId.equals(item.variant._id));


            const brandDiscount = brandOffer ? brandOffer.percentage : 0;
            const productDiscount = productOffer ? productOffer.percentage : 0;

            // Use the highest discount (either brand or product)
            const bestDiscount = Math.max(brandDiscount, productDiscount);
            const discountMultiplier = (100 - bestDiscount) / 100;

            // Calculate the discounted price for the item
            const priceAfterDiscount = (variant.price * discountMultiplier).toFixed(2);
            let result = item.priceAfterDiscount / item.quantity;
            let roundedResult = parseFloat(result.toFixed(1));  // This will give you 10799.2 as a number

            // 4. Check if the discounted price in the order matches the current calculated discount price
            if (roundedResult !== parseFloat(priceAfterDiscount)) {
                order.status = 'Cancelled';
                await order.save();
                return res.status(400).json({
                    message: `Offer or price for variant ${variant._id} has changed. Order cancelled.`,
                });
            }
        }

        // If everything is fine, proceed with Razorpay order creation (same as before)
        const options = {
            amount: Math.round(Number(amount) * 100), // Razorpay needs the amount in smallest currency unit
            currency: "INR",
            receipt: `order_rcptid_${orderId}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);
        if (!razorpayOrder || !razorpayOrder.id) {
            throw new Error('Razorpay order creation failed.');
        }

        // Update order with the new Razorpay order ID and retry payment status
        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatusFailed = false;
        order.status = 'Pending';
        await order.save();

        res.json({ orderId: razorpayOrder.id });
    } catch (error) {
        res.status(500).send('Server error');
    }
};


const fetchOrderDetails = async (orderId, userId) => {
    try {
        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate({
                path: 'items.variant',
                model: 'Variant',
                select: 'price color',
                populate: {
                    path: 'productId',
                    model: 'Product',
                    select: 'productName',
                }
            })
            .populate({
                path: 'user',
                model: 'users',  
                select: 'username', 
            });

        return order;
    } catch (error) {
        throw new Error('Error fetching order details');
    }
};

const generateInvoicePDF = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        // Fetch the order details using the helper function
        const order = await fetchOrderDetails(orderId, userId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Create a new PDF document
        const doc = new PDFDocument({ margin: 50 });
        const fontPath = path.resolve(__dirname, '..', 'public', 'fonts', 'NotoSans-Regular.ttf');
        const boldFontPath = path.resolve(__dirname, '..', 'public', 'fonts', 'NotoSans-Bold.ttf');
        const italicFontPath = path.resolve(__dirname, '..', 'public', 'fonts', 'NotoSans-Italic.ttf');

        // Register custom fonts
        doc.registerFont('NotoSans', fontPath);
        doc.registerFont('NotoSans-Bold', boldFontPath);
        doc.registerFont('NotoSans-Italic', italicFontPath);


        // Set headers for the PDF file
        res.setHeader('Content-disposition', `attachment; filename=invoice_${orderId}.pdf`);
        res.setHeader('Content-type', 'application/pdf');

        // Pipe the document to the response
        doc.pipe(res);

        const logoPath = path.resolve(__dirname, '..', 'public', 'images', 'CellCity.png');
        doc.image(logoPath, 50, 45, { width: 120 }) 
            .font('NotoSans-Bold')
            .text('CellCity Pvt. Ltd.', 200, 50, { align: 'right' })
            .font('NotoSans')
            .text('Kinfra, Calicut, India', 200, 65, { align: 'right' })
            .text('Email: info@cellCity.com', 200, 80, { align: 'right' })
            .text('Phone: +91 9037532036', 200, 95, { align: 'right' })
            .moveDown();

        doc.moveTo(50, 120)
            .lineTo(563, 120)
            .stroke();

        // Add Invoice Title
        doc.fontSize(25).font('NotoSans-Bold').text('INVOICE', 250, 123).moveDown()

        doc.moveTo(50, 160)
            .lineTo(563, 160)
            .stroke();

        // Add Invoice, Order, and Customer Details
        doc.fontSize(11).font('NotoSans-Italic')
            .text(`Order ID: ${order.id}`, 50, 170)
            .text(`Invoice Date: ${new Date().toDateString()}`, 50, 185)
            .text(`Customer Name: ${order.user.username}`, 50, 200)
            .text(`Contact Number: ${order.shippingAddress.phoneNumber}`, 50, 215)
            .text(`Shipping Address: ${order.shippingAddress.street}, ${order.shippingAddress.city}, ${order.shippingAddress.state}, ${order.shippingAddress.country}, ${order.shippingAddress.zip}`, 50, 230)
            .moveDown();

        doc.moveTo(50, 255)
            .lineTo(563, 255)
            .stroke();

        // Add Product Table Headers
        doc.fontSize(12).font('NotoSans-Bold')
            .text('Product', 50, 260)
            .text('Qty', 290, 260)
            .text('Price (₹)', 330, 260)
            .text('MRP (₹)', 400, 260)
            .text('Offer', 470, 260)
            .text('Total (₹)', 50, 260, { align: 'right' })
            .moveDown();

        doc.moveTo(50, 280)
            .lineTo(563, 280)
            .stroke();

        let yPosition = 290;
        order.items.forEach(item => {
            if ((item.quantity * item.price) === item.priceAfterDiscount) {
                doc.font('NotoSans').fontSize(11)
                    .text(item.variant.productId.productName, 50, yPosition, { continued: true });

                doc.fontSize(8)
                    .text(` ${item.variant.color}`, doc.x, yPosition + 3);

                doc.fontSize(11)
                    .text(item.quantity, 290, yPosition)
                    .text(item.variant.price, 330, yPosition)
                    .text((item.quantity) * (item.variant.price), 400, yPosition)
                    .text(`-`, 470, yPosition)
                    .text(`${(item.priceAfterDiscount)}`, 50, yPosition, { align: 'right' });
                yPosition += 20;

            } else {
                doc.font('NotoSans').fontSize(11)
                    .text(item.variant.productId.productName, 50, yPosition, { continued: true });

                doc.fontSize(8)
                    .text(` ${item.variant.color}`, doc.x, yPosition + 3);

                doc.fontSize(11)
                    .text(item.quantity, 290, yPosition)
                    .text(item.variant.price, 330, yPosition)
                    .text((item.quantity) * (item.variant.price), 400, yPosition)
                    .text(`${parseInt(100 - ((((item.priceAfterDiscount) / (item.quantity)) * (100)) / (item.price)))}%`, 470, yPosition)
                    .text(`${(item.priceAfterDiscount)}`, 50, yPosition, { align: 'right' });
                yPosition += 20;
            }

        });

        doc.moveTo(50, yPosition)
            .lineTo(563, yPosition)
            .stroke();

        const subTotalAmount = order.totalAmount - order.deliveryCharge;
        // Add Order Summary
        yPosition += 20; 
        doc.font('NotoSans-Bold')
            .fontSize(12)
            .text(`Subtotal: ₹${(subTotalAmount).toFixed(2)}`, 50, yPosition, { align: 'right' });

        if (order.coupon.code) {
            const discountAmount = (order.totalAmount - order.amountAfterDiscount) - order.deliveryCharge
            doc.fontSize(11).text(`Coupon Reduction (${order.coupon.code}): -₹${(discountAmount).toFixed(2)}`, { align: 'right' });
        } else {
            doc.font('NotoSans-Italic').fontSize(10).text(`No coupons applied!`, { align: 'right' });
        }

        if (order.deliveryCharge != 0) {
            doc.fontSize(11).text(`Delivery Charge: ₹${order.deliveryCharge.toFixed(2)}`, { align: 'right' });
        }

        const lastAmount = order.amountAfterDiscount + order.deliveryCharge

        doc.fontSize(17).font('NotoSans-Bold')
            .text(`Grand Total: ₹${lastAmount.toFixed(2)}`, { align: 'right' }).moveDown();

        doc.moveTo(50, yPosition + 78)
            .lineTo(563, yPosition + 78)
            .stroke();

        const signaturePath = path.resolve(__dirname, '..', 'public', 'images', 'my_signature.png');
        doc.fontSize(12).text('Thank you for your business!', 50, yPosition + 90)
            .fontSize(7).font('NotoSans-Italic').text('*This is a computer generated Invoice', 50, yPosition + 150, { align: 'center' })

        doc.end();

    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
};


// Add a new review
const addReview = async (req, res) => {
    const { variantId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    try {
        // Validate inputs
        if (!rating || rating < 0 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 0 and 5.' });
        }
        if (!comment || comment.trim() === "") {
            return res.status(400).json({ success: false, message: 'Descripion cannot be empty.' });
        }

        // Check if the variant exists
        const variant = await Variants.findById(variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found.' });
        }

        // Check if the user already reviewed this variant
        const existingReview = variant.reviews.find(review => review.author.toString() === userId.toString());
        if (existingReview) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product.' });
        }

        // Add the review
        const newReview = {
            author: userId,
            rating,
            comment,
            createdAt: Date.now()
        };
        variant.reviews.push(newReview);

        // Update variant's rating based on the new review
        variant.rating = variant.reviews.reduce((acc, review) => acc + review.rating, 0) / variant.reviews.length;

        await variant.save();
        return res.status(200).json({ success: true, message: 'Review added successfully.', variant });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
    }
};


// Edit an existing review
const editReview = async (req, res) => {
    const { variantId, reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    try {
        // Validate inputs
        if (!rating || rating < 0 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 0 and 5.' });
        }
        if (!comment || comment.trim() === "") {
            return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });
        }

        // Check if the variant exists
        const variant = await Variants.findById(variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found.' });
        }

        // Find the review
        const review = variant.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        // Check if the current user is the author of the review
        if (review.author.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'You are not authorized to edit this review.' });
        }

        // Update the review
        review.rating = rating;
        review.comment = comment;
        review.createdAt = Date.now(); // Update review date

        // Update variant's rating based on the edited review
        variant.rating = variant.reviews.reduce((acc, review) => acc + review.rating, 0) / variant.reviews.length;

        await variant.save();
        return res.status(200).json({ success: true, message: 'Review updated successfully.', variant });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
    }
};


const deleteReview = async (req, res) => {
    const { variantId, reviewId } = req.params;
    const userId = req.user.id;

    try {
        // Check if the variant exists
        const variant = await Variants.findById(variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found.' });
        }

        // Find the review
        const review = variant.reviews.id(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        // Check if the current user is the author of the review
        if (review.author.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this review.' });
        }

        // Remove the review
        variant.reviews.pull(reviewId);

        // Update variant's rating after the review is removed
        if (variant.reviews.length > 0) {
            variant.rating = variant.reviews.reduce((acc, review) => acc + review.rating, 0) / variant.reviews.length;
        } else {
            variant.rating = 0; // No reviews left
        }

        await variant.save();
        return res.status(200).json({ success: true, message: 'Review deleted successfully.', variant });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error.', error: error.message });
    }
};


const getReviewsPage = async (req, res) => {
    if(!req.user){
        return res.redirect('/login')
    }
    try {
        const userId = req.user.id;
        const user = await User.findById(userId)
        // Find all variants where the user has submitted a review
        const variantsWithReviews = await Variants.find({ "reviews.author": userId })
          .populate({
            path: 'reviews.author',
            select: 'name',
          })
          .populate({
            path: 'productId', // Populate product details
            select: 'productName price brand', // Select fields you want to show from the product schema
          })
          .lean();
    

        if (!variantsWithReviews || variantsWithReviews.length === 0) {
          return res.render('user/userReviews', { userReviews: [] });
        }
    
        const userReviews = variantsWithReviews.map(variant => {
          if (variant.reviews && variant.reviews.length > 0) {
            return {
                variantId:variant._id,
                images:variant.variantImages,
              product: variant.productId, // Now this will contain the populated product details
              reviews: variant.reviews.filter(review => review.author && review.author._id.toString() === userId.toString())
            };
          }
          return null;
        }).filter(reviewObj => reviewObj !== null);
    
      res.render('user/userReviews', { userReviews, user, currentUrl:req.originalUrl });
    } catch (error) {
      res.status(500).send("Internal Server Error");
    }
  };

module.exports = {
    successGoogleLogin,
    failureGoogleLogin,
    registerUser,
    authUser,
    logout,
    getHomePage,
    getShopPage,
    getProductDetailsPage,
    getRegisterPage,
    getLoginPage,
    getForgotPage,
    getOTPPage,
    verifyOTP,
    resendOTPVerification,
    getResetPasswordPage,
    sendForgotOTP,
    forgotVerifyOTP,
    resetPassword,
    getForgotOTPPage,
    getUserProfile,
    updateProfile,
    getAddressPage,
    updateAddress,
    addAddress,
    removeAddress,
    getCartPage,
    getUserResetPasswordPage,
    userResetPassword,
    addToCart,
    listCartProducts,
    removeFromCart,
    updateCartItemQuantity,
    checkVariantStocks,
    proceedToCheckout,
    getCheckoutPage,
    addAddressCheckout,
    placeOrder,
    cancelOrder,
    listUserOrders,
    getOrderDetails,
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    applyCoupon,
    removeCoupon,
    verifyPayment,
    createRazorpayOrder,
    orderSuccessPage,
    getWalletPage,
    getCouponsPage,
    returnOrder,
    paymentFailedPost,
    paymentFailedGet,
    retryPayment,
    updateRazorPayOrder,
    retryOrderSuccessPage,
    generateInvoicePDF,
    addReview,
    editReview,
    deleteReview,
    getReviewsPage
};
