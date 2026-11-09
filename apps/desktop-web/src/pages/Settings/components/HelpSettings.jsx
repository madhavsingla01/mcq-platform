import React, { useState } from 'react';
import { HelpCircle, MessageSquare, ExternalLink, ChevronDown, Check, Send, ShieldCheck, FileText, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../../api/axios';
import { SettingsInfo, SettingsSection, SettingsRow } from './SettingsSection';
import { Button } from '../../../components/ui';

const FAQS = [
  {
    q: 'How do I upload a custom cover image to my quiz?',
    a: 'On your Dashboard or in the Quiz Details Modal, click "Upload Image" on the diagonal visual bar or drag-and-drop an image directly onto the diagonal zone. Custom covers support JPG, PNG, WEBP, and GIF up to 8MB.',
  },
  {
    q: 'How do Public and Private profiles work?',
    a: 'In Settings > Account & Profile, you can toggle your profile between Public and Private mode. Public profiles are discoverable at /@username and your public quizzes appear in Explore. Private profiles are restricted and hidden from public search.',
  },
  {
    q: 'Can I import questions from spreadsheets?',
    a: 'Choose Import Sheet under Create for CSV or Excel files, or Import PDFs for PDFs with selectable text. Review questions and answers before publishing.',
  },
  {
    q: 'Are my private quizzes accessible to other users?',
    a: 'No. Private quizzes are only accessible to you and will not appear in Explore feeds or on public profiles.',
  },
];

export function HelpSettings() {
  const [openFaq, setOpenFaq] = useState(null);
  const [reportText, setReportText] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    const trimmed = reportText.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const subject = trimmed;
      const message = trimmed;
      await api.post('/admin/reports/submit', {
        targetType: 'feedback',
        targetId: 'general',
        targetTitle: 'User Platform Feedback',
        category: 'other',
        reason: subject || 'General Feedback',
        details: message || reportText,
        description: message || reportText,
      });
      setReportSubmitted(true);
      setReportText('');
      toast.success('Thank you for your feedback! Our team will review it.');
      setTimeout(() => setReportSubmitted(false), 5000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Help & About</h2>
          <SettingsInfo text="Browse frequently asked questions, report a bug, or view platform guidelines." />
        </div>
      </div>

      {/* 1. Frequently Asked Questions */}
      <SettingsSection
        title="Frequently Asked Questions"
        description="Quick answers to common questions about quizzes, covers, and creator tools."
        icon={HelpCircle}
      >
        <div className="settings-faq-list">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className={`settings-faq-item ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="settings-faq-question-btn"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                >
                  <span>{faq.q}</span>
                  <ChevronDown size={16} className={`settings-faq-chevron ${isOpen ? 'rotate' : ''}`} />
                </button>
                {isOpen && (
                  <div className="settings-faq-answer">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* 2. Report a Problem */}
      <SettingsSection
        title="Report an Issue or Feedback"
        description="Found a bug or have a suggestion to improve QuizFocus? Send us a note."
        icon={MessageSquare}
      >
        {reportSubmitted ? (
          <div className="settings-alert-banner success">
            <Check size={16} />
            <span>Thank you for your feedback! Our engineering team will review it.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmitReport} className="settings-report-form">
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Describe what happened or what you would like to see improved..."
              rows={3}
              className="settings-textarea-control"
              required
            />
            <div className="settings-actions-footer">
              <Button variant="primary" size="sm" type="submit" disabled={!reportText.trim() || submitting}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{submitting ? 'Submitting...' : 'Submit Feedback'}</span>
              </Button>
            </div>
          </form>
        )}
      </SettingsSection>

      {/* 3. Platform Information & Terms */}
      <SettingsSection
        title="About QuizFocus"
        description="Platform version, release info, and community guidelines."
        icon={ShieldCheck}
      >
        <SettingsRow
          title="Platform Version"
          description="QuizFocus Web Application • Modern MCQ Engine"
        >
          <span className="settings-badge-pill">v1.2.0 (Build 2026.10)</span>
        </SettingsRow>

        <SettingsRow
          title="Platform Guide"
          description="Step-by-step documentation on creating, mapping, and sharing quizzes."
        >
          <Link to="/guide" className="settings-link-pill">
            <FileText size={13} />
            <span>Open Guide</span>
          </Link>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default HelpSettings;
