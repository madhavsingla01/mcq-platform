import { useEffect, useRef } from 'react';
import { useQuizStore } from '../../../store/quizStore';
import QuestionCard from './QuestionCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../../ui';

export default function QuestionWorkspace() {
  const { questions, currentIndex, isStarted, isSubmitted } = useQuizStore();
  const scrollRef = useRef(null);

  const currentQuestion = questions[currentIndex] || null;

  // Scroll to top when question changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentIndex]);

  if (!isStarted && !isSubmitted) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-zinc-400">Please start the quiz from the entry screen.</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white relative flex flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 lg:px-20 py-12 custom-scrollbar"
      >
        <div className="max-w-3xl mx-auto w-full pb-32">
          <Card style={{ borderRadius: 20, padding: 28, boxShadow: '0 18px 40px rgba(2,6,23,0.06)' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {currentQuestion ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <QuestionCard
                      question={currentQuestion}
                      questionNumber={currentIndex + 1}
                    />
                  </div>
                ) : (
                  <div className="text-center text-zinc-500 py-20">Question not found.</div>
                )}
              </motion.div>
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  );
}
