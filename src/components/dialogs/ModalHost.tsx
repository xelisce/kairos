// Renders whichever dialog is open. `key` resets a dialog's form when it's opened for something else.
import { useUI } from '../ui';
import { AccountDialog } from './AccountDialog';
import { ActivityDialog } from './ActivityDialog';
import { AwayDialog } from './AwayDialog';
import { ClassDialog } from './ClassDialog';
import { CourseDialog } from './CourseDialog';
import { EventDialog } from './EventDialog';
import { NewChoiceDialog } from './NewChoiceDialog';
import { NusmodsDialog } from './NusmodsDialog';
import { OccurrenceDialog } from './OccurrenceDialog';
import { RoutineDialog } from './RoutineDialog';
import { SemesterDialog } from './SemesterDialog';
import { TaskDialog } from './TaskDialog';
import { TravelPlanDialog } from './TravelPlanDialog';

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'occ':
      return <OccurrenceDialog key={modal.occ.id} />;
    case 'task':
      return <TaskDialog key={modal.id ?? 'new'} />;
    case 'event':
      return <EventDialog key={modal.id ?? 'new'} />;
    case 'class':
      return <ClassDialog key={modal.id ?? 'new'} />;
    case 'module':
      return <CourseDialog key={modal.id ?? 'new'} />;
    case 'semester':
      return <SemesterDialog key={modal.id ?? 'new'} />;
    case 'routine':
      return <RoutineDialog key={modal.id ?? 'new'} />;
    case 'activity':
      return <ActivityDialog key={modal.id ?? 'new'} />;
    case 'nusmods':
      return <NusmodsDialog />;
    case 'away':
      return <AwayDialog key={modal.id ?? 'new'} />;
    case 'travelPlan':
      return <TravelPlanDialog key={modal.planId} />;
    case 'account':
      return <AccountDialog />;
    case 'newChoice':
      return <NewChoiceDialog />;
  }
}
