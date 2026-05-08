import { Card, Button } from '../../components/ui';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 64, py: 40 }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 800, marginTop: 40 }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: 24, lineHeight: 1.2 }}>
          Turn any <span className="gradient-text">Spreadsheet</span> into an<br/> Interactive Quiz.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--color-text-secondary)', marginBottom: 40, lineHeight: 1.6 }}>
          Upload your Excel, CSV, or JSON file. Our smart engine automatically detects your questions, options, and answers, generating a beautiful quiz in seconds.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link to="/upload" style={{ textDecoration: 'none' }}>
            <Button size="lg" style={{ minWidth: 200 }}>Upload Now</Button>
          </Link>
          <Link to="/register" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="lg" style={{ minWidth: 200 }}>Create Account</Button>
          </Link>
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, width: '100%', marginTop: 40 }}>
        <FeatureCard 
          icon="🧠" 
          title="Smart Detection" 
          desc="AI-powered column mapping automatically figures out your data structure. No manual formatting required." 
        />
        <FeatureCard 
          icon="⚡" 
          title="Instant Generation" 
          desc="Go from raw spreadsheet to fully interactive, beautiful quiz interface in milliseconds." 
        />
        <FeatureCard 
          icon="📊" 
          title="Detailed Results" 
          desc="Track performance with comprehensive analytics, score breakdowns, and question-by-question review." 
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <Card style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 32, background: 'var(--color-surface-alt)', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
        {icon}
      </div>
      <h3 style={{ fontSize: 20, fontWeight: 600 }}>{title}</h3>
      <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{desc}</p>
    </Card>
  );
}
