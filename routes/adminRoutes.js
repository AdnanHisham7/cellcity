const express = require('express');
const router = express.Router();
const {upload, single} = require('../middleware/upload');

const { 
    adminAuth,
    logout,
    getAdminLoginPage,
    getAdminPanel,
    getForgotPage,
    resetPassword,
    getForgotOTPPage,
    sendForgotOTP,
    forgotVerifyOTP,
    getResetPasswordPage,
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
    deleteVariantImage,
    getEditImagesPage,
    editVariantImages,
    changeVariantImage,
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
    getOffersPage,
    getProductOffersPage,
    getBrandOffersPage,
    addOffer,
    removeOffer,
    generateReport,
    getAllOrdersGraph,
    getOverallStats,
    getBestAnalytics,
} = require('../controllers/adminController');

const { authMiddleware } = require('../middleware/auth');
const { generateInvoicePDF } = require('../controllers/userController');

// Admin routes
router.get('/login', authMiddleware, getAdminLoginPage);
router.post('/login', authMiddleware, adminAuth);

router.get('/forgot', getForgotPage);
router.post('/forgot', sendForgotOTP);
router.get('/forgotOTP', getForgotOTPPage);
router.post('/forgotVerifyOTP', forgotVerifyOTP);
router.get('/resetPassword', getResetPasswordPage);
router.post('/resetPassword', resetPassword);

router.get('/logout', logout);


router.get('/users', authMiddleware, getUsersPage);
router.get('/users/:id', authMiddleware, getUserDetails);
router.post('/users/action/:userId', authMiddleware, takeUserAction);

router.get('/products', authMiddleware, getProductsPage);
router.post('/products/add', upload, authMiddleware, addProducts);
router.get('/products/:id', authMiddleware, getProductDetails);
router.put('/products/:id', authMiddleware, updateProductDetails);
router.post('/products/action/:productId', authMiddleware, takeProductAction);


//rotes for variants
router.get('/products/:productId/variants', authMiddleware, getVariantsPage)
router.post('/products/:productId/variants/add-variants', upload, authMiddleware, addVariant);
router.get('/products/:productId/variants/:variantId', authMiddleware, getVariantDetails);
router.put('/products/:productId/variants/:variantId', authMiddleware, updateVariantDetails);
router.post('/variants/action/:variantId', authMiddleware, takeVariantAction);


// routes for updating product images
router.get('/:productId/edit-images/:variantId', authMiddleware, getEditImagesPage);
router.post('/upload-images/:id', upload, authMiddleware, editVariantImages);
router.post('/:productId/delete-image/:variantId', authMiddleware, deleteVariantImage);
router.post('/:productId/change-image/:variantId', single, authMiddleware, changeVariantImage);




router.get('/brands', authMiddleware, getBrandsPage);
router.post('/brands/add', authMiddleware, addBrands);
router.get('/brands/:id', authMiddleware, getBrandDetails);
router.put('/brands/:id', authMiddleware, updateBrandDetails);
router.post('/brands/action/:brandId', authMiddleware, takeBrandAction);




router.get('/orders', listAdminOrders);
router.get('/orders/:orderId', getOrderDetails);
router.post('/orders/:orderId/status', updateOrderStatus);


router.get('/coupons',authMiddleware, getAllCoupons);
router.get('/coupons/:id', authMiddleware, getCouponDetails);
router.put('/coupons/:id', authMiddleware, updateCouponDetails);

router.post('/coupons/add', addCoupon);
router.put('/coupons/:id', authMiddleware, editCoupon);
router.post('/coupons/edit/:couponId', editCoupon);
router.post('/coupons/action/:couponId', authMiddleware, takeCouponAction);
router.get('/coupons/delete/:couponId', deleteCoupon);

router.get('/offers', getOffersPage);
router.post('/add-offer', addOffer)
router.get('/product-offers', getProductOffersPage);
router.get('/brand-offers', getBrandOffersPage);

router.post('/remove-offer', removeOffer);


router.get('/', authMiddleware, getAdminPanel);
router.post('/dashboard/generate-report',generateReport)
router.get('/fetch-all-orders', getAllOrdersGraph)
router.get('/overall-stats', getOverallStats);
router.get('/best-analytics', getBestAnalytics );

module.exports = router;
