import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { DomainEvent, Role } from '@rms/shared';
import type { Model } from 'mongoose';
import type { DomainEventPayload } from '../common/events/event-bus.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentType } from '../documents/schemas/document.schema';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import { SettingsService } from '../settings/settings.service';
import { CommissionCalculationService } from './commission-calculation.service';
import { buildContractDocView, renderContractPdf, type DocAudience, type DocKind } from './contract-document';
import { ContractVersion } from './schemas/contract-version.schema';
import { Contract } from './schemas/contract.schema';

/**
 * Produces the contract paperwork as PDFs: an offer letter when a contract is put to the candidate, and a contract copy for the
 * candidate and one for the company when it takes effect (and again after every approved change). Each reader gets their own copy.
 */
@Injectable()
export class ContractDocumentsService {
  private readonly logger = new Logger(ContractDocumentsService.name);

  constructor(
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly documents: DocumentsService,
    private readonly calc: CommissionCalculationService,
    private readonly settings: SettingsService,
  ) {}

  private async issue(contractId: string, kind: DocKind, audiences: DocAudience[]) {
    const c = await this.contracts.findById(contractId).lean();
    if (!c) return;
    const [v, cand, job] = await Promise.all([
      this.versions.findOne({ contractId: c._id, version: c.currentVersion }).lean(),
      this.users.findById(c.candidateId).select('name email').lean(),
      this.jobs.findById(c.jobId).select('spec.title companyId').populate('companyId', 'name').lean(),
    ]);
    if (!v || !cand) return;
    const accepted = kind === 'CONTRACT' && c.activatedAt ? { by: cand.name, on: c.activatedAt.toISOString().slice(0, 10) } : undefined;
    for (const audience of audiences) {
      const view = buildContractDocView({
        kind, audience, contractNumber: c.contractNumber, version: v.version, terms: v.terms, candidate: { name: cand.name, email: cand.email },
        company: (job as any)?.companyId?.name ?? '', jobTitle: (job as any)?.spec?.title ?? v.terms.title, accepted,
      }, this.calc);
      const co = (await this.settings.get()).company;
      const pdf = await renderContractPdf(view, { name: co.name, supportEmail: co.supportEmail || undefined });
      const owner = audience === 'CANDIDATE' ? { id: String(c.candidateId), role: Role.CANDIDATE } : { id: String(c.recruiterId), role: Role.RECRUITER };
      const noun = kind === 'OFFER' ? 'Offer letter' : 'Contract';
      await this.documents.registerGenerated(pdf, owner, {
        type: kind === 'OFFER' ? DocumentType.OFFER_LETTER : DocumentType.CONTRACT, fileName: `${noun} ${c.contractNumber} v${v.version}${audience === 'COMPANY' ? ' (company copy)' : ''}.pdf`,
        mime: 'application/pdf', label: `${noun} ${c.contractNumber} · v${v.version}${audience === 'COMPANY' ? ' · company copy' : ''}`,
        related: { type: 'Contract', id: String(c._id) }, group: `${kind.toLowerCase()}:${c._id}:${audience}`,
      });
    }
  }

  private async safely(label: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { this.logger.error(`${label}: ${e instanceof Error ? e.message : e}`); }
  }

  /** The candidate is asked to respond: give them the offer letter. */
  @OnEvent(DomainEvent.CONTRACT_APPROVED)
  onApproved(p: DomainEventPayload) {
    if ((p.data as { status?: string } | undefined)?.status !== 'PENDING_CANDIDATE_APPROVAL') return;
    return this.safely('offer letter', () => this.issue(p.entity.id, 'OFFER', ['CANDIDATE']));
  }

  @OnEvent(DomainEvent.CONTRACT_ACTIVATED) @OnEvent(DomainEvent.CONTRACT_UPDATED)
  onInForce(p: DomainEventPayload) { return this.safely('contract copies', () => this.issue(p.entity.id, 'CONTRACT', ['CANDIDATE', 'COMPANY'])); }
}
