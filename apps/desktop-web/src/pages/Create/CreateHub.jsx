import { rankSearchResults } from '../../components/search/rankSearchResults';
import { usePageSearch } from '../../components/search/PageSearchContext';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Trophy,
  Upload,
  FileText,
  ArrowUpRight,
} from 'lucide-react';
import './CreateHub.css';

export default function CreateHub() {
  const { query } = usePageSearch();
  const visibleOptions = rankSearchResults([
    { id: 'quiz', label: 'Quiz', terms: 'quiz self-paced build create', path: '/create/quiz', Icon: Sparkles },
    { id: 'challenge', label: 'Challenge', terms: 'challenge competitive host', path: '/create/challenge', Icon: Trophy },
    { id: 'import', label: 'Import Sheet', terms: 'import csv xlsx spreadsheet upload', path: '/create/upload', Icon: Upload },
    { id: 'pdf', label: 'Import PDFs', terms: 'import document text pdf upload', path: '/create/import-pdf', Icon: FileText },
  ], query, option => [option.label, option.terms]);

  return (
    <div className="hub-viewport">
      <main className="hub-container">
        {visibleOptions.length ? (
          <div className="hub-grid">
            {visibleOptions.map(({ id, label, path, Icon }) => (
              <Link
                key={id}
                id={`create-${id}-card`}
                className="hub-minimal-card"
                to={path}
              >
                <div className="card-top-row">
                  <Icon size={20} className="card-primary-icon" />
                  <ArrowUpRight size={15} className="card-corner-arrow" />
                </div>
                <div className="card-bottom-info">
                  <h2 className="card-title">{label}</h2>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="hub-empty-state">No creation options match “{query}”.</p>
        )}
      </main>

    </div>
  );
}
