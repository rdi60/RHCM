import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { Public } from "../common/decorators/public.decorator";
import { SelfService } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { MfaEnableDto, MfaVerifyDto } from "./dto/mfa.dto";
import { PasswordForgotDto, PasswordResetDto } from "./dto/password.dto";
import { DisableMfaDto } from "./dto/disable-mfa.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApiTags } from "@nestjs/swagger";

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined };
}

// Read directly from process.env, not ConfigService: decorator arguments
// evaluate when this module is first required, which happens before Nest
// bootstraps ConfigModule's .env file loading. A real OS-level env var
// (as opposed to a .env file) is still present at this point, which is
// how the e2e test suite raises this limit — see test/env-setup.ts.
const LOGIN_THROTTLE_LIMIT = Number(process.env.AUTH_LOGIN_THROTTLE_LIMIT ?? 10);
const LOGIN_THROTTLE_TTL_MS = Number(process.env.AUTH_LOGIN_THROTTLE_TTL_MS ?? 60_000);
const PASSWORD_THROTTLE_LIMIT = Number(process.env.AUTH_PASSWORD_THROTTLE_LIMIT ?? 5);

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS } })
  @HttpCode(200)
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req, meta(req));
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS } })
  @HttpCode(200)
  @Post("mfa/verify")
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    return this.authService.verifyMfa(dto, req, meta(req));
  }

  @Public()
  @HttpCode(200)
  @Post("logout")
  async logout(@Req() req: Request) {
    await this.authService.logout(req.session, meta(req));
    return { message: "Logged out" };
  }

  @Public()
  @Throttle({ default: { limit: PASSWORD_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS } })
  @HttpCode(200)
  @Post("password/forgot")
  forgotPassword(@Body() dto: PasswordForgotDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: PASSWORD_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL_MS } })
  @HttpCode(200)
  @Post("password/reset")
  resetPassword(@Body() dto: PasswordResetDto) {
    return this.authService.resetPassword(dto);
  }

  @SelfService()
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      access: user.access.map((a) => ({
        entityId: a.entityId,
        entityCode: a.entityCode,
        roleId: a.roleId,
        roleName: a.roleName,
        permissions: Array.from(a.permissions),
      })),
    };
  }

  @SelfService()
  @Post("mfa/setup")
  @HttpCode(200)
  setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupMfa(user.id);
  }

  @SelfService()
  @Post("mfa/enable")
  @HttpCode(200)
  enableMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaEnableDto) {
    return this.authService.enableMfa(user.id, dto);
  }

  @SelfService()
  @Post("mfa/disable")
  @HttpCode(200)
  disableMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableMfaDto) {
    return this.authService.disableMfa(user.id, dto.password);
  }
}
