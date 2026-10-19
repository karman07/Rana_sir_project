import { BadRequestException, Body, Controller, Get, Param, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@rms/shared';
import type { Response } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../auth/decorators';
import { SiteContentDto } from './site-content.dto';
import { SiteContentService } from './site-content.service';

/** Admin edits the public website here (hero, trusted companies, categories, FAQ, contact details...). */
@Controller('site-content')
@Roles(Role.ADMIN)
export class SiteContentController {
  constructor(private readonly service: SiteContentService) {}

  @Get() get() { return this.service.get(); }
  @Put() update(@Body() dto: SiteContentDto, @CurrentUser() admin: AuthUser) { return this.service.update(dto as never, admin); }

  @Post('assets')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: { path: string; originalname: string; size: number } | undefined) {
    if (!file) throw new BadRequestException({ message: 'Attach an image', code: 'FILE_REQUIRED' });
    return this.service.storeAsset(file);
  }
}

@Controller('public')
@Public()
export class PublicSiteController {
  constructor(private readonly service: SiteContentService) {}

  @Get('site') site() { return this.service.get(); }

  @Get('assets/:name')
  async asset(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    const { mime, stream } = await this.service.openAsset(name);
    res.set({
      'Content-Type': mime,
      // Names are random and never reused, so these can be cached hard. CORP is relaxed so the web app can show them.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    return stream;
  }
}
