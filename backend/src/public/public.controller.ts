import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Throttle } from '@nestjs/throttler';
import { DomainEvent, JobStatus, ReviewStatus, Role, ApplicationStatus } from '@rms/shared';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { Public } from '../auth/decorators';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { Company } from '../companies/schemas/company.schema';
import { EventBusService } from '../common/events/event-bus.service';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListJobsQueryDto } from '../jobs/dto/job.dto';
import { JobsService } from '../jobs/jobs.service';
import { Job } from '../jobs/schemas/job.schema';
import { Message } from './message.schema';

class ContactDto {
  @IsString() @Length(2, 80) name: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsIn(['HIRING', 'CANDIDATE', 'GENERAL']) topic?: 'HIRING' | 'CANDIDATE' | 'GENERAL';
  @IsString() @Length(10, 3000) message: string;
}

/** Unauthenticated endpoints for the public website. Everything here is safe to show to anyone. */
@Controller('public')
@Public()
export class PublicController {
  constructor(
    private readonly jobs: JobsService,
    private readonly events: EventBusService,
    @InjectModel(Job.name) private readonly jobModel: Model<Job>,
    @InjectModel(Company.name) private readonly companies: Model<Company>,
    @InjectModel(Application.name) private readonly applications: Model<Application>,
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
  ) {}

  // Same visibility rules as a candidate: PUBLISHED only, internal fields stripped.
  private readonly anonymous = { id: '', role: Role.CANDIDATE, email: '', name: '' } as const;

  @Get('jobs') list(@Query() q: ListJobsQueryDto) { return this.jobs.list({ ...q, saved: false }, this.anonymous); }
  @Get('jobs/:id') get(@Param('id', ParseObjectIdPipe) id: string) { return this.jobs.get(id, this.anonymous); }

  /** Real platform numbers for the landing page (no padding). */
  @Get('stats')
  async stats() {
    const [openJobs, companies, candidates, placements, categories] = await Promise.all([
      this.jobModel.countDocuments({ status: JobStatus.PUBLISHED }),
      this.companies.countDocuments({ approvalStatus: ReviewStatus.APPROVED }),
      this.profiles.countDocuments({}),
      this.applications.countDocuments({ status: ApplicationStatus.PLACED }),
      this.jobModel.aggregate([{ $match: { status: JobStatus.PUBLISHED } }, { $group: { _id: '$spec.department', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    ]);
    return { openJobs, companies, candidates, placements, departments: categories.filter((c) => c._id).map((c) => ({ name: c._id, count: c.n })) };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(201) @Post('contact')
  async contact(@Body() dto: ContactDto, @Req() req: Request) {
    const m = await this.messages.create({ ...dto, topic: dto.topic ?? 'GENERAL', ip: req.ip });
    await this.events.publish(DomainEvent.CONTACT_RECEIVED, {
      actor: { id: null, role: 'SYSTEM' }, entity: { type: 'Message', id: m.id }, data: { senderName: dto.name, senderEmail: dto.email, message: dto.message, topic: m.topic, company: dto.company },
    });
    return { received: true };
  }
}
