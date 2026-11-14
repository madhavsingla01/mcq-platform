import { useLayoutEffect, useRef } from 'react';
import { useQuizStore } from '../../../store/quizStore';
import QuestionCard from './QuestionCard';

export default function QuestionWorkspace() {
  const currentIndex = useQuizStore(state => state.currentIndex);
  const currentQuestion = useQuizStore(state => state.questions[state.currentIndex]);
  const isOpen = useQuizStore(state => state.isStarted || state.isSubmitted);
  const scrollRef = useRef(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [currentQuestion?._id, isOpen]);

  if (!isOpen) {
    return (
      <div className="h-full flex items-center justify-center bg-transparent">
        <div className="text-zinc-400">Please start the quiz from the entry screen.</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-transparent relative flex flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 custom-scrollbar"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="max-w-3xl w-full mx-auto" style={{ margin: 'auto', paddingBottom: '32px' }}>
          {currentQuestion ? (
            <QuestionCard key={currentQuestion._id} question={currentQuestion} questionNumber={currentIndex + 1} />
          ) : (
            <div className="text-center text-zinc-500 py-20">Question not found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
