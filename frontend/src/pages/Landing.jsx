import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import Button from '../components/ui/Button';
import PageLayout from '../components/layout/PageLayout';

const FLICKERING_LANGS = [
  { name: 'Spanish', word: 'hola' },
  { name: 'Chinese', word: 'ni hao' },
  { name: 'Japanese', word: 'konnichiwa' },
  { name: 'Russian', word: 'privet' },
  { name: 'French', word: 'bonjour' },
  { name: 'German', word: 'hallo' },
  { name: 'Korean', word: 'annyeong' },
  { name: 'Arabic', word: 'marhaba' },
  { name: 'Italian', word: 'ciao' },
  { name: 'Portuguese', word: 'olá' },
  { name: 'Hebrew', word: 'shalom' },
  { name: 'Polish', word: 'cześć' },
];

function FlickeringWord() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % FLICKERING_LANGS.length);
        setFade(true);
      }, 200);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  // Render all names invisibly to hold the width of the widest one,
  // then absolutely-position the visible name on top.
  return (
    <span className="inline-flex justify-center relative">
      {/* invisible sizer — tallest/widest word sets the box */}
      <span className="invisible select-none font-medium" aria-hidden>
        {FLICKERING_LANGS.reduce((a, b) => a.name.length >= b.name.length ? a : b).name}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center text-accent font-medium transition-opacity duration-200 ${
          fade ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {FLICKERING_LANGS[index].name}
      </span>
    </span>
  );
}

function FlickeringGreeting() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % FLICKERING_LANGS.length);
        setFade(true);
      }, 200);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex justify-center relative">
      <span className="invisible select-none italic" aria-hidden>
        {FLICKERING_LANGS.reduce((a, b) => a.word.length >= b.word.length ? a : b).word}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center text-accent/60 italic transition-opacity duration-200 ${
          fade ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {FLICKERING_LANGS[index].word}
      </span>
    </span>
  );
}

export default function Landing() {
  const { currentUser, error } = useUser();
  const navigate = useNavigate();

  function handleGetStarted() {
    if (currentUser) {
      navigate('/tutorial');
    }
  }

  return (
    <PageLayout className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="text-center max-w-xl">
        <h1 className="font-serif text-5xl font-semibold mb-4 tracking-tight">
          Gradient
        </h1>
        <p className="text-lg text-text-muted mb-2">
          Learn <FlickeringWord /> by reading. <FlickeringGreeting />
        </p>
        <p className="text-text-muted mb-10 leading-relaxed">
          Your text transforms gradually from English to any target language, introducing
          grammar and vocabulary one layer at a time. No flashcards, no drills
          &mdash; just reading.
        </p>

        <div className="space-y-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : currentUser ? (
            <Button size="lg" onClick={handleGetStarted}>
              Get started
            </Button>
          ) : (
            <p className="text-sm text-text-muted">
              Select a user above to begin.
            </p>
          )}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 text-left">
          <div>
            <div className="text-sm font-medium mb-1">Grammar first</div>
            <p className="text-sm text-text-muted">
              Sentence structure shifts before vocabulary changes, so
              the target language grammar feels natural.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">8 levels</div>
            <p className="text-sm text-text-muted">
              From pure English to full target language, each level adds one
              linguistic feature.
            </p>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Footnotes</div>
            <p className="text-sm text-text-muted">
              Every new element is explained in the side panel,
              exactly when it first appears.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
