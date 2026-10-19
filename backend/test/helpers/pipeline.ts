import { Types, type Connection } from 'mongoose';

type Agent = { patch: (u: string) => any; post: (u: string) => any };

/** Arranges and holds our own interview with the candidate, leaving them in the interview stage, ready to shortlist. */
export async function holdInterview(admin: Agent, conn: Connection, applicationId: string) {
  const r = await admin.post('/api/interviews').send({ applicationId, type: 'PHONE', startsAt: new Date(Date.now() + 3_600_000).toISOString(), durationMinutes: 30 }).expect(201);
  await conn.collection('interviews').updateOne({ _id: new Types.ObjectId(r.body.data.id) }, { $set: { startsAt: new Date(Date.now() - 3_600_000) } });
  await admin.post(`/api/interviews/${r.body.data.id}/complete`).expect(200);
  return r.body.data.id as string;
}

/**
 * Takes an application through round one the way it really happens: Admin starts review, interviews the candidate (the interview is held,
 * so its time is moved into the past), and then shortlists. Most suites only need a candidate to arrive at the recruiter, so they share this.
 */
export async function adminScreen(admin: Agent, conn: Connection, applicationId: string) {
  await admin.patch(`/api/applications/${applicationId}/status`).send({ status: 'ADMIN_REVIEW' }).expect(200);
  const r = await admin.post('/api/interviews').send({ applicationId, type: 'PHONE', startsAt: new Date(Date.now() + 3_600_000).toISOString(), durationMinutes: 30 }).expect(201);
  await conn.collection('interviews').updateOne({ _id: new Types.ObjectId(r.body.data.id) }, { $set: { startsAt: new Date(Date.now() - 3_600_000) } });
  await admin.post(`/api/interviews/${r.body.data.id}/complete`).expect(200);
  await admin.patch(`/api/applications/${applicationId}/status`).send({ status: 'ADMIN_SHORTLISTED' }).expect(200);
}
