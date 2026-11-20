// One part of a trip (a flight, a bus ride, a stay...), edited on its own. "Whole trip" opens the
// trip with all its plans.
import { useStore } from '../../store';
import type { TravelPlan } from '../../types';
import { PLAN_KINDS, planTitle, withPlans } from '../../lib/travelPlans';
import { DialogButtons, Modal, useModal, useUI } from '../ui';
import { useDraft } from './shared';
import { PlanFields } from './AwayDialog';

export function TravelPlanDialog() {
  const m = useModal('travelPlan');
  const { open, close } = useUI();
  const data = useStore((s) => s.data);
  const commit = useStore((s) => s.commit);
  const trip = data.away.find((a) => a.id === m.awayId);
  const original = trip?.plans?.find((p) => p.id === m.planId);
  const [p, update] = useDraft<TravelPlan>(() => original ?? { id: m.planId, kind: 'other', title: '', start: '' });
  if (!trip || !original) return null; // deleted meanwhile (another window)

  const name = planTitle(p);
  const saveWith = (plans: TravelPlan[], label: string) => {
    commit(label, (d) => {
      const i = d.away.findIndex((a) => a.id === trip.id);
      if (i >= 0) d.away[i] = withPlans(d.away[i], plans);
    });
    close();
  };
  const others = (trip.plans ?? []).filter((x) => x.id !== p.id);
  return (
    <Modal
      title={`${PLAN_KINDS[p.kind].icon} ${name}`}
      onClose={close}
      footer={
        <DialogButtons
          onDelete={() => saveWith(others, `Remove ${name}`)}
          onCancel={close}
          onSave={() => saveWith([...others, p], `Edit ${name}`)}
          problem={p.start ? undefined : 'Pick a date'}
        />
      }
    >
      <p className="muted small">
        Part of{' '}
        <button className="linkish" onClick={() => open({ kind: 'away', id: trip.id })}>
          ✈️ {trip.title || 'Away'} (edit the whole trip)
        </button>
      </p>
      <PlanFields plan={p} onChange={update} />
    </Modal>
  );
}
