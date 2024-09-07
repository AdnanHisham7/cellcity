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
} = require('../controllers/adminController');

const { authMiddleware } = require('../middleware/auth');

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

router.get('/', authMiddleware, getAdminPanel);

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
module.exports = router;
