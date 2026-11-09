import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import CompetitionStandings from './CompetitionStandings';

export default function CompetitionLeaderboardPage() {
  const { quizId } = useParams();
  return <div className="contest-page">
    <Link className="contest-back" to="/challenges"><ArrowLeft size={16} aria-hidden="true" /> Back to Arena</Link>
    <CompetitionStandings key={quizId} challengeId={quizId} />
  </div>;
}
