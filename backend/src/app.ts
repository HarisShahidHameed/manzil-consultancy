import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { notFound, errorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import clientRoutes from './routes/client.routes';
import groupRoutes from './routes/group.routes';
import visaCaseRoutes from './routes/visaCase.routes';
import invoiceRoutes from './routes/invoice.routes';
import dashboardRoutes from './routes/dashboard.routes';
import apiKeyRoutes from './routes/apiKey.routes';
import publicRoutes from './routes/public.routes';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — strict origin allowlist
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser(env.COOKIE_SECRET));
app.use('/api/clients/import', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Trust proxy for accurate IP behind load balancers
app.set('trust proxy', 1);

// Global rate limit
app.use('/api', apiLimiter);

// Health check (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/cases', visaCaseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/api-keys', apiKeyRoutes);
// Third-party integration surface — API key auth, not user JWT/cookies. See docs/PUBLIC_API.md.
app.use('/api/public/v1', publicRoutes);

// Error handlers
app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await prisma.$connect();
  logger.info('Database connected');

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
};

start().catch(err => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

export default app;
