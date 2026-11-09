import { useMemo, useState } from 'react';
import SubmitConfirmationModal from '../../quiz/SubmitConfirmationModal';
import QuizTimer from '../../quiz/QuizTimer';
import { CheckCircle, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useQuizStore } from '../../../store/quizStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { getGuestSessionId } from '../../../utils/quizSession';
import api from '../../../api/axios';
import { showCustomDialog, toast } from '../../ui';
import './TopNavbar.css';

export default function TopNavbar() {
  const { questions, answers, submitAttempt, submitting, isSubmitted, currentIndex, nextQuestion, prevQuestion, quiz } = useQuizStore();
  const { isDrawerOpen, toggleDrawer, timerVisibility } = useSettingsStore();

  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q._id]?.selectedAnswer)).length,
    [answers, questions]
  );

  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const handleSubmitClick = () => {
    if (localSubmitting || submitting || isSubmitted) return;
    setShowSubmitModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowSubmitModal(false);
    if (typeof submitAttempt === 'function') {
      try { submitAttempt(); } catch {}
      return;
    }
    const attemptId = useQuizStore.getState().attemptId;
    const currentQuiz = useQuizStore.getState().quiz;
    if (!attemptId || !currentQuiz?._id) return;
    try {
      setLocalSubmitting(true);
      await useQuizStore.getState().syncWithBackend({ force: true });
      const sharedSessionId = useQuizStore.getState().sharedSessionId;
      const payload = {
        ...useQuizStore.getState().getSubmitPayload(),
        ...(sharedSessionId ? { sharedSessionId } : {}),
      };
      const sessionId = useQuizStore.getState().sessionId || getGuestSessionId();
      const response = await api.put(
        `/quiz/${currentQuiz._id}/attempt/${attemptId}`,
        payload,
        { headers: { 'x-quiz-session-id': sessionId, ...(sharedSessionId ? { 'x-shared-session-id': sharedSessionId } : {}) } }
      );
      useQuizStore.getState().setResult(response.data.data);
      window.location.href = `/result/${attemptId}`;
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to submit quiz. Please check your network connection.';
      toast.error('Submission Error', { description: errorMsg });
      setLocalSubmitting(false);
    }
  };

  return (
    <>
      <header className="ws-navbar-minimal">
        <div className="ws-nav-meta-minimal">
          {questions.length > 1 && <button type="button" aria-label="Previous question" onClick={prevQuestion} disabled={currentIndex === 0}><ChevronLeft size={18} /></button>}
          <span>Question {currentIndex + 1} of {questions.length}</span>
          {questions.length > 1 && <button type="button" aria-label="Next question" onClick={nextQuestion} disabled={currentIndex === questions.length - 1}><ChevronRight size={18} /></button>}
        </div>

        <div className="ws-nav-actions-minimal">
          <QuizTimer compact hidden={timerVisibility === 'hidden' && !quiz?.isChallenge} onExpired={handleConfirmSubmit} />

          <button
            className="ws-settings-btn"
            onClick={toggleDrawer}
            title="Settings"
            type="button"
            data-settings-trigger
            aria-haspopup="dialog"
            aria-controls="settings-drawer"
            aria-expanded={isDrawerOpen}
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <button
            onClick={handleSubmitClick}
            disabled={submitting || localSubmitting || isSubmitted}
            className="ws-submit-btn-minimal"
            type="button"
          >
            {submitting || localSubmitting ? 'Submitting...' : 'Submit'}
            {!submitting && !localSubmitting && <CheckCircle className="w-4 h-4 opacity-70" />}
          </button>
        </div>
      </header>

      <SubmitConfirmationModal
        isOpen={showSubmitModal}
        answeredCount={answeredCount}
        totalQuestions={questions.length}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitModal(false)}
      />
    </>
  );
}
