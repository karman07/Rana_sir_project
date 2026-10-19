import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '@rms/shared';
import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  const payload = { actor: { id: null, role: 'SYSTEM' as const }, entity: { type: 'Job', id: '1' } };

  it('delivers to handlers with a timestamp', async () => {
    const emitter = new EventEmitter2();
    const seen = jest.fn();
    emitter.on(DomainEvent.JOB_APPROVED, seen);
    await new EventBusService(emitter).publish(DomainEvent.JOB_APPROVED, payload);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ entity: payload.entity, occurredAt: expect.any(Date) }));
  });

  it('does not throw when a handler fails', async () => {
    const emitter = new EventEmitter2();
    emitter.on(DomainEvent.JOB_APPROVED, () => { throw new Error('boom'); });
    await expect(new EventBusService(emitter).publish(DomainEvent.JOB_APPROVED, payload)).resolves.toBeUndefined();
  });
});
