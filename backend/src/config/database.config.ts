import { registerAs } from '@nestjs/config';

/**
 * Named config namespace: 'database'
 * Access via: configService.get('database.url')
 */
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));
