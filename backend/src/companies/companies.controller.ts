import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SiteContentService } from '../site-content/site-content.service';
import { Role } from '@rms/shared';
import { CurrentUser, RequireApprovedRecruiter, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CompaniesService } from './companies.service';
import { CompanyDecisionDto, CompanyReasonDto, CreateCompanyDto, ListCompaniesQueryDto } from './dto/company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService, private readonly assets: SiteContentService) {}

  @Roles(Role.ADMIN, Role.RECRUITER) @Get()
  list(@Query() q: ListCompaniesQueryDto, @CurrentUser() user: AuthUser) { return this.service.list(q, user); }

  @Roles(Role.RECRUITER) @Get('mine/usable')
  usable(@CurrentUser() user: AuthUser) { return this.service.usableByRecruiter(user.id); }

  @Roles(Role.ADMIN) @Get('counts')
  counts() { return this.service.counts(); }

  @Roles(Role.ADMIN, Role.RECRUITER) @RequireApprovedRecruiter() @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthUser) { return this.service.create(dto, user); }

  @Roles(Role.RECRUITER) @RequireApprovedRecruiter() @HttpCode(200) @Post(':id/request-link')
  requestLink(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) { return this.service.requestLink(id, user); }

  /** Admin uploads a company logo (PNG/JPG/WebP). It is shown on job cards and can be used in the "Trusted by" row. */
  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/logo') @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Param('id', ParseObjectIdPipe) id: string, @UploadedFile() file: { path: string; originalname: string; size: number } | undefined) {
    if (!file) throw new BadRequestException({ message: 'Attach an image', code: 'FILE_REQUIRED' });
    const { url } = await this.assets.storeAsset(file);
    return this.service.setLogo(id, url);
  }

  @Roles(Role.ADMIN) @Delete(':id/logo')
  removeLogo(@Param('id', ParseObjectIdPipe) id: string) { return this.service.setLogo(id, null); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/approve')
  approve(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CompanyDecisionDto, @CurrentUser() admin: AuthUser) { return this.service.approve(id, admin, dto.note); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/reject')
  reject(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CompanyReasonDto, @CurrentUser() admin: AuthUser) { return this.service.reject(id, admin, dto.note); }

  @Roles(Role.ADMIN) @HttpCode(200) @Post(':id/request-changes')
  requestChanges(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: CompanyReasonDto, @CurrentUser() admin: AuthUser) { return this.service.requestChanges(id, admin, dto.note); }
}
