/**
 * QR Code Reader Utility
 * Reads QR codes from images and extracts TOTP secrets
 */

const { Jimp } = require('jimp');
const jsQR = require('jsqr');
const https = require('https');
const http = require('http');

/**
 * Downloads an image from a URL
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadImage(response.headers.location).then(resolve).catch(reject);
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }
            
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Reads a QR code from an image buffer
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string|null>} QR code content or null
 */
async function readQRCode(imageBuffer) {
    try {
        const image = await Jimp.read(imageBuffer);
        
        // Convert to raw image data for jsQR
        // Jimp 1.x uses image.width, image.height, and image.bitmap.data
        const width = image.width;
        const height = image.height;
        const imageData = new Uint8ClampedArray(image.bitmap.data);
        
        // Decode QR code
        const code = jsQR(imageData, width, height);
        
        if (code) {
            return code.data;
        }
        
        return null;
    } catch (error) {
        throw new Error(`Erro ao processar imagem: ${error.message}`);
    }
}

/**
 * Reads a QR code from a URL
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} QR code content or null
 */
async function readQRCodeFromUrl(url) {
    const imageBuffer = await downloadImage(url);
    return readQRCode(imageBuffer);
}

/**
 * Extracts TOTP secret from an otpauth:// URL
 * @param {string} otpauthUrl - otpauth:// URL from QR code
 * @returns {Object|null} Extracted data or null
 */
function extractTOTPFromUrl(otpauthUrl) {
    if (!otpauthUrl || !otpauthUrl.startsWith('otpauth://')) {
        return null;
    }
    
    try {
        // Parse the otpauth URL
        // Format: otpauth://totp/Label?secret=SECRET&issuer=Issuer
        const url = new URL(otpauthUrl);
        
        if (url.protocol !== 'otpauth:') {
            return null;
        }
        
        const type = url.hostname; // 'totp' or 'hotp'
        const label = decodeURIComponent(url.pathname.slice(1)); // Remove leading /
        const secret = url.searchParams.get('secret');
        const issuer = url.searchParams.get('issuer');
        const algorithm = url.searchParams.get('algorithm') || 'SHA1';
        const digits = parseInt(url.searchParams.get('digits') || '6', 10);
        const period = parseInt(url.searchParams.get('period') || '30', 10);
        
        if (!secret) {
            return null;
        }
        
        // Clean the secret: remove spaces, convert to uppercase
        const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
        
        return {
            type,
            label,
            secret: cleanSecret,
            issuer,
            algorithm,
            digits,
            period
        };
    } catch (error) {
        return null;
    }
}

/**
 * Processes a QR code image and extracts TOTP secret
 * @param {string} imageUrl - URL of the QR code image
 * @returns {Promise<Object>} Result with success/error and data
 */
async function processQRCode(imageUrl) {
    try {
        // Read QR code from image
        const qrContent = await readQRCodeFromUrl(imageUrl);
        
        if (!qrContent) {
            return {
                success: false,
                error: 'Não foi possível ler o QR Code da imagem. Verifique se a imagem está nítida e contém um QR Code válido.'
            };
        }
        
        // Check if it's an otpauth URL
        if (qrContent.startsWith('otpauth://')) {
            const totpData = extractTOTPFromUrl(qrContent);
            
            if (totpData && totpData.secret) {
                return {
                    success: true,
                    data: totpData
                };
            } else {
                return {
                    success: false,
                    error: 'O QR Code não contém um secret TOTP válido.'
                };
            }
        }
        
        // Maybe it's just a raw secret (base32)
        if (/^[A-Z2-7]+=*$/i.test(qrContent)) {
            return {
                success: true,
                data: {
                    type: 'totp',
                    secret: qrContent.toUpperCase(),
                    label: null,
                    issuer: null
                }
            };
        }
        
        return {
            success: false,
            error: 'O QR Code não contém dados de autenticação TOTP válidos.'
        };
        
    } catch (error) {
        return {
            success: false,
            error: `Erro ao processar QR Code: ${error.message}`
        };
    }
}

module.exports = {
    downloadImage,
    readQRCode,
    readQRCodeFromUrl,
    extractTOTPFromUrl,
    processQRCode
};
