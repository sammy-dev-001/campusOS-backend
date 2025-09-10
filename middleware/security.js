import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';

// Rate limiting
const limiter = rateLimit({
  max: 1000, // 1000 requests per windowMs
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!'
});

// Security headers
const securityHeaders = [
  helmet(),
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.cloudinary.com']
    }
  }),
  helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }),
  helmet.frameguard({ action: 'deny' }),
  helmet.xssFilter(),
  helmet.noSniff(),
  helmet.hidePoweredBy()
];

// Data sanitization
const sanitization = [
  mongoSanitize(),
  xss(),
  hpp({
    whitelist: [
      'duration', 'ratingsQuantity', 'ratingsAverage', 'maxGroupSize', 
      'difficulty', 'price', 'sort', 'limit', 'page'
    ]
  })
];

export { limiter, securityHeaders, sanitization };
