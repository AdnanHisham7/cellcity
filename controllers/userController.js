const User = require('../models/userModel');
const Products = require('../models/productsModel');
const Variants = require('../models/variantsModel');
const Brands = require('../models/brandsModel');
const Cart = require('../models/cartModel')
const Order = require('../models/orderModel')
const userOTPVerification = require('../models/userOtpVerification');
const TempUser = require('../models/tempUserModel');
const mongoose = require('mongoose');

const { validateName, validateEmail, validateStrongPassword, validatePhoneNumber, validateZipCode } = require('../public/js/validate');

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
        process.env.JWT_SECRET, // Secret key from your environment variables
        { expiresIn: '1h' } // Set expiration as needed
    );

    // Send the token back to the client
    res.cookie('token', token, { httpOnly: true }); // Secure: true in production with HTTPS
    res.redirect('/');
};

const failureGoogleLogin = (req, res) => {
    res.send("Error");
};


const registerUser = async (req, res) => {
    const { email, username, password, cpassword } = req.body;

    // Check if all required fields are present and not empty
    if (!username || !email || !password || !cpassword) {
        return res.render('signup', { error: 'All fields are required.' });
    }

    // Validate username
    const usernameValidation = validateName(username);
    if (!usernameValidation.valid) {
        return res.render('signup', { error: usernameValidation.message });
    }

    //validate Email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return res.render('signup', { error: emailValidation.message });
    }

    // Validate password
    const passwordValidation = validateStrongPassword(password);
    if (!passwordValidation.valid) {
        return res.render('signup', { error: passwordValidation.message });
    }

    // Check if passwords match
    if (password !== cpassword) {
        return res.render('signup', { error: 'Passwords should match' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email }) || await TempUser.findOne({ email });
    if (userExists) {
        return res.render('signup', { error: 'User already exists' });
    }

    try {
        //creating temorary user and sending an OTP
        const tempUser = await TempUser.create({ username, email, password });
        await sendOTPVerificationEmail(tempUser._id, email, res);
    } catch (error) {
        console.error(error);
        res.render('signup', { error: 'Server error' });
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
            res.render('signup', {
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
                            const newUser = new User({
                                username: tempUser.username,
                                email: tempUser.email,
                                password: tempUser.password,
                                createdAt: Date.now(),
                            });
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

        if (isLoggedIn) {
            console.log('Logged in as:', req.user);
            return res.render('home', { user: req.user, variants, isLoggedIn });
        } else {
            console.log('Not logged in');
            return res.render('home', { user: req.user, variants, isLoggedIn });
        }
    } catch (error) {
        console.error('Error fetching home page data:', error);
        return res.status(500).send('An error occurred while loading the home page.');
    }
};

// const { sortBy } = req.query;
// let sortCondition = {};
//     let filterCondition = {};

// Sorting Logic
// if (sortBy === '1') {
//     sortCondition.price = 1; // Price Low to High
// } else if (sortBy === '2') {
//     sortCondition.price = -1; // Price High to Low
// }

//     // Filtering Logic
//     if (brands) {
//         filterCondition.brand = { $in: brands.split(',') };
//     }

//     // Fetch variants and populate product details
//     const variants = await Variants.find(filterCondition)
//         .populate('productId') // Populate the product details
//         .sort(sortCondition)
//         .exec();

//     res.render('shop', { user: req.user, variants });

const getShopPage = async (req, res) => {
    try {
        const { sortBy } = req.query;
        let sortCondition = {};

        if (sortBy === 'asc') {
            sortCondition.price = 1; // Price Low to High
        } else if (sortBy === 'dsc') {
            sortCondition.price = -1; // Price High to Low
        } else if (sortBy === 'alpha-asc') {
            sortCondition['productId.productName'] = 1;  // Aa-Zz
        } else if (sortBy === 'alpha-dsc') {
            sortCondition['productId.productName'] = -1;  // Zz-Aa
        }

        const brands = await Brands.find();
        const page = parseInt(req.query.page) || 1;
        const pageSize = 12;
        const skip = (page - 1) * pageSize;
        const totalProducts = await Variants.countDocuments();

        const variants = await Variants.find()
            .skip(skip)
            .limit(pageSize)
            .populate({
                path: 'productId',
                select: 'productName brand'
            })
            .sort(sortCondition);

        res.render('shop', {
            brands,
            variants,
            sortBy, // Pass the sortBy value to the template
            currentPage: page,
            totalPages: Math.ceil(totalProducts / pageSize),
            totalProducts,
            startIndex: skip + 1,
            endIndex: Math.min(skip + pageSize, totalProducts)
        });
    } catch (error) {
        console.error('Error fetching shop page data:', error);
        res.status(500).send('Server Error');
    }
};




const getProductDetailsPage = async (req, res) => {
    try {
        const { id } = req.params; // Variant ID from URL params
        console.log(id)
        // Find the variant by ID and populate the associated product details
        const variant = await Variants.findById(id).populate('productId').exec();
        if (!variant) {
            return res.status(404).send('Variant not found');
        }
        const productId = variant.productId;
        const product = await Products.findById(productId)
            .populate('variants') // Populate all variants related to the product
            .exec();
        // Directly access the populated product
        // console.log(product)
        // console.log(variant)
        console.log(variant)
        // Render the variant details page with the necessary data
        res.render('product-details', { user: req.user, variant, product });
    } catch (error) {
        console.error('Error fetching variant details:', error);
        res.status(500).send('Server Error');
    }
};







const getRegisterPage = async (req, res) => {
    res.render('signup', { error: null });
};

const getLoginPage = async (req, res) => {
    if (req.user) {
        return res.redirect('/') // Redirect if user is already logged in
    }
    res.render('login', { error: null });
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
            res.render('signup', {
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
    res.render('forgot', { error: null });

};

const sendForgotOTP = async (req, res) => {
    const { email } = req.body;
    console.log('Initiating forgot OTP process for:', email); // Add this line
    const user = await User.findOne({ email });

    if (!user) {
        return res.render('forgot', { error: 'No user found in the database' });
    }

    try {
        await sendForgotOTPVerificationEmail(user._id, email, res);
    } catch (error) {
        console.error(error);
        res.render('forgot', { error: 'Server error' });
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
    res.render('forgotOTP', { userId, email, error: null });
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
        res.render('resetPassword', { userId, email, error: null });
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

        // Set the new password (assuming password hashing is done in a pre-save hook)
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
    return res.render('OTP', { userId, email, error: null });
};

const getCartPage = async (req, res) => {
    if (req.user) {
        return res.render('shopping-cart')
    }
    res.redirect('/login')
};


const getUserProfile = async (req, res) => {
    if (req.user) {
        const user = await User.findById(req.user.id)
        return res.render('profile', { user, currentUrl: req.originalUrl })
    }
    res.redirect('/login')
};

const getEditProfilePage = async (req, res) => {
    if (req.user) {
        const user = await User.findById(req.user.id)
        return res.render('edit-profile', { user })
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
        console.error(error);
        res.status(500).send('Server Error');
    }
};


const getAddressPage = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
        res.render('address', { user, currentUrl: req.originalUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

const getAddAddressPage = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('address');
        res.render('add-address', { address: user.address });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

const getEditAddressPage = async (req, res) => {
    const userId = req.user.id;
    const addressId = req.params.addressId;

    try {
        if (req.user) {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            const address = user.addresses.id(addressId);
            if (!address) throw new Error('Address not found');

            return res.render('edit-address', { address });
        } else {
            res.redirect('/login')
        }

    } catch (error) {
        res.status(500).send('Error loading address: ' + error.message);
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
        console.error(error);
        res.status(500).json({ errors: { general: 'Error adding address: ' + error.message } });
    }
};



const updateAddress = async (req, res) => {
    const userId = req.user.id;
    const addressId = req.params.addressId;
    const updatedAddress = req.body;

    console.log('Received update request:', updatedAddress); // Debugging: Log incoming data

    // Validate Phone Number
    const phoneValidation = validatePhoneNumber(updatedAddress.phoneNumber);
    if (!phoneValidation.valid) {
        console.log('Phone validation failed:', phoneValidation.message); // Log validation error
        return res.status(400).json({ errors: { phoneNumber: phoneValidation.message } });
    }

    // Validate ZIP Code
    const zipCodeValidation = validateZipCode(updatedAddress.zip);
    if (!zipCodeValidation.valid) {
        console.log('ZIP validation failed:', zipCodeValidation.message); // Log validation error
        return res.status(400).json({ errors: { zip: zipCodeValidation.message } });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found'); // Log error
            return res.status(404).json({ errors: { general: 'User not found' } });
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            console.log('Address not found'); // Log error
            return res.status(404).json({ errors: { general: 'Address not found' } });
        }

        // Update the address fields
        address.set(updatedAddress);
        await user.save();

        res.status(200).json({ success: true, message: 'Address updated successfully' });
    } catch (error) {
        console.error('Error updating address:', error.message); // Log error
        res.status(500).json({ errors: { general: 'Error updating address: ' + error.message } });
    }
};







const removeAddress = async (req, res) => {
    const userId = req.user.id;
    const addressId = req.params.addressId;
    console.log(req.params)
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
            return res.render('userResetPassword', { currentUrl: req.originalUrl });
        }
        res.redirect('/profile')

    } catch (error) {
        console.error('Error rendering reset password page:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const userResetPassword = async (req, res) => {
    const userId = req.user.id;
    try {
        const { password, cpassword } = req.body;
        if (!password || !cpassword) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const passwordValidation = validateStrongPassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ error: passwordValidation.message });
        }

        if (password !== cpassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }



        const user = await User.findById(userId);
        user.password = password;
        await user.save();
        res.redirect('/profile')

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

const addToCart = async (req, res) => {
    if (!req.user) {
        return res.redirect('/login')
    }
    // const { variantId, quantity } = req.body;
    const { variantId } = req.body;

    const userId = req.user.id;
    try {
        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            cart = new Cart({ user: userId, items: [] });
        }

        const itemIndex = cart.items.findIndex(item => item.variant.toString() === variantId);

        if (itemIndex !== -1) {
            // Item is already in the cart
            // cart.items[itemIndex].quantity += Number(quantity);
            // await cart.save();
            // req.flash('info', 'Item already in cart. Quantity updated.');
            req.flash('info', 'Item already in cart.');
        } else {
            // Item is not in the cart, so add it
            // cart.items.push({ variant: variantId, quantity: Number(quantity) });
            cart.items.push({ variant: variantId });
            await cart.save();
            req.flash('success', 'Item added to cart successfully.');
        }

        res.redirect(`/shop/product/${variantId}`); // Redirect to the product page or cart
    } catch (error) {
        res.status(500).json({ message: 'Error adding variant to cart', error });
    }
};



const listCartProducts = async (req, res) => {
    if (!req.user) {
        return res.redirect('/login')
    }
    const userId = req.user.id;

    try {
        // Populate variant and then populate the productId within each variant
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product' // Assuming your product model is named 'Product'
                }
            });

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        res.render('cart', { cart }); // Render the cart EJS view and pass the cart data
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

        // Ensure quantity does not go below 1
        if (newQuantity < 1) {
            return res.status(400).json({ success: false, message: 'Quantity cannot be less than 1' });
        }

        // Ensure quantity does not exceed available stock
        if (newQuantity > availableStock) {
            return res.status(400).json({ success: false, message: `Only ${availableStock} items available in stock` });
        }

        // Ensure quantity does not exceed 10
        if (newQuantity > 10) {
            return res.status(400).json({ success: false, message: 'Quantity limit reached for the product' });
        }

        // Update the quantity
        cart.items[itemIndex].quantity = newQuantity;
        await cart.save();

        res.json({ success: true, message: 'Cart updated successfully' });
    } catch (error) {
        console.error('Error updating cart item quantity:', error);
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
    const userId = req.user.id;

    try {
        // Fetch the user's cart with populated variant details
        // const cart = await Cart.findOne({ user: userId }).populate('items.variant');

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product' // Assuming your product model is named 'Product'
                }
            });

        const user = await User.findById(req.user.id)

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart'); // Redirect to cart if it's empty
        }
        // Render the checkout page with the cart details
        res.render('checkout', { cart, user });
    } catch (error) {
        res.status(500).json({ message: 'Error loading checkout page', error });
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
                    model: 'Product' // Assuming your product model is named 'Product'
                }
            });

        if (!cart || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty.');
            return res.redirect('/cart');
        }

        for (let item of cart.items) {
            const variant = item.variant;

            // Check if the stock is less than the quantity in the cart
            if (variant.stocks < item.quantity) {
                req.flash('error', `Insufficient stock for ${variant.productId.productName}. Available: ${variant.stocks}, Requested: ${item.quantity}`);
                return res.redirect('/cart');
            }
        }

        // If everything is fine, proceed to checkout
        res.redirect('/checkout'); // Replace with your actual checkout page route

    } catch (error) {
        console.error('Error during checkout:', error);
        res.status(500).json({ message: 'Error during checkout', error: error.message || 'Unknown error' });
    }
};



