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
    getAddressPage,
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
    addAddressCheckout,
    addReview,
    editReview,
    deleteReview,
    getReviewsPage
    
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
router.get('/shop',authMiddleware, getShopPage);
router.get('/shop/product/:id', authMiddleware, getProductDetailsPage);

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
router.post('/profile/edit', authMiddleware, updateProfile);

router.get('/profile/address', authMiddleware, getAddressPage);
router.post('/profile/address/add',authMiddleware, addAddress)
router.put('/profile/address/update/:addressId', authMiddleware, updateAddress);

router.post('/profile/address/remove/:addressId', authMiddleware, removeAddress);
router.get('/profile/resetPassword', authMiddleware, getUserResetPasswordPage);
router.post('/profile/resetPassword', authMiddleware, userResetPassword);


router.post('/cart/add', authMiddleware, addToCart);
router.get('/cart', authMiddleware, listCartProducts);
router.post('/cart/update/:variantId', authMiddleware, updateCartItemQuantity);
router.get('/product/variant/:variantId/stock',authMiddleware, checkVariantStocks)
router.post('/cart/remove/:variantId', authMiddleware, removeFromCart)

router.get('/checkout', authMiddleware, getCheckoutPage)
router.post('/checkout', authMiddleware, proceedToCheckout)



router.post('/order/submit', authMiddleware, placeOrder);
router.get('/orders', authMiddleware, listUserOrders);
router.get('/orders/:orderId', authMiddleware, getOrderDetails);
router.post('/orders/:orderId/cancel', authMiddleware, cancelOrder);
router.post('/profile/address/addFromCheckout', authMiddleware, addAddressCheckout);



router.get('/wishlist', authMiddleware, getWishlist); // View Wishlist
router.post('/wishlist/add/:productId', authMiddleware, addToWishlist); // Add to Wishlist
router.post('/wishlist/remove/:productId', authMiddleware, removeFromWishlist);


router.post('/applyCoupon', authMiddleware, applyCoupon);
router.post('/removeCoupon', authMiddleware, removeCoupon);


router.get('/wallet',authMiddleware, getWalletPage)
router.get('/coupons',authMiddleware, getCouponsPage)

router.post('/orders/:orderId/return',authMiddleware, returnOrder);

router.post('/verify-payment',authMiddleware, verifyPayment);
router.post('/create-razorpay-order',authMiddleware, createRazorpayOrder);
router.get('/order-success',authMiddleware, orderSuccessPage)
router.get('/order-success/:orderId',authMiddleware, retryOrderSuccessPage)
router.post('/order-failed',paymentFailedPost) 
router.get('/order-failed', authMiddleware, paymentFailedGet) 
router.get('/retry-payment/:orderId', retryPayment)
router.post('/update-razorpay-order', updateRazorPayOrder)


router.get('/download-invoice/:orderId',authMiddleware, generateInvoicePDF)


// add edit delete reviews
router.post('/shop/product/:variantId/reviews', authMiddleware, addReview)
router.post('/shop/product/:variantId/reviews/:reviewId/edit', authMiddleware, editReview)
router.post('/shop/product/:variantId/reviews/:reviewId/delete', authMiddleware, deleteReview);
router.get('/reviews', authMiddleware, getReviewsPage);

module.exports = router;
