import { Controller, Get, Query, Req, Res, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleService } from './google.service';
import { Public } from '../../auth/public.decorator';

@Controller('auth/google')
export class GoogleController {
  constructor(private readonly googleService: GoogleService) {}

  @Get()
  async redirectToGoogle(@Req() req: Request, @Res() res: Response) {
    const user = (req as any).user;
    const userId = user.id;

    // Redirect to the Google OAuth consent screen.
    const authorizationUrl = await this.googleService.createOAuthRedirectUrl(userId);
    return res.redirect(authorizationUrl);
  }

  @Public()
  @Get('test')
  async testOAuthRedirect(@Res() res: Response) {
    // For testing: Find or create a single test user
    const testUser = await this.googleService.getOrCreateTestUser();

    // Redirect to the Google OAuth consent screen.
    const authorizationUrl = this.googleService.createOAuthRedirectUrl(testUser.id);
    return res.redirect(authorizationUrl);
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      throw new BadRequestException('Missing OAuth code or state.');
    }

    // Google redirects users back here after consent.
    const googleAccount = await this.googleService.connectWithCode(code, state);

    return res.status(200).json({
      connected: true,
      userId: googleAccount.userId,
      expiresAt: googleAccount.expiryDate,
    });
  }
}