const placeOrder = async (req, res) => {
    const userId = req.user.id;
    const { selectedAddress, street, city, state, country, zip, phoneNumber, paymentMethod } = req.body;

    try {
        // Find the user's cart and populate variant details
        const cart = await Cart.findOne({ user: userId }).populate('items.variant');

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        let shippingAddress;

        if (selectedAddress) {
            // Use the selected address
            const user = await User.findById(userId).select('addresses');
            shippingAddress = user.addresses.id(selectedAddress);
        } else {
            // Use the new address provided in the form
            shippingAddress = {
                street,
                city,
                state,
                country,
                phoneNumber,
                zip
            };

            // Optionally, save the new address to the user's address list
            await User.findByIdAndUpdate(userId, { $push: { addresses: shippingAddress } });
        }

        const totalAmount = cart.items.reduce((acc, item) => acc + item.variant.price * item.quantity, 0);

        // Create the order
        const newOrder = new Order({
            user: userId,
            items: cart.items,
            totalAmount,
            shippingAddress,
            paymentMethod,
            status: 'Pending'
        });

        // Update the stock of each product variant
        for (let item of cart.items) {

            const variant = item.variant;
            variant.stocks -= item.quantity;

            if (variant.stocks < 0) {
                req.flash('error', `Insufficient Stock, <a href="/cart">check the availability of the product</a>`);
                return res.redirect('/checkout');
            }


            await variant.save();  // Save the updated stock count

        }

        await newOrder.save();  // Save the new order

        // Clear the user's cart after placing the order
        cart.items = [];
        await cart.save();
        res.render('order-success')
        // Redirect to the order details page
        // res.redirect(`/orders/${newOrder._id}`);
    } catch (error) {
        console.error('Error placing order:', error);  // Log the error for debugging
        res.status(500).json({ message: 'Error placing order', error: error.message || 'Unknown error' });
    }
};



