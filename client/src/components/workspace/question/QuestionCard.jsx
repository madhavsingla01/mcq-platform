import { memo } from 'react';
import { useQuizStore } from '../../../store/quizStore';
import { useSettingsStore } from '../../../store/settingsStore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import OptionCard from '../options/OptionCard';
import 'katex/dist/katex.min.css';
import { CheckCircle2, XCircle } from 'lucide-react';

const renderMarkdown = (content) => (
  <div className="prose prose-zinc max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200">
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content}
    </ReactMarkdown>
  </div>
);

function QuestionCard({ question, questionNumber }) {
  const { answers, selectAnswer, instantFeedback, quiz } = useQuizStore();
  const { density, fontSize } = useSettingsStore();

  const answerState = answers[question._id] || {};
  const selectedAnswer = answerState.selectedAnswer;
  const isLocked = answerState.isLocked;

  const options = Array.isArray(question.options) ? question.options : [];
  const correctAnswer = question.correctAnswer;
  const showExplanation = quiz?.settings?.showExplanation !== false;

  const isCorrectSelection = Boolean(selectedAnswer) && selectedAnswer === correctAnswer;
  const shouldRevealFeedback = instantFeedback && isLocked && Boolean(selectedAnswer);

  const handleSelect = (label) => {
    if (!isLocked) {
      selectAnswer(question._id, label);
    }
  };

  const fontClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  const spacingClasses = {
    compact: 'gap-4',
    comfortable: 'gap-8',
  };

  return (
    <div className={`flex flex-col ${spacingClasses[density]}`}>
      {/* Header / Text */}
      <div className="flex items-start gap-4">
        <span className={`font-bold text-indigo-600 mt-1 ${fontClasses[fontSize]}`}>
          {questionNumber}.
        </span>
        <div className={`flex-1 text-zinc-900 font-medium tracking-tight ${fontClasses[fontSize]}`}>
          {renderMarkdown(question.questionText)}
        </div>
      </div>

      {/* Options */}
      <div className={`flex flex-col ${density === 'compact' ? 'gap-2.5' : 'gap-3.5'} mt-2`}>
        {options.map((option, idx) => (
          <OptionCard
            key={option.label}
            option={option}
            index={idx}
            isSelected={selectedAnswer === option.label}
            isCorrect={correctAnswer === option.label}
            shouldRevealFeedback={shouldRevealFeedback}
            isLocked={isLocked}
            onSelect={() => handleSelect(option.label)}
            fontSize={fontSize}
          />
        ))}
      </div>

      {/* Feedback & Explanation */}
      {shouldRevealFeedback && (
        <div className="mt-8 animate-fade-in-scale origin-top">
          <div className={`p-5 rounded-2xl border ${isCorrectSelection ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'} flex items-start gap-4`}>
            <div className="mt-0.5">
              {isCorrectSelection ? (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600" />
              )}
            </div>
            <div className="flex-1">
              <h4 className={`font-semibold mb-1 ${isCorrectSelection ? 'text-green-900' : 'text-red-900'}`}>
                {isCorrectSelection ? 'Correct!' : 'Incorrect'}
              </h4>
              {!isCorrectSelection && (
                <p className="text-sm text-red-700/80 mb-3">
                  The correct answer was <strong>{correctAnswer}</strong>.
                </p>
              )}

              {showExplanation && question.explanation && (
                <div className="mt-4 pt-4 border-t border-black/5">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2 block">Explanation</span>
                  <div className="text-sm text-zinc-700">
                    {renderMarkdown(question.explanation)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(QuestionCard);
