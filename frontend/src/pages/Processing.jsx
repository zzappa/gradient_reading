import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { getJobStatus, getProject, getChapters, getProjectJob } from '../api/client';
import { nameFor } from '../languages';
import Flag from '../components/ui/Flag';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import PageLayout from '../components/layout/PageLayout';

const POLL_INTERVAL = 2000;

// Sample words that cycle through the matrix animation
const MATRIX_WORDS = {
  es: ['hola', 'gato', 'casa', 'libro', 'amigo', 'tiempo', 'mundo', 'vida', 'agua', 'sol', 'luna', 'cielo', 'mar', 'fuego', 'tierra'],
  fr: ['bonjour', 'chat', 'maison', 'livre', 'ami', 'temps', 'monde', 'vie', 'eau', 'soleil', 'lune', 'ciel', 'mer', 'feu', 'terre'],
  de: ['hallo', 'Katze', 'Haus', 'Buch', 'Freund', 'Zeit', 'Welt', 'Leben', 'Wasser', 'Sonne', 'Mond', 'Himmel', 'Meer', 'Feuer', 'Erde'],
  it: ['ciao', 'gatto', 'casa', 'libro', 'amico', 'tempo', 'mondo', 'vita', 'acqua', 'sole', 'luna', 'cielo', 'mare', 'fuoco', 'terra'],
  pt: ['olá', 'gato', 'casa', 'livro', 'amigo', 'tempo', 'mundo', 'vida', 'água', 'sol', 'lua', 'céu', 'mar', 'fogo', 'terra'],
  ru: ['privet', 'koshka', 'dom', 'kniga', 'drug', 'vremya', 'mir', 'zhizn', 'voda', 'solntse', 'luna', 'nebo', 'more', 'ogon', 'zemlya'],
  ja: ['neko', 'ie', 'hon', 'tomodachi', 'jikan', 'sekai', 'inochi', 'mizu', 'taiyou', 'tsuki', 'sora', 'umi', 'hi', 'chi'],
  zh: ['ni hao', 'mao', 'jia', 'shu', 'pengyou', 'shijian', 'shijie', 'shengming', 'shui', 'taiyang', 'yueliang', 'tian', 'hai', 'huo'],
  ko: ['annyeong', 'goyangi', 'jip', 'chaek', 'chingu', 'sigan', 'sesang', 'saengmyeong', 'mul', 'hae', 'dal', 'haneul', 'bada', 'bul'],
  pl: ['cześć', 'kot', 'dom', 'książka', 'przyjaciel', 'czas', 'świat', 'życie', 'woda', 'słońce', 'księżyc', 'niebo', 'morze', 'ogień'],
  he: ['shalom', 'chatul', 'bayit', 'sefer', 'chaver', 'zman', 'olam', 'chayim', 'mayim', 'shemesh', 'yareach', 'shamayim', 'yam', 'esh'],
  ar: ['marhaba', 'qitta', 'bayt', 'kitab', 'sadiq', 'waqt', 'aalam', 'hayat', 'maa', 'shams', 'qamar', 'samaa', 'bahr', 'nar'],
};

const EN_WORDS = ['hello', 'cat', 'house', 'book', 'friend', 'time', 'world', 'life', 'water', 'sun', 'moon', 'sky', 'sea', 'fire', 'earth'];

function MatrixAnimation({ targetLang }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const targetWords = MATRIX_WORDS[targetLang] || MATRIX_WORDS.es;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DPR = window.devicePixelRatio || 1;

    function resize() {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = Math.floor(width * DPR);
      canvas.height = Math.floor(height * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;

    const particles = [];
    const particleCount = Math.max(40, Math.floor((W * H) / 35000));
    for (let i = 0; i < particleCount; i++) {
      const isTarget = Math.random() > 0.4;
      const wordList = isTarget ? targetWords : EN_WORDS;
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        word: wordList[Math.floor(Math.random() * wordList.length)],
        isTarget,
        opacity: Math.random() * 0.35 + 0.55,
        speed: Math.random() * 0.55 + 0.25,
        size: Math.random() * 10 + 18,
        morphTimer: Math.random() * 200,
        morphInterval: Math.random() * 180 + 90,
      });
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.y -= p.speed;
        if (p.y < -20) {
          p.y = H + 20;
          p.x = Math.random() * W;
        }

        p.morphTimer++;
        if (p.morphTimer >= p.morphInterval) {
          p.morphTimer = 0;
          p.isTarget = !p.isTarget;
          const wordList = p.isTarget ? targetWords : EN_WORDS;
          p.word = wordList[Math.floor(Math.random() * wordList.length)];
          p.opacity = Math.random() * 0.35 + 0.5;
        }

        const morphProgress = p.morphTimer / p.morphInterval;
        const glowStrength = morphProgress < 0.12 ? (morphProgress / 0.12) : 1;

        ctx.save();
        ctx.globalAlpha = p.opacity * (0.7 + glowStrength * 0.3);
        ctx.font = `${p.size}px "Georgia", serif`;
        ctx.fillStyle = p.isTarget ? '#10b981' : '#9ca3af';
        ctx.shadowBlur = p.isTarget ? 12 : 7;
        ctx.shadowColor = p.isTarget ? 'rgba(16, 185, 129, 0.45)' : 'rgba(156, 163, 175, 0.35)';
        ctx.fillText(p.word, p.x, p.y);
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [targetLang, targetWords]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.92 }}
    />
  );
}

