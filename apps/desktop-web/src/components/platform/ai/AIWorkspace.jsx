import { memo, useState, useRef, useEffect } from 'react';
import { useAIStore } from '../../../store/aiStore';
import { useQuizStore } from '../../../store/quizStore';
import { X, Send, Sparkles, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api/axios';

const renderMarkdown = (content) => (
  <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed text-zinc-200">
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content}
    </ReactMarkdown>
  </div>
);

function AIWorkspace({ collapsed = false }) {
  const { toggleOpen, messagesByQuestionId, addMessage, isTyping, setIsTyping, initExplanation } = useAIStore();
  const { questions, currentIndex, answers, instantFeedback, quiz, attemptId, sessionId } = useQuizStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  const currentQuestion = questions[currentIndex];
  const qId = currentQuestion?._id;
  const messages = qId ? (messagesByQuestionId[qId] || []) : [];

  const answerState = answers[qId] || {};
  const isLocked = answerState.isLocked;
  const shouldRevealFeedback = instantFeedback && isLocked && Boolean(answerState.selectedAnswer);

  // Initialize explanation when feedback is revealed or explanation is allowed
  useEffect(() => {
    if (qId && (shouldRevealFeedback || quiz?.settings?.showExplanation !== false)) {
      if (currentQuestion.explanation) {
         initExplanation(qId, currentQuestion.explanation);
      } else {
         initExplanation(qId, "I can help explain this topic further. What specifically would you like to know?");
      }
    }
  }, [qId, shouldRevealFeedback, currentQuestion?.explanation, quiz?.settings?.showExplanation, initExplanation]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !qId) return;

    const userMessage = input.trim();
    setInput('');
    addMessage(qId, 'user', userMessage);
    setIsTyping(true);

    try {
      const response = await api.post(
        '/ai/explain',
        {
          quizId: quiz?._id,
          questionId: qId,
          attemptId,
          question: currentQuestion.questionText,
          options: currentQuestion.options,
          correctAnswer: currentQuestion.correctAnswer,
          prompt: userMessage,
        },
        {
          headers: {
            'x-quiz-session-id': sessionId,
          },
        }
      );

      setIsTyping(false);
      addMessage(qId, 'assistant', response.data.data.explanation);
    } catch {
      setIsTyping(false);
      addMessage(qId, 'assistant', 'I could not save this AI request right now. Please try again.');
    }
  };

  if (!currentQuestion) return null;

  if (collapsed) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#FF4500]/10 flex items-center justify-center text-[#FF4500] border border-[#FF4500]/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-xs text-zinc-400">AI</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#121214] border-l border-white/10 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.5)] z-20">
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#121214]/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#FF4500]/10 flex items-center justify-center text-[#FF4500]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">AI Explanation</span>
        </div>
        <button
          onClick={toggleOpen}
          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-black/40">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-60">
            <Bot className="w-10 h-10 text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400">
              Answer the question or lock your choice to reveal explanations and chat with AI.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-[#FF4500] text-black font-semibold' : 'bg-[#18181B] text-[#FF4500] border border-white/10'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-[#18181B] text-white border border-white/10 rounded-tr-sm' : 'bg-[#121214] border border-white/10 shadow-sm rounded-tl-sm'}`}>
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#18181B] border border-white/10 text-[#FF4500] shrink-0 flex items-center justify-center shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="bg-[#121214] border border-white/10 shadow-sm rounded-2xl rounded-tl-sm px-4 py-4 flex items-center gap-1">
                  <motion.div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                  <motion.div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                  <motion.div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#121214] border-t border-white/10 shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={messages.length === 0 || isTyping}
            placeholder="Ask a follow-up question..."
            className="w-full bg-[#18181B] border border-white/10 focus:border-[#FF4500]/50 focus:ring-2 focus:ring-[#FF4500]/20 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder:text-zinc-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || messages.length === 0 || isTyping}
            className="absolute right-2 p-1.5 rounded-lg text-zinc-400 hover:text-[#FF4500] hover:bg-[#FF4500]/10 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="text-center mt-2">
          <span className="text-[10px] text-zinc-500">AI can make mistakes. Check important info.</span>
        </div>
      </div>
    </div>
  );
}

export default memo(AIWorkspace);
