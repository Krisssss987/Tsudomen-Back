// cryptoUtil.js
const CryptoJS = require('crypto-js');

// Secret key for encryption
const secretKey = process.env.SECRET_KEY; // You can also load this from environment variables for better security

/**
 * Encrypts data using AES encryption.
 * @param {any} data - The data to encrypt.
 * @returns {string} - The encrypted data as a string.
 */
function encryptData(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
}

/**
 * Decrypts AES encrypted data.
 * @param {string} encryptedData - The encrypted data to decrypt.
 * @returns {any} - The decrypted data.
 */
function decryptData(encryptedData) {
    const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey);
    const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedData);
}

// Export the functions for use in other modules
module.exports = {
    encryptData,
    decryptData,
};
