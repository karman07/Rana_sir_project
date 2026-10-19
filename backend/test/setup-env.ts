// Runs before any test module is imported, so ConfigModule sees these values.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/recruitment_e2e_w${process.env.JEST_WORKER_ID ?? '0'}`;
process.env.AUTH_RATE_LIMIT = '1000';
process.env.UPLOAD_DIR = `./storage/test-w${process.env.JEST_WORKER_ID ?? '0'}`;
process.env.EMAIL_WORKER = 'off';
process.env.RESEND_API_KEY = '';
process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64');
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.EXPORT_RATE_LIMIT = '1000';
process.env.SEARCH_RATE_LIMIT = '1000';
