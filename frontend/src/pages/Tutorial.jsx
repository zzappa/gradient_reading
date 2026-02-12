import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageLayout from '../components/layout/PageLayout';

const EXAMPLES = [
  {
    level: 0,
    label: 'Level 0 — Pure English',
    text: 'The red house has a big garden.',
  },
  {
    level: 2,
    label: 'Level 2 — Gender + articles',
    text: 'La house rojo has un garden grande.',
  },
  {
    level: 4,
    label: 'Level 4 — Verb conjugation',
    text: 'La house rojo tiene un garden grande.',
  },
  {
    level: 7,
    label: 'Level 7 — Full Spanish',
    text: 'La casa roja tiene un jard\u00edn grande.',
  },
];

export default function Tutorial() {
  const navigate = useNavigate();

  return (
    <PageLayout>
      <h1 className="font-serif text-3xl font-semibold mb-2">How it works</h1>
      <p className="text-text-muted mb-10">
        Gradient transforms your text gradually, one linguistic layer at a time.
      </p>

      {/* What is this? */}
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-2">What is this?</h2>
        <p className="text-text-muted leading-relaxed">
          This app transforms English text into Spanish gradually, so you
          learn by reading instead of memorizing. Paste any text, and it comes
          back as a series of chapters that shift from English to Spanish
          one layer at a time.
        </p>
      </section>

      {/* How it works */}
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-4">The gradient in action</h2>
        <div className="space-y-3">
          {EXAMPLES.map((ex) => (
            <div
              key={ex.level}
              className="flex items-baseline gap-4 p-4 bg-surface rounded-lg"
            >
              <span className="text-xs font-medium text-text-muted whitespace-nowrap w-48 shrink-0">
                {ex.label}
              </span>
              <span className="font-serif text-base">{ex.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* What to expect */}
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-2">What to expect</h2>
        <p className="text-text-muted leading-relaxed">
          Early chapters will feel mostly English with a few structural changes.
          By the end, you will be reading Spanish. The shift happens so gradually
          that each chapter feels only slightly different from the last.
        </p>
      </section>

      {/* Footnotes + Tips */}
      <section className="mb-10 space-y-4 text-text-muted leading-relaxed">
        <p>
          <strong className="text-text">Grammar before vocabulary.</strong>{' '}
          Structural changes come first &mdash; word order, articles, verb forms &mdash;
          before any English words are replaced. This way, Spanish grammar
          already feels familiar by the time new words appear.
        </p>
        <p>
          <strong className="text-text">Footnotes guide you.</strong> Every
          time a new Spanish element appears, you will see an explanation in
          the side panel. These only show up once per term, so the reading
          stays clean.
        </p>
        <p>
          <strong className="text-text">Keep reading.</strong> If a sentence
          feels hard, keep going. Context helps more than stopping to study.
          You will be surprised how much you understand.
        </p>
      </section>

      {/* Ready? */}
      <section>
        <h2 className="text-lg font-medium mb-4">Ready?</h2>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/assessment')}>
            Take the assessment
          </Button>
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Skip to dashboard
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