const cancelOrder = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.status === 'Shipped' || order.status === 'Delivered') {
            return res.status(400).json({ message: 'Cannot cancel an order that has been shipped or delivered' });
        }

        order.status = 'Cancelled';
        await order.save();

        res.redirect('/orders')
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling order', error });
    }
};


const listUserOrders = async (req, res) => {
    const userId = req.user.id;

    try {
        const orders = await Order.find({ user: userId }).populate('items.variant').sort({ createdAt: -1 });

        res.render('orderHistory', { orders, currentUrl: req.originalUrl });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching order history', error });
    }
};


const getOrderDetails = async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;

    try {
        const order = await Order.findOne({ _id: orderId, user: userId })
            .populate({
                path: 'items.variant',
                populate: {
                    path: 'productId',
                    model: 'Product',  // Ensure this matches your Product model name
                    select: 'productName',    // This will only select the product name
                }
            }).populate({
                path: 'user',
                model: 'users',  // Ensure this matches your User model name
                select: 'username', // Select the username field
            });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.render('orderDetails', { order, currentUrl: req.originalUrl });
    } catch (error) {
        console.error('Error fetching order details:', error); // Log the error for debugging
        res.status(500).json({ message: 'Error fetching order details', error: error.message || error });
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
    getEditProfilePage,
    updateProfile,
    getEditAddressPage,
    getAddressPage,
    updateAddress,
    addAddress,
    getAddAddressPage,
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
    placeOrder,
    cancelOrder,
    listUserOrders,
    getOrderDetails
};
// const jwt = require('jsonwebtoken');

