import { memo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const renderMarkdown = (content) => (
  <ReactMarkdown
    remarkPlugins={[remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      p: ({ node, ...props }) => <span {...props} /> // prevent block-level p tags breaking inline flex
    }}
  >
    {content}
  </ReactMarkdown>
);

function OptionCard({
  option,
  index,
  isSelected,
  isCorrect,
  shouldRevealFeedback,
  isLocked,
  onSelect,
  fontSize
}) {
  const isCorrectSelection = isSelected && isCorrect;
  const isWrongSelection = isSelected && !isCorrect;

  // Determine styles based on state
  let containerStyle = "bg-white border-zinc-200 text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50/30 rounded-3xl";
  let pillStyle = "bg-zinc-100 text-zinc-500 border-zinc-200";

  if (shouldRevealFeedback) {
    if (isCorrect) {
      containerStyle = "bg-green-50/50 border-green-200 text-green-900 shadow-sm shadow-green-500/10";
      pillStyle = "bg-green-500 text-white border-green-500";
    } else if (isWrongSelection) {
      containerStyle = "bg-red-50/50 border-red-200 text-red-900";
      pillStyle = "bg-red-500 text-white border-red-500";
    } else {
      containerStyle = "bg-zinc-50/50 border-zinc-200 text-zinc-400 opacity-60";
      pillStyle = "bg-zinc-100 text-zinc-400 border-zinc-200";
    }
  } else if (isSelected) {
    containerStyle = "bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500";
    pillStyle = "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30";
  }

  const fontClasses = {
    sm: 'text-sm py-4 px-4',
    md: 'text-base py-5 px-6',
    lg: 'text-lg py-6 px-7',
  };

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={isLocked}
      whileHover={!isLocked && !shouldRevealFeedback ? { scale: 1.01, transition: { duration: 0.1 } } : {}}
      whileTap={!isLocked && !shouldRevealFeedback ? { scale: 0.99, transition: { duration: 0.1 } } : {}}
      className={`
        w-full text-left rounded-2xl border transition-all duration-200 flex items-center gap-4
        ${fontClasses[fontSize]} ${containerStyle}
        ${isLocked ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      <div className={`
        shrink-0 w-10 h-10 rounded-full border flex items-center justify-center text-base font-semibold transition-colors duration-200
        ${pillStyle}
      `}>
        {option.label}
      </div>
      <div className="flex-1 leading-relaxed">
        {renderMarkdown(option.text)}
      </div>

      {shouldRevealFeedback && isSelected && !isCorrect && (
        <span className="text-[10px] uppercase tracking-widest font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
          Your Answer
        </span>
      )}
    </motion.button>
  );
}

export default memo(OptionCard);
