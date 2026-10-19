import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PublicSiteController, SiteContentController } from './site-content.controller';
import { SiteContentDoc, SiteContentSchema } from './site-content.service';
import { SiteContentService } from './site-content.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: SiteContentDoc.name, schema: SiteContentSchema }])],
  controllers: [SiteContentController, PublicSiteController],
  providers: [SiteContentService],
  exports: [SiteContentService],
})
export class SiteContentModule {}
