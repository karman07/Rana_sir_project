import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** Either empty, an uploaded asset path (/api/public/assets/<file>) or an https URL. Never javascript: or data:. */
const SAFE_URL = /^(|https?:\/\/[^\s]+|\/[^\s]*)$/;
const url = () => Matches(SAFE_URL, { message: 'Must be a web address (https://…) or a site path' });
const text = (n: number) => [IsString(), MaxLength(n)];
const t = (n: number) => (target: object, key: string) => text(n).forEach((d) => d(target, key));

class Announcement {
  @IsBoolean() enabled: boolean; @t(200) text: string; @t(40) linkLabel: string; @url() @MaxLength(500) linkUrl: string;
}
class Hero {
  @t(120) headline: string; @t(300) subheadline: string; @t(80) searchPlaceholder: string;
  @url() @MaxLength(500) backgroundImage: string; @url() @MaxLength(500) backgroundVideo: string;
  @IsInt() @Min(20) @Max(90) overlayStrength: number;
}
class QuickLink { @t(40) label: string; @t(80) query: string; }
class Company { @t(60) name: string; @url() @MaxLength(500) logo: string; @url() @MaxLength(500) url: string; }
class TrustedBy {
  @IsBoolean() enabled: boolean; @t(40) label: string;
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => Company) companies: Company[];
}
class CategoryItem { @t(40) label: string; @t(80) query: string; @t(120) description: string; }
class Categories {
  @IsBoolean() enabled: boolean; @t(60) title: string;
  @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CategoryItem) items: CategoryItem[];
}
class Featured { @t(80) title: string; @t(200) subtitle: string; @IsInt() @Min(3) @Max(20) count: number; }
class Stats { @IsBoolean() show: boolean; }
class Testimonial { @t(500) quote: string; @t(60) name: string; @t(60) role: string; @t(60) company: string; }
class Testimonials {
  @IsBoolean() enabled: boolean; @t(60) title: string;
  @IsArray() @ArrayMaxSize(9) @ValidateNested({ each: true }) @Type(() => Testimonial) items: Testimonial[];
}
class Faq { @t(160) q: string; @t(1200) a: string; }
class Contact { @t(120) email: string; @t(40) phone: string; @t(200) address: string; @t(80) hours: string; }
class Footer { @t(300) tagline: string; }
class Seo { @t(120) title: string; @t(300) description: string; }

export class SiteContentDto {
  @ValidateNested() @Type(() => Announcement) announcement: Announcement;
  @ValidateNested() @Type(() => Hero) hero: Hero;
  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => QuickLink) quickLinks: QuickLink[];
  @ValidateNested() @Type(() => TrustedBy) trustedBy: TrustedBy;
  @ValidateNested() @Type(() => Categories) categories: Categories;
  @ValidateNested() @Type(() => Featured) featuredJobs: Featured;
  @ValidateNested() @Type(() => Stats) stats: Stats;
  @ValidateNested() @Type(() => Testimonials) testimonials: Testimonials;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => Faq) faqs: Faq[];
  @ValidateNested() @Type(() => Contact) contact: Contact;
  @ValidateNested() @Type(() => Footer) footer: Footer;
  @ValidateNested() @Type(() => Seo) seo: Seo;
  @IsOptional() @IsString() note?: string;
}
