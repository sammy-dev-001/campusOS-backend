import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';

// Dynamic import for pdf-parse (CommonJS module)
let pdfParse;
const loadPdfParse = async () => {
    if (!pdfParse) {
        const module = await import('pdf-parse/lib/pdf-parse.js');
        pdfParse = module.default;
    }
    return pdfParse;
};

const router = express.Router();

// Configure multer for memory storage (we just need the buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB max
    },
    fileFilter: (req, file, cb) => {
        // Only allow PDF files
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    },
});

// Maximum characters to extract (approx. 5-7 pages)
const MAX_TEXT_LENGTH = 15000;

/**
 * Sanitize extracted text
 * - Remove excessive newlines
 * - Remove weird formatting
 * - Trim whitespace
 */
const sanitizeText = (text) => {
    if (!text) return '';

    return text
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove excessive newlines (more than 2 consecutive)
        .replace(/\n{3,}/g, '\n\n')
        // Remove excessive spaces
        .replace(/ {3,}/g, '  ')
        // Remove null characters and other control characters
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Trim whitespace
        .trim();
};

/**
 * POST /api/chat/extract-pdf
 * Extract text from an uploaded PDF file
 * 
 * Request: multipart/form-data with 'file' field containing PDF
 * Response: { status: 'success', data: { filename, extracted_text } }
 */
router.post('/extract-pdf', auth, upload.single('file'), async (req, res) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'No PDF file uploaded. Please upload a PDF file.',
            });
        }

        const { originalname, buffer } = req.file;

        console.log(`[PDF Extract] Processing file: ${originalname}, Size: ${buffer.length} bytes`);

        // Load pdf-parse dynamically
        const parse = await loadPdfParse();

        // Extract text from PDF
        let pdfData;
        try {
            pdfData = await parse(buffer);
        } catch (parseError) {
            console.error('[PDF Extract] Parse error:', parseError);
            return res.status(400).json({
                status: 'error',
                message: 'Failed to parse PDF. The file may be corrupted or password-protected.',
            });
        }

        // Get extracted text
        let extractedText = pdfData.text || '';

        // Sanitize the text
        extractedText = sanitizeText(extractedText);

        // Check if any text was extracted
        if (!extractedText || extractedText.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No text could be extracted from this PDF. It may be an image-based or scanned PDF.',
            });
        }

        // Truncate if too long (to prevent token limit issues with AI)
        const isTruncated = extractedText.length > MAX_TEXT_LENGTH;
        if (isTruncated) {
            extractedText = extractedText.substring(0, MAX_TEXT_LENGTH);
            // Try to end at a sentence or paragraph break
            const lastPeriod = extractedText.lastIndexOf('.');
            const lastNewline = extractedText.lastIndexOf('\n');
            const breakPoint = Math.max(lastPeriod, lastNewline);
            if (breakPoint > MAX_TEXT_LENGTH * 0.8) {
                extractedText = extractedText.substring(0, breakPoint + 1);
            }
            extractedText += '\n\n[... Text truncated for processing ...]';
        }

        console.log(`[PDF Extract] Successfully extracted ${extractedText.length} characters from ${originalname}${isTruncated ? ' (truncated)' : ''}`);

        // Return success response
        res.json({
            status: 'success',
            data: {
                filename: originalname,
                extracted_text: extractedText,
                page_count: pdfData.numpages || 0,
                truncated: isTruncated,
                original_length: pdfData.text?.length || 0,
            },
        });

    } catch (error) {
        console.error('[PDF Extract] Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while processing the PDF.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                status: 'error',
                message: 'File too large. Maximum size is 20MB.',
            });
        }
        return res.status(400).json({
            status: 'error',
            message: error.message,
        });
    }

    if (error.message === 'Only PDF files are allowed') {
        return res.status(400).json({
            status: 'error',
            message: 'Only PDF files are allowed. Please upload a .pdf file.',
        });
    }

    next(error);
});

export default router;
