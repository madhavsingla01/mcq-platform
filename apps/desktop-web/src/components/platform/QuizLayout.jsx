import { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useQuizStore } from '../../store/quizStore';
import { QuizMediaPreferences } from '../media/QuizMediaPreferences';
import TopNavbar from './navbar/TopNavbar';
import QuestionWorkspace from './question/QuestionWorkspace';
import SettingsDrawer from './settings/SettingsDrawer';
import './QuizLayout.css';

export default function QuizLayout({ collaboration = null }) {
  const { isDrawerOpen } = useSettingsStore();
  const questions = useQuizStore(state => state.questions);
  const [media, setMedia] = useState({ transcripts: null, captions: true, speed: 1 });
  const hasMedia = questions.some(question =>
    question.accessibilityMedia?.length || question.options?.some(option => option.accessibilityMedia?.length));

  return (
    <QuizMediaPreferences.Provider value={hasMedia ? { ...media, setMedia } : null}>
    <div className="ws-root">
      <TopNavbar collaboration={collaboration} />

      <div className="ws-main">
        <div className="ws-columns">
          {/* Main Workspace Only */}
          <div className="ws-workspace">
            <QuestionWorkspace />
          </div>
        </div>
      </div>

      {/* Settings Drawer Overlay */}
      {isDrawerOpen && <SettingsDrawer collaboration={collaboration} />}
    </div>
    </QuizMediaPreferences.Provider>
  );
}
