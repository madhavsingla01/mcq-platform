import { Button } from '../ui';
import SmallPopup from '../ui/SmallPopup';
import './SubmitConfirmationModal.css';

export default function SubmitConfirmationModal({ isOpen, answeredCount, totalQuestions, onConfirm, onCancel }) {
  const unanswered = Math.max(0, totalQuestions - answeredCount);
  return <SmallPopup isOpen={isOpen} title="Submit quiz?" onClose={onCancel}
    description="Once you submit, you can no longer change your answers."
    actions={<>
      <Button variant="secondary" autoFocus onClick={onCancel}>Cancel</Button>
      <Button onClick={onConfirm}>Submit quiz</Button>
    </>}>
    <p>{answeredCount} of {totalQuestions} questions answered.</p>
    {unanswered > 0 && <p className="scm-unanswered">
      {unanswered} unanswered {unanswered === 1 ? 'question' : 'questions'} will earn no points.
    </p>}
  </SmallPopup>;
}
