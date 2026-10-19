import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JobStatus } from '@rms/shared';
import type { Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { DocumentsService, type StoredUpload } from '../documents/documents.service';
import { DocumentType } from '../documents/schemas/document.schema';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import type { UpdateCandidateProfileDto } from './dto/candidate.dto';
import { CandidateProfile } from './schemas/candidate-profile.schema';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectModel(CandidateProfile.name) private readonly profiles: Model<CandidateProfile>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    private readonly documents: DocumentsService,
  ) {}

  private async profileOf(userId: string) {
    return (await this.profiles.findOne({ userId })) ?? (await this.profiles.create({ userId }));
  }

  async getMe(user: AuthUser) {
    const [u, p, resume] = await Promise.all([this.users.findById(user.id).lean(), this.profileOf(user.id), this.documents.activeResume(user.id)]);
    if (!u) throw new NotFoundException();
    const { _id, __v, userId, savedJobIds, deletedAt, ...profile } = p.toObject();
    return {
      user: { id: user.id, name: u.name, email: u.email, phone: u.phone, country: u.country, currency: u.currency, emailVerified: u.emailVerified },
      profile: { ...profile, savedCount: savedJobIds.length },
      resume: resume ? this.documents.present(resume) : null,
    };
  }

  async updateMe(user: AuthUser, dto: UpdateCandidateProfileDto) {
    const { name, phone, country, ...rest } = dto;
    const userPatch: Record<string, unknown> = {};
    if (name !== undefined) userPatch.name = name.trim();
    if (phone !== undefined) userPatch.phone = phone.trim();
    if (country !== undefined) userPatch.country = country.toUpperCase();
    if (Object.keys(userPatch).length) await this.users.updateOne({ _id: user.id }, userPatch);

    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (patch.skills) patch.skills = [...new Set((patch.skills as string[]).map((s) => s.trim()).filter(Boolean))];
    if (patch.expectedSalary) (patch.expectedSalary as { currency: string }).currency = (patch.expectedSalary as { currency: string }).currency.toUpperCase();
    await this.profiles.updateOne({ userId: user.id }, { $set: patch }, { upsert: true });
    return this.getMe(user);
  }

  /** Each upload becomes a new version; earlier resumes are archived, not deleted (applications keep pointing at theirs). */
  async uploadResume(user: AuthUser, file: StoredUpload) {
    return this.documents.register(file, user, { type: DocumentType.RESUME, label: 'Resume', group: 'resume' });
  }

  async savedJobIds(userId: string): Promise<Set<string>> {
    const p = await this.profiles.findOne({ userId }).select('savedJobIds').lean();
    return new Set((p?.savedJobIds ?? []).map(String));
  }

  async saveJob(user: AuthUser, jobId: string) {
    const job = await this.jobs.exists({ _id: jobId, status: JobStatus.PUBLISHED });
    if (!job) throw new NotFoundException('Job not found');
    await this.profiles.updateOne({ userId: user.id }, { $addToSet: { savedJobIds: jobId } }, { upsert: true });
    return { jobId, saved: true };
  }

  async unsaveJob(user: AuthUser, jobId: string) {
    await this.profiles.updateOne({ userId: user.id }, { $pull: { savedJobIds: jobId } });
    return { jobId, saved: false };
  }

  async savedJobs(user: AuthUser) {
    const ids = [...(await this.savedJobIds(user.id))];
    const rows = await this.jobs.find({ _id: { $in: ids }, status: JobStatus.PUBLISHED }).populate('companyId').lean();
    return rows;
  }

}
