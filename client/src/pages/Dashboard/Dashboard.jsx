import { useEffect, useState } from 'react';
import { Card, Button, Spinner } from '../../components/ui';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import QuizDetailsModal from '../../components/QuizModal/QuizDetailsModal';

export default function Dashboard() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState(null);

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const res = await api.get('/quiz/my');
        setQuizzes(res.data.data.quizzes);
      } catch (err) {
        console.error('Failed to load quizzes', err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuizzes();
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', py: 60 }}><Spinner size={40} /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>My Quizzes</h1>
        <Link to="/upload" style={{ textDecoration: 'none' }}>
          <Button>Upload New File</Button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
        {quizzes.length === 0 ? (
          <Card style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>You haven't uploaded any quizzes yet.</p>
            <Link to="/upload" style={{ textDecoration: 'none' }}>
              <Button variant="secondary">Create your first quiz</Button>
            </Link>
          </Card>
        ) : (
          quizzes.map(quiz => (
            <Card 
              key={quiz._id} 
              style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'transform 0.2s', ':hover': { transform: 'translateY(-4px)' } }}
              onClick={() => setSelectedQuizId(quiz._id)}
            >
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{quiz.title}</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <span>{quiz.questionCount} Questions</span>
                <span>{new Date(quiz.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Attempts: {quiz.totalAttempts || 0}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', gap: 8 }}>
                <Button style={{ width: '100%' }} variant="secondary">View Details</Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {selectedQuizId && (
        <QuizDetailsModal 
          quizId={selectedQuizId} 
          onClose={() => setSelectedQuizId(null)} 
        />
      )}
    </div>
  );
}
