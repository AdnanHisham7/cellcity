const validator = require('validator');

const validateName = (name) => {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return { valid: false, message: 'Name is required and cannot be empty.' };
    }
    if (!/^[a-zA-Z\s]+$/.test(name)) {
        return { valid: false, message: 'Name can only contain alphabets and spaces.' };
    }
    if (name.length < 2 || name.length > 50) {
        return { valid: false, message: 'Name must be between 2 and 50 characters.' };
    }
    return { valid: true };
};

const validateStrongPassword = (password) => {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'Password is required.' };
    }
    password = password.trim(); // Add this line to remove any leading/trailing spaces
    const options = {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 0,
    };

    if (!validator.isStrongPassword(password, options)) {
        return { valid: false, message: 'Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number.' };
    }
    return { valid: true };
};


const validateEmail = (email) => {
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        return { valid: false, message: 'Email is required.' };
    }
    if (!validator.isEmail(email)) {
        return { valid: false, message: 'Invalid email format.' };
    }
    return { valid: true };
};

const validateProductStock = (stock) => {
    if (stock === undefined || stock === null) {
        return { valid: false, message: 'Stock is required.' };
    }
    if (!Number.isInteger(stock) || stock < 0) {
        return { valid: false, message: 'Stock must be a non-negative integer.' };
    }
    return { valid: true };
};

const validateProductQuantity = (quantity) => {
    if (quantity === undefined || quantity === null) {
        return { valid: false, message: 'Quantity is required.' };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
        return { valid: false, message: 'Quantity must be a positive integer.' };
    }
    return { valid: true };
};

const validateProductPrice = (price) => {
    if (price === undefined || price === null) {
        return { valid: false, message: 'Price is required.' };
    }
    if (typeof price !== 'number' || price <= 0) {
        return { valid: false, message: 'Price must be a positive number.' };
    }
    return { valid: true };
};

const validateProductDescription = (description) => {
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
        return { valid: false, message: 'Product description is required.' };
    }
    if (description.length < 10 || description.length > 1000) {
        return { valid: false, message: 'Product description must be between 10 and 1000 characters.' };
    }
    return { valid: true };
};

const validatePhoneNumber = (phoneNumber) => {
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
        return { valid: false, message: 'Phone number is required.' };
    }
    if (!validator.isMobilePhone(phoneNumber, 'any')) {
        return { valid: false, message: 'Invalid phone number format.' };
    }
    return { valid: true };
};

const validateZipCode = (zipCode) => {
    if (!zipCode || typeof zipCode !== 'string' || zipCode.trim().length === 0) {
        return { valid: false, message: 'ZIP code is required.' };
    }
    const zipCodePattern = /^\d{6}$/; // Indian ZIP code format
    if (!zipCodePattern.test(zipCode)) {
        return { valid: false, message: 'Invalid ZIP code format. Must be exactly 6 digits.' };
    }
    return { valid: true };
};

module.exports = {
    validateName,
    validateStrongPassword,
    validateEmail,
    validateProductStock,
    validateProductQuantity,
    validateProductPrice,
    validateProductDescription,
    validatePhoneNumber,
    validateZipCode
};
