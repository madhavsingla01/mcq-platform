import { memo, useMemo } from 'react';
import { useQuizStore } from '../../../store/quizStore';
import { useSettingsStore } from '../../../store/settingsStore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import OptionCard from '../options/OptionCard';
import 'katex/dist/katex.min.css';
import { CheckCircle2, XCircle } from 'lucide-react';

const MarkdownView = memo(function MarkdownView({ content, className = '' }) {
  if (!content) return null;
  return (
    <div className={`prose max-w-none text-inherit prose-headings:text-inherit prose-p:text-inherit prose-p:my-0 prose-strong:text-inherit prose-code:text-inherit prose-p:leading-relaxed prose-pre:bg-zinc-800/80 prose-pre:text-zinc-100 prose-pre:border prose-pre:border-zinc-700/60 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

function QuestionCard({ question, questionNumber }) {
  const answers = useQuizStore((state) => state.answers);
  const selectAnswer = useQuizStore((state) => state.selectAnswer);
  const instantFeedback = useQuizStore((state) => state.instantFeedback);
  const quiz = useQuizStore((state) => state.quiz);

  const density = useSettingsStore((state) => state.density);
  const fontSize = useSettingsStore((state) => state.fontSize);

  const answerState = answers[question._id] || {};
  const selectedAnswer = answerState.selectedAnswer;
  const isLocked = answerState.isLocked;

  const options = useMemo(() => Array.isArray(question.options) ? question.options : [], [question.options]);
  const correctAnswer = question.correctAnswer;
  const showExplanation = quiz?.settings?.showExplanation !== false;

  const isCorrectSelection = Boolean(selectedAnswer) && selectedAnswer === correctAnswer;
  const shouldRevealFeedback = instantFeedback && isLocked && Boolean(selectedAnswer);

  const handleSelect = (label) => {
    if (!isLocked) {
      selectAnswer(question._id, label);
      if (localStorage.getItem('mcq.sound.enabled') !== 'false') {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
          }
        } catch (_) {}
      }
      if (localStorage.getItem('mcq.quiz.autoAdvance') === 'true') {
        setTimeout(() => {
          useQuizStore.getState().nextQuestion?.();
        }, 350);
      }
    }
  };

  const fontClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  const spacingClasses = {
    compact: 'gap-4',
    comfortable: 'gap-7',
  };

  return (
    <div className={`flex flex-col ${spacingClasses[density] || 'gap-6'} animate-fade-in`}>
      {/* Header / Question Text */}
      <div className="flex items-start gap-3.5">
        <span
          className={`font-black mt-0.5 ${fontClasses[fontSize] || 'text-lg'}`}
          style={{
            color: 'var(--color-primary, #FF4500)',
            flexShrink: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {questionNumber}.
        </span>
        <div
          className={`flex-1 font-semibold tracking-tight ${fontClasses[fontSize] || 'text-lg'}`}
          style={{
            color: 'var(--color-text, #EDEFF1)',
            lineHeight: 1.6,
          }}
        >
          <MarkdownView content={question.questionText} />
        </div>
      </div>

      {/* Options List */}
      <div className={`flex flex-col ${density === 'compact' ? 'gap-2.5' : 'gap-3'} mt-1`}>
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

      {/* Instant Feedback & Explanation */}
      {shouldRevealFeedback && (
        <div className="mt-4 animate-fade-in origin-top">
          <div
            className="p-5 flex items-start gap-4"
            style={{
              borderRadius: 'var(--radius-lg, 12px)',
              background: isCorrectSelection
                ? 'rgba(70, 209, 96, 0.12)'
                : 'rgba(255, 79, 64, 0.12)',
              border: `1px solid ${
                isCorrectSelection ? 'rgba(70, 209, 96, 0.3)' : 'rgba(255, 79, 64, 0.3)'
              }`,
              color: 'var(--text-primary, #FFFFFF)',
            }}
          >
            <div className="mt-0.5 flex-shrink-0">
              {isCorrectSelection ? (
                <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--success, #46D160)' }} />
              ) : (
                <XCircle className="w-6 h-6" style={{ color: 'var(--error, #FF4F40)' }} />
              )}
            </div>
            <div className="flex-1">
              <h4
                className="font-bold text-base mb-1"
                style={{ color: isCorrectSelection ? 'var(--success, #46D160)' : 'var(--error, #FF4F40)' }}
              >
                {isCorrectSelection ? 'Correct Answer!' : 'Incorrect'}
              </h4>
              {!isCorrectSelection && (
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary, #818181)' }}>
                  The correct answer was <strong style={{ color: 'var(--success, #46D160)' }}>{correctAnswer}</strong>.
                </p>
              )}

              {showExplanation && question.explanation && (
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))' }}
                >
                  <span
                    className="text-xs font-bold uppercase tracking-widest mb-1.5 block"
                    style={{ color: 'var(--color-text-muted, #71717a)' }}
                  >
                    Explanation
                  </span>
                  <div
                    className="text-sm"
                    style={{ color: 'var(--color-text-secondary, #a1a1aa)', lineHeight: 1.6 }}
                  >
                    <MarkdownView content={question.explanation} />
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