export default function Processing() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [jobId, setJobId] = useState(location.state?.jobId || null);
  const [job, setJob] = useState(null);
  const [project, setProject] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load project info
  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  // If no jobId from navigation state, look it up from the project
  useEffect(() => {
    if (jobId) {
      setInitialLoading(false);
      return;
    }
    getProjectJob(projectId)
      .then((j) => {
        setJobId(j.id);
        setJob(j);
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [projectId, jobId]);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    let active = true;

    async function poll() {
      try {
        const status = await getJobStatus(jobId);
        if (!active) return;
        setJob(status);

        const ch = await getChapters(projectId);
        if (!active) return;
        setChapters(ch);

        if (status.status === 'running' || status.status === 'processing') {
          setTimeout(poll, POLL_INTERVAL);
        }
      } catch {
        if (active) setTimeout(poll, POLL_INTERVAL);
      }
    }

    poll();
    return () => { active = false; };
  }, [jobId, projectId]);

  const totalLevels = 7;
  const currentLevel = job?.current_chapter ? job.current_chapter - 1 : 0;
  const pct = job && job.total_chapters > 0
    ? Math.round((job.completed_chapters / job.total_chapters) * 100)
    : 0;

  const isRunning = !job || job.status === 'running' || job.status === 'processing';
  const isComplete = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  // Show animation while running OR while we're still loading initial data
  const showAnimation = isRunning && !initialLoading;

  return (
    <PageLayout>
      <div className="relative min-h-[calc(100vh-3.5rem)]">
        {/* Matrix background animation */}
        {showAnimation && (
          <div className="fixed inset-x-0 top-14 bottom-0 overflow-hidden pointer-events-none">
            <MatrixAnimation targetLang={project?.target_language || 'es'} />
          </div>
        )}

        <div className="relative z-10">
          <h1 className="font-serif text-3xl font-semibold mb-1">
            {project ? <><Flag code={project.target_language} /> {project.title}</> : 'Processing...'}
          </h1>
          {project && (
            <p className="text-sm text-text-muted mb-8">
              {isComplete
                ? `Transformation complete \u2014 ${nameFor(project.target_language)} gradient ready.`
                : isFailed
                  ? 'Transformation failed.'
                  : `Transforming your text into ${nameFor(project.target_language)} through gradient levels...`}
            </p>
          )}

          {/* Progress section — always show, even before job arrives */}
          <div className="mb-8 bg-bg/80 backdrop-blur-sm rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="font-medium">
                {initialLoading
                  ? 'Loading...'
                  : isComplete
                    ? 'Transformation complete'
                    : isFailed
                      ? 'Transformation failed'
                      : job
                        ? `Transforming level ${currentLevel} of ${totalLevels}...`
                        : 'Starting transformation...'}
              </span>
              <span className="text-text-muted font-mono">{pct}%</span>
            </div>

            {/* Main progress bar */}
            <div className="h-3 bg-surface rounded-full overflow-hidden mb-4">
              {isRunning && !job ? (
                /* Indeterminate animation while waiting for first poll */
                <div className="h-full bg-accent rounded-full animate-pulse w-1/4" />
              ) : pct > 0 ? (
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    isFailed ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-accent'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              ) : null}
            </div>

            {/* Level dots */}
            <div className="flex items-center justify-between">
              {Array.from({ length: totalLevels + 1 }, (_, i) => {
                const levelNum = i;
                const chapterForLevel = chapters.find((c) => c.level === levelNum);
                const isDone = chapterForLevel?.status === 'completed';
                const isProcessing = chapterForLevel?.status === 'processing';

                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-500 ${
                        isDone
                          ? 'bg-emerald-500 text-white scale-100'
                          : isProcessing
                            ? 'bg-accent text-white animate-pulse scale-110'
                            : 'bg-surface text-text-muted scale-90'
                      }`}
                    >
                      {isDone ? '\u2713' : levelNum}
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {levelNum === 0 ? 'Src' : `Lv${levelNum}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {job?.error_message && (
              <p className="text-sm text-red-600 mt-4 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{job.error_message}</p>
            )}
          </div>

          {!jobId && !initialLoading && chapters.length === 0 && (
            <p className="text-text-muted">
              No job information available.{' '}
              <button
                className="text-accent hover:text-accent-hover"
                onClick={() => navigate('/dashboard')}
              >
                Return to dashboard
              </button>
            </p>
          )}

          {(isComplete || chapters.some((c) => c.status === 'completed' && c.level > 0)) && (
            <Button onClick={() => navigate(`/project/${projectId}/read`)}>
              {isComplete ? 'Start reading' : 'Preview (still processing...)'}
            </Button>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
