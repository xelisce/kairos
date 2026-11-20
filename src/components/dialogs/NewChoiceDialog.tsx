// Drag-select empty time: what do you want to put there?
import { format } from 'date-fns';
import { fmtTime } from '../../lib/time';
import type { EventCategory } from '../../types';
import { Modal, useModal, useUI } from '../ui';

const EVENT_CHOICES: { icon: string; label: string; hint: string; category?: EventCategory }[] = [
  { icon: '📅', label: 'Event here', hint: 'hangout, appointment' },
  { icon: '📝', label: 'Course event here', hint: 'exam, quiz, presentation, group meeting', category: 'exam' },
  { icon: '🧗', label: 'CCA / activity here', hint: 'a session you booked', category: 'cca' },
];

export function NewChoiceDialog() {
  const { start, end } = useModal('newChoice');
  const { open, close } = useUI();
  return (
    <Modal title={`${format(start, 'EEE d MMM')} ${fmtTime(start)}–${fmtTime(end)}`} onClose={close}>
      <div className="choice-grid">
        <button className="btn big" onClick={() => open({ kind: 'task', start, end })}>
          📝 Task here<small>homework, admin, applications</small>
        </button>
        {EVENT_CHOICES.map((c) => (
          <button
            key={c.label}
            className="btn big"
            onClick={() => open({ kind: 'event', start, end, category: c.category })}
          >
            {c.icon} {c.label}
            <small>{c.hint}</small>
          </button>
        ))}
        <button className="btn big" onClick={() => open({ kind: 'away', start, end })}>
          ✈️ Away from here<small>trip, holiday: no tasks planned</small>
        </button>
      </div>
    </Modal>
  );
}