// exports.authMiddleware = (role = 'user') => {
//     return (req, res, next) => {
//         const userToken = req.cookies.userToken;
//         const adminToken = req.cookies.adminToken;

//         // Determine which token to use based on the required role
//         const token = role === 'admin' ? adminToken : userToken;

//         if (!token) {
//             // Redirect to login if the required token is missing
//             if (role === 'admin' && req.originalUrl==='/') {
//                 return res.redirect('/admin');
//             } else if (role === 'user' && req.originalUrl==='/admin') {
//                 return res.redirect('/'); // Adjust this if necessary
//             }
//             return next(); // Proceed if no token for non-protected routes
//         }

//         try {
//             // Verify the token and set the appropriate data on req
//             const decoded = jwt.verify(token, process.env.JWT_SECRET);
//             if (role === 'admin') {
//                 req.admin = decoded;
//                 if (req.originalUrl === '/admin/login') {
//                     return res.redirect('/admin');
//                 }
//             } else {
//                 req.user = decoded;
//                 if (req.originalUrl === '/login' || req.originalUrl === '/signup') {
//                     return res.redirect('/');
//                 }
//             }

//             next(); // Proceed to the next middleware/route
//         } catch (err) {
//             console.error('Token verification failed:', err);
//             // Clear the invalid token
//             if (role === 'admin') {
//                 res.clearCookie('adminToken');
//             } else {
//                 res.clearCookie('userToken');
//             }
//             // Redirect to login if necessary
//             if (role === 'admin' && req.originalUrl.startsWith('/admin')) {
//                 return res.redirect('/admin/login');
//             } else if (role === 'user' && req.originalUrl.startsWith('/')) {
//                 return res.redirect('/login');
//             }
//             next(); // Proceed to the next middleware/route (e.g., login page)
//         }
//     };
// };