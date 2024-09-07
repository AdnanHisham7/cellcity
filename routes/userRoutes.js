const express = require('express');
const router = express.Router();
const passport = require('passport'); 
require('../passport');

router.use(passport.initialize()); 
router.use(passport.session());
const {
    successGoogleLogin,
    failureGoogleLogin,
    registerUser,
    authUser,
    logout,
    verifyOTP,
    resendOTPVerification,
    resetPassword,
    getForgotOTPPage,
    sendForgotOTP,
    forgotVerifyOTP,
    getResetPasswordPage,
    getHomePage,
    getShopPage,
    getProductDetailsPage,
    getRegisterPage,
    getLoginPage,
    getForgotPage,
    getOTPPage,
    getUserProfile,
    updateProfile,
    getCartPage,
    getEditProfilePage,
    getAddressPage,
    getEditAddressPage,
    getAddAddressPage,
    updateAddress,
    removeAddress,
    addAddress,
    userResetPassword,
    getUserResetPasswordPage,
    addToCart,
    listCartProducts,
    removeFromCart,
    updateCartItemQuantity,
    checkVariantStocks,
    getCheckoutPage,
    proceedToCheckout,
    placeOrder,
    cancelOrder,
    listUserOrders,
    getOrderDetails
} = require('../controllers/userController');


const { authMiddleware } = require('../middleware/auth');

// Auth 
router.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'email', 'profile'] }));

// Auth Callback 
router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/failure' }),
    successGoogleLogin // Call the success handler on successful authentication
);

// Success 
router.get('/success' , authMiddleware, successGoogleLogin);

// failure 
router.get('/failure' , failureGoogleLogin);

router.get('/login', authMiddleware, getLoginPage);

router.post('/login', authUser);
router.get('/logout', logout);

router.get('/signup', getRegisterPage);
router.post('/signup', registerUser);

router.get('/', authMiddleware, getHomePage);
router.get('/shop', getShopPage);
router.get('/shop/product/:id', getProductDetailsPage);

// router.get('/cart', authMiddleware, getCartPage)

router.get('/forgot', getForgotPage);
router.post('/forgot', sendForgotOTP);

router.get('/forgotOTP', getForgotOTPPage);
router.post('/forgotVerifyOTP', forgotVerifyOTP);


router.get('/resetPassword', getResetPasswordPage);
router.post('/resetPassword', resetPassword);

router.get('/verifyOTP', getOTPPage);
router.post('/verifyOTP', verifyOTP);

router.post('/resendOTP', resendOTPVerification);

router.get('/profile', authMiddleware, getUserProfile);
router.get('/profile/edit', authMiddleware, getEditProfilePage);
router.post('/profile/edit', authMiddleware, updateProfile);

router.get('/profile/address', authMiddleware, getAddressPage);
router.get('/profile/address/edit/:addressId', authMiddleware,getEditAddressPage );
router.get('/profile/address/add',authMiddleware, getAddAddressPage)
router.post('/profile/address/add',authMiddleware, addAddress)
router.put('/profile/address/update/:addressId', authMiddleware, updateAddress);

router.post('/profile/address/remove/:addressId', authMiddleware, removeAddress);
router.get('/profile/resetPassword', authMiddleware, getUserResetPasswordPage);
router.post('/profile/resetPassword', authMiddleware, userResetPassword);

router.post('/cart/add', authMiddleware, addToCart);
router.get('/cart', authMiddleware, listCartProducts)
router.post('/cart/remove/:variantId', authMiddleware, removeFromCart)
router.get('/checkout', authMiddleware, getCheckoutPage)
router.post('/checkout', authMiddleware, proceedToCheckout)

router.post('/cart/update/:variantId', authMiddleware, updateCartItemQuantity);


router.post('/order/submit', authMiddleware, placeOrder);
router.get('/orders', authMiddleware, listUserOrders);
router.get('/orders/:orderId', authMiddleware, getOrderDetails);
router.post('/orders/:orderId/cancel', authMiddleware, cancelOrder);

router.get('/product/variant/:variantId/stock',authMiddleware, checkVariantStocks)


module.exports = router;
