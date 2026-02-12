import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Card from '../components/ui/Card';
import Flag from '../components/ui/Flag';
import { ALPHABETS, getTabChars } from '../data/alphabets';
import { loadProgress, getLearnedCount, getDueChars, getMasteryLevel } from '../utils/alphabetProgress';

const SCRIPT_ORDER = ['ja', 'ko', 'zh', 'ru', 'he', 'ar'];

function TabProgress({ langCode, tab, progress }) {
  const chars = useMemo(() => getTabChars(tab), [tab]);
  const learned = getLearnedCount(progress, langCode, tab.id, chars);
  const due = getDueChars(progress, langCode, tab.id, chars).length;
  const total = chars.length;

  const masteredCount = chars.filter(
    (c) => getMasteryLevel(progress, langCode, tab.id, c.char) === 'mastered'
  ).length;
  const learningCount = learned - masteredCount;

  const pctLearning = total > 0 ? (learningCount / total) * 100 : 0;
  const pctMastered = total > 0 ? (masteredCount / total) * 100 : 0;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
        <span>{tab.label}</span>
        <span>
          {learned}/{total} learned
          {due > 0 && <span className="text-amber-600 ml-1">({due} due)</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden flex">
        <div
          className="bg-emerald-400 dark:bg-emerald-500 transition-all"
          style={{ width: `${pctMastered}%` }}
        />
        <div
          className="bg-amber-300 dark:bg-amber-500 transition-all"
          style={{ width: `${pctLearning}%` }}
        />
      </div>
    </div>
  );
}

export default function Scripts() {
  const [progress, setProgress] = useState({});

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  return (
    <PageLayout>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold">Scripts</h1>
        <p className="text-sm text-text-muted mt-1">
          Learn non-Latin writing systems with interactive practice and spaced repetition
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
          Mastered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm bg-amber-300 dark:bg-amber-500" />
          Learning
        </span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCRIPT_ORDER.map((code) => {
          const alphabet = ALPHABETS[code];
          if (!alphabet) return null;

          const totalChars = alphabet.tabs.reduce(
            (sum, tab) => sum + getTabChars(tab).length,
            0
          );

          return (
            <Link
              key={code}
              to={`/alphabet/${code}`}
              className="no-underline text-text"
            >
              <Card className="p-5 h-full hover:ring-2 hover:ring-accent/40 transition-shadow">
                <div className="flex items-center gap-3 mb-1">
                  <Flag code={code} size="md" />
                  <div>
                    <div className="font-medium text-base">{alphabet.name}</div>
                    <div className="text-xs text-text-muted">
                      {totalChars} characters
                      {alphabet.tabs.length > 1 &&
                        ` \u00b7 ${alphabet.tabs.map((t) => t.label).join(', ')}`}
                    </div>
                  </div>
                </div>

                {/* Sample characters */}
                <div className="flex gap-2 mt-3 text-xl font-serif text-text-muted">
                  {getTabChars(alphabet.tabs[0])
                    .slice(0, 6)
                    .map((c) => (
                      <span key={c.char}>{c.char}</span>
                    ))}
                  <span className="text-sm self-end">...</span>
                </div>

                {/* Per-tab progress bars */}
                {alphabet.tabs.map((tab) => (
                  <TabProgress
                    key={tab.id}
                    langCode={code}
                    tab={tab}
                    progress={progress}
                  />
                ))}
              </Card>
            </Link>
          );
        })}
      </div>
    </PageLayout>
  );
}
