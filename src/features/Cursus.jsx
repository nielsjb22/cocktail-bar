// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useEffect, useMemo, useRef, useContext } from "react";
import { COURSE_LESSONS, COURSE_PARTS, FINAL_EXAM } from "../course.js";
import { GraduationCap, ChevronRight, Check, Lock, ChevronDown, X, Landmark, Wrench, Wine, Snowflake, FlaskRound, Droplets, Citrus, Cherry, Martini, Thermometer, Scale, Layers, PenTool, ClipboardList, ListChecks, Users, HeartHandshake, Award, Leaf, Droplet, Sparkles, CloudFog } from "lucide-react";
import { createPortal } from "react-dom";
import { canonicalRecipeId } from "../recipes.js";
import { AnimatedNumber, BORDER, BOTTLE, BOTTLE_DARK, BRASS, BRASS_TEXT, BURGUNDY, COURSE_PART_COUNT, CREAM, ConfirmDialog, CourseRing, EdgeSwipeBackArea, HEADER_TEXT, INK, MUTED, NavOverrideContext, ON_DARK_TEXT, PAPER, PAPER_DEEP, QUIZ_PASS_RATIO, RADIUS, RecipeCircle, SAGE, SHADOW_CARD, SHADOW_CTA, SHADOW_HERO, SectionLabel, TechniqueAnimation, computeCourseInsights, computeCourseMastery, computeCourseRank, courseRankHint, sans, serif, systemFont, useBodyScrollLock } from "../ThuisbarApp.jsx";

function LessonBlock({ block }) {
  if (block.type === "h3") return <h3 style={{ fontFamily: systemFont, fontSize: 16.5, color: BOTTLE, margin: "20px 0 8px" }}>{block.text}</h3>;
  if (block.type === "p") return <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.7, margin: "0 0 12px" }}>{block.text}</p>;
  if (block.type === "table") {
    return (
      <div style={{ overflowX: "auto", margin: "12px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{block.headers.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "6px 8px", fontFamily: sans, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: "6px 8px", borderBottom: `1px solid ${BORDER}`, color: INK }}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "box") {
    const colors = { tip: SAGE, warning: BURGUNDY, history: BRASS }[block.kind] || BRASS;
    return (
      <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${colors}`, borderRadius: RADIUS, padding: "12px 15px", margin: "14px 0" }}>
        <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: colors, marginBottom: 5 }}>{block.label}</div>
        <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.55 }}>{block.text}</p>
      </div>
    );
  }
  if (block.type === "technique-demo") {
    return <div style={{ margin: "6px 0 16px", maxWidth: 340 }}><TechniqueAnimation technique={block.technique} /></div>;
  }
  return null;
}

function shuffledIndexes(n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

// Toets als vast, schermvullend scherm: bovenaan voortgang en sluiten,
// in het midden één vraag, onderaan altijd op dezelfde plek de knop. Je
// kunt niet per ongeluk terugscrollen in de les. Na de laatste vraag de
// score, met opnieuw, terug naar de les of door naar de volgende stap.
function QuizBlock({ quiz, title = "Vragen", onFinish, onClose, nextAction = null }) {
  useBodyScrollLock();
  const [attempt, setAttempt] = useState(0);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  // Antwoordvolgorde per poging opnieuw gehusseld: de plek van het goede
  // antwoord verraadt niets, ook niet bij een tweede poging.
  const orders = useMemo(() => quiz.map(q => shuffledIndexes(q.options.length)), [quiz, attempt]);
  const bodyRef = useRef(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [idx, done]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const score = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
  const passed = score / quiz.length >= QUIZ_PASS_RATIO;
  const q = quiz[idx];
  const picked = answers[idx];
  const answered = picked !== undefined;
  const isLast = idx === quiz.length - 1;

  const next = () => {
    if (isLast) { setDone(true); onFinish(score); }
    else setIdx(i => i + 1);
  };
  const retry = () => { setAnswers({}); setIdx(0); setDone(false); setAttempt(n => n + 1); };

  const footerBtn = (label, onClick, { primary = true, disabled = false } = {}) => (
    <button onClick={onClick} disabled={disabled} className="press-scale" style={{
      width: "100%", minHeight: 52, borderRadius: 14, fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: disabled ? "default" : "pointer",
      border: primary ? "none" : `1px solid ${BORDER}`,
      background: disabled ? BORDER : primary ? BOTTLE_DARK : "transparent", color: disabled ? MUTED : primary ? CREAM : INK,
    }}>{label}</button>
  );

  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 45, background: PAPER, color: INK, fontFamily: sans, display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: "calc(env(safe-area-inset-top) + 8px) 20px 10px", maxWidth: 720, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{done ? title : `${title} · vraag ${idx + 1} van ${quiz.length}`}</span>
          <button onClick={onClose} aria-label="Sluiten" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {quiz.map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: done || i < idx || (i === idx && answered) ? BRASS : BORDER }} />)}
        </div>
      </div>

      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px 20px 20px", boxSizing: "border-box" }}>
          {done ? (
            <div className="success-pop" style={{ padding: 18, borderRadius: 16, background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderLeft: `4px solid ${passed ? SAGE : BURGUNDY}`, marginTop: 20 }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 24, color: passed ? SAGE : BURGUNDY }}>{score} van {quiz.length} goed</div>
              <p style={{ fontSize: 15, color: INK, margin: "8px 0 0", lineHeight: 1.5 }}>
                {passed ? "Geslaagd. Dit telt mee voor je rang." : `Je hebt er ${Math.ceil(quiz.length * QUIZ_PASS_RATIO)} goed nodig. Lees de les nog eens en probeer het opnieuw.`}
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: BRASS_TEXT, marginBottom: 8 }}>In de praktijk</div>
              <p style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.3, color: INK, margin: "0 0 18px" }}>{q.q}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {orders[idx].map((oi, n) => {
                  const isSelected = picked === oi;
                  const isCorrect = oi === q.correct;
                  const showRight = answered && isCorrect;
                  const showWrong = answered && isSelected && !isCorrect;
                  return (
                    <button key={`${attempt}-${idx}-${oi}`} disabled={answered} onClick={() => setAnswers(prev => ({ ...prev, [idx]: oi }))} style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, textAlign: "left", padding: "10px 14px", boxSizing: "border-box",
                      borderRadius: 14, cursor: answered ? "default" : "pointer", fontSize: 15, lineHeight: 1.4, fontFamily: sans, color: INK,
                      background: showRight ? "rgba(92,122,82,0.14)" : showWrong ? "rgba(122,46,42,0.08)" : CREAM,
                      border: showRight ? `1.5px solid ${SAGE}` : showWrong ? `1.5px solid ${BURGUNDY}` : `1px solid ${BORDER}`,
                      opacity: answered && !showRight && !showWrong ? 0.6 : 1,
                    }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12.5, fontWeight: 700, fontFamily: systemFont,
                        background: showRight ? SAGE : showWrong ? BURGUNDY : "transparent", color: showRight || showWrong ? CREAM : MUTED,
                        border: showRight || showWrong ? "none" : `1.5px solid ${BORDER}`,
                      }}>{showRight ? <Check size={14} strokeWidth={3} /> : showWrong ? <X size={14} strokeWidth={3} /> : "ABCD"[n]}</span>
                      <span style={{ flex: 1 }}>{q.options[oi]}</span>
                    </button>
                  );
                })}
              </div>
              {answered && (
                <div className="accordion-reveal" style={{ marginTop: 14, padding: "13px 15px", borderRadius: 14, background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderLeft: `4px solid ${picked === q.correct ? SAGE : BURGUNDY}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: picked === q.correct ? SAGE : BURGUNDY, marginBottom: 3 }}>{picked === q.correct ? "Goed" : "Niet helemaal"}</div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: 0, color: INK }}>{q.explain}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: PAPER, padding: "12px 20px calc(env(safe-area-inset-bottom) + 12px)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {!done ? (
            footerBtn(isLast ? "Bekijk je score" : "Volgende vraag", next, { disabled: !answered })
          ) : passed && nextAction ? (
            <>
              {footerBtn(nextAction.label, nextAction.onClick)}
              {footerBtn("Terug naar de les", onClose, { primary: false })}
            </>
          ) : (
            <>
              {footerBtn(passed ? "Klaar" : "Opnieuw proberen", passed ? onClose : retry)}
              {footerBtn(passed ? "Nog een keer" : "Terug naar de les", passed ? retry : onClose, { primary: false })}
            </>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

// Eigen illustratie per les in de app-stijl (goud op donkergroen, zelfde
// beeldtaal als het app-icoon) i.p.v. externe Unsplash-foto's: volledig
// lokaal, werkt offline en geen licentievragen. Eén icoon per lesonderwerp.
const LESSON_ICONS = {
  geschiedenis: Landmark, uitrusting: Wrench, glaswerk: Wine, ijs: Snowflake,
  gedistilleerd: FlaskRound, "likeuren-bitters": Droplets, vers: Citrus, garnering: Cherry,
  basistechnieken: Martini, "verdunning-temperatuur": Thermometer, "sour-formule": Scale, finesse: Layers,
  families: Scale, smaakcombinatie: FlaskRound, ontwerpen: PenTool, menu: ClipboardList,
  "mise-en-place": ListChecks, "batchen-groepen": Users, gastvrijheid: HeartHandshake, signature: Award,
  infusies: Leaf, "fat-washing": Droplet, clarificatie: Sparkles, "carbonatie-rook": CloudFog,
};

const LESSON_ART_BG = `radial-gradient(ellipse 140% 120% at 25% 10%, #2A4B42, ${BOTTLE_DARK} 75%)`;

function LessonArt({ lesson, variant = "thumb" }) {
  const Icon = LESSON_ICONS[lesson.id] || GraduationCap;
  if (variant === "thumb") {
    return (
      <div aria-hidden style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: LESSON_ART_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color="#DDB877" strokeWidth={1.8} />
      </div>
    );
  }
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, background: LESSON_ART_BG, overflow: "hidden" }}>
      {/* Groot, vaag icoon rechts als achtergrondtextuur. */}
      <Icon size={190} color="#B8862E" strokeWidth={1} style={{ position: "absolute", right: -30, top: -18, opacity: 0.13 }} />
      <div style={{ position: "absolute", left: 18, top: 18, width: 64, height: 64, borderRadius: "50%", border: "1.5px solid rgba(184,134,46,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={30} color="#DDB877" strokeWidth={1.7} />
      </div>
    </div>
  );
}

// Les in de praktijkopbouw: waarom, de kern, wat je proeft, zo doe je het,
// een veelgemaakte fout en iets om zelf te maken (met recept en check-in).
const PRACTICE_TONES = { rood: BURGUNDY, bruin: "#8A6A4A", groen: "#4F6B46" };

function PracticeLessonBody({ lesson, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const label = (text, color = BRASS_TEXT) => (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color, marginBottom: 8, fontFamily: sans }}>{text}</div>
  );
  const recipe = lesson.tryIt?.recipeId ? (recipes || []).find(r => r.id === canonicalRecipeId(lesson.tryIt.recipeId)) : null;
  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
        {lessonMinutes(lesson)} min lezen
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: INK, margin: "6px 0 20px" }}>{lesson.title}</h2>

      {label("Waarom dit ertoe doet")}
      <p style={{ fontSize: 16, lineHeight: 1.6, color: INK, margin: "0 0 24px" }}>{lesson.intro}</p>

      {label("De kern")}
      {lesson.core.map((t, i) => <p key={i} style={{ fontSize: 15.5, lineHeight: 1.65, color: INK, margin: i === lesson.core.length - 1 ? "0 0 24px" : "0 0 10px" }}>{t}</p>)}

      {lesson.taste && (
        <>
          {label(lesson.taste.title)}
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, padding: "0 14px", marginBottom: 24 }}>
            {lesson.taste.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "12px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ flexShrink: 0, width: 78, fontSize: 13.5, fontWeight: 700, color: PRACTICE_TONES[r.tone] || INK }}>{r.label}</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.45, color: INK }}>{r.text}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {label("Zo doe je het")}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
        {lesson.steps.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: BOTTLE, color: CREAM, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: systemFont }}>{i + 1}</span>
            <span style={{ fontSize: 15, lineHeight: 1.55, paddingTop: 2, color: INK }}>{t}</span>
          </div>
        ))}
      </div>

      {lesson.demos?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {lesson.demos.map(t => (
            <div key={t} style={{ maxWidth: 340 }}>
              <TechniqueAnimation technique={t} />
              <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textAlign: "center", marginTop: 6 }}>{{ shaken: "Shaken", stirred: "Roeren", muddle: "Muddelen" }[t] || t}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "14px 16px", borderRadius: 14, background: PAPER_DEEP, marginBottom: 24 }}>
        {label("Veelgemaakte fout", BURGUNDY)}
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, color: INK }}>{lesson.mistake}</p>
      </div>

      {lesson.tryIt && (
        <>
          {label("Probeer het zelf")}
          <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: recipe ? "0 0 14px" : 0 }}>{lesson.tryIt.text}</p>
            {recipe && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)", marginBottom: onCheckin ? 12 : 0 }}>
                <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={44} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 16, fontWeight: 700 }}>{recipe.name}</span>
                {onOpenRecipe && (
                  <button onClick={() => onOpenRecipe(recipe.id)} style={{ minHeight: 44, padding: "0 6px", background: "none", border: "none", color: "#DDB877", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>Recept</button>
                )}
              </div>
            )}
            {recipe && onCheckin && (
              <button onClick={() => onCheckin(recipe.name)} className="press-scale" style={{ width: "100%", minHeight: 48, borderRadius: 12, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
                Gemaakt: check in
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LessonView({ lesson, progress, onBack, onComplete, nextLesson, onGoToLesson, onGoToExam, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  // Binnen Bar → Cursus neemt de les de bovenste navigatiebalk over
  // ("‹ Cursus · Les 3") i.p.v. een tweede terugknop eronder; in gastmodus
  // (geen balk) blijft de losse terugknop staan.
  const setNavOverride = useContext(NavOverrideContext);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({ label: "Cursus", title: `Les ${lesson.number}`, onBack: () => onBackRef.current() });
    return () => setNavOverride(null);
  }, [setNavOverride, lesson.number]);

  return (
    <EdgeSwipeBackArea onBack={onBack}>
      {!setNavOverride && (
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, fontFamily: sans }}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar overzicht
        </button>
      )}

      <div style={{ position: "relative", height: 150, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 20, boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}` }}>
        <LessonArt lesson={lesson} variant="hero" />
        <div style={{ position: "absolute", left: 18, bottom: 14, fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D9CBAE" }}>
          Les {lesson.number} &middot; {COURSE_PARTS.find(p => p.id === lesson.part)?.title}
        </div>
      </div>
      {lesson.format === "praktijk" ? (
        <PracticeLessonBody lesson={lesson} recipes={recipes} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} onCheckin={onCheckin} />
      ) : (
        <>
          <h2 style={{ fontFamily: systemFont, fontSize: 27, fontWeight: 700, color: INK, margin: "0 0 14px" }}>{lesson.title}</h2>
          <p style={{ fontStyle: "italic", color: MUTED, fontSize: 14, borderLeft: `3px solid ${BRASS}`, paddingLeft: 14, margin: "0 0 22px", lineHeight: 1.55 }}>{lesson.intro}</p>

          {lesson.blocks.map((b, i) => <LessonBlock key={i} block={b} />)}

          <div style={{ marginTop: 24, marginBottom: 24, background: BOTTLE, color: CREAM, borderRadius: RADIUS, padding: "16px 18px", boxShadow: SHADOW_CARD }}>
            <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D8CFA0", marginBottom: 8 }}>Kernpunten van deze les</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lesson.takeaways.map((t, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 5, lineHeight: 1.5 }}>{t}</li>)}
            </ul>
          </div>
        </>
      )}

      {showQuiz && (
        <QuizBlock quiz={lesson.quiz} title={`Les ${lesson.number}`}
          onClose={() => setShowQuiz(false)}
          onFinish={(score) => { onComplete(score, lesson.quiz.length); setQuizDone(score / lesson.quiz.length >= QUIZ_PASS_RATIO); }}
          nextAction={nextLesson
            ? { label: `Volgende les: ${nextLesson.title}`, onClick: () => { setShowQuiz(false); onGoToLesson(nextLesson.id); } }
            : { label: "Naar de eindtoets", onClick: () => { setShowQuiz(false); onGoToExam(); } }} />
      )}
      {(
        <button onClick={() => setShowQuiz(true)} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 8,
          background: BOTTLE_DARK, color: HEADER_TEXT, border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: sans,
        }}>
          {quizDone || progress?.completed ? "Vragen nog een keer" : "Naar de vragen"} <ChevronRight size={17} />
        </button>
      )}

      {quizDone && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
          {nextLesson ? (
            <button onClick={() => onGoToLesson(nextLesson.id)} style={{ display: "flex", alignItems: "center", gap: 8, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
              Volgende les &middot; {nextLesson.title} <ChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
            </button>
          ) : (
            <button onClick={onGoToExam} style={{ display: "flex", alignItems: "center", gap: 8, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
              <GraduationCap size={16} /> Laatste les gehad &middot; naar de eindtoets
            </button>
          )}
        </div>
      )}
    </EdgeSwipeBackArea>
  );
}

function FinalExamView({ progress, onBack, onComplete }) {
  const [started, setStarted] = useState(false);

  return (
    <EdgeSwipeBackArea onBack={onBack}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, fontFamily: sans }}>
        <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar overzicht
      </button>

      <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>Eindtoets</div>
      <h2 style={{ fontFamily: systemFont, fontSize: 27, fontWeight: 700, color: INK, margin: "0 0 14px" }}>Van Basis tot Pro</h2>
      <p style={{ fontStyle: "italic", color: MUTED, fontSize: 14, borderLeft: `3px solid ${BRASS}`, paddingLeft: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        30 vragen, verspreid over alle zes delen: geschiedenis tot en met geavanceerde technieken. Dit is dezelfde stof als de lessen, maar door elkaar en net iets anders gevraagd, om te checken of de kennis ook echt beklijft.
      </p>

      {progress?.completed && !started && (
        <div style={{ marginBottom: 20, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
          <p style={{ fontSize: 13.5, color: INK, margin: 0 }}>
            Je beste score tot nu toe: <strong>{progress.bestScore}/{progress.total}</strong>.
          </p>
        </div>
      )}

      {!started ? (
        <button onClick={() => setStarted(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
          <GraduationCap size={16} /> {progress?.completed ? "Nog een keer proberen" : "Start de eindtoets"}
        </button>
      ) : (
        <QuizBlock quiz={FINAL_EXAM} title="Eindtoets" onClose={() => setStarted(false)} onFinish={(score) => onComplete(score, FINAL_EXAM.length)} />
      )}
    </EdgeSwipeBackArea>
  );
}

// Leestijd van een les, op ~200 woorden per minuut.
function lessonMinutes(lesson) {
  const text = [lesson.intro, ...(lesson.blocks || []).map(b => [b.text, b.label, ...(b.rows || []).flat()].filter(Boolean).join(" ")), ...(lesson.takeaways || [])].join(" ");
  return Math.max(2, Math.round(text.split(/\s+/).length / 200));
}

function CursusTab({ progress, setProgress, onSound, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const [selectedId, setSelectedId] = useState(null);
  const [examOpen, setExamOpen] = useState(false);
  // Een les of toets openen begint bovenaan, niet halverwege de lessenlijst.
  useEffect(() => { window.scrollTo(0, 0); }, [selectedId, examOpen]);
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const [expandedParts, setExpandedParts] = useState({});
  const lesson = COURSE_LESSONS.find(l => l.id === selectedId) || null;
  const rank = useMemo(() => computeCourseRank(progress), [progress]);
  // Een les openen = gestart (rang Leerling), ook als de toets nog niet af is.
  const openLesson = (id) => {
    if (!progress._gestart) setProgress({ ...progress, _gestart: true });
    setSelectedId(id);
  };
  const totalLessons = COURSE_LESSONS.length;
  const completedCount = COURSE_LESSONS.filter(l => progress[l.id]?.completed).length;
  const allLessonsDone = completedCount === totalLessons;
  const examProgress = progress.eindtoets;
  const courseInsights = useMemo(() => computeCourseInsights(progress), [progress]);
  const unlockedParts = useMemo(() => computeUnlockedParts(progress), [progress]);
  const isLessonOpen = (l) => !!l && (unlockedParts.has(l.part) || !!progress[l.id]?.completed);
  // Moment van uitspelen (alle lessen + eindtoets gehaald): één keer vieren.
  const mastery = computeCourseMastery(progress);
  const prevMasteredRef = useRef(!!mastery);
  const [showDiplomaCelebration, setShowDiplomaCelebration] = useState(false);
  useEffect(() => {
    if (mastery && !prevMasteredRef.current) { setShowDiplomaCelebration(true); setTimeout(() => onSound("levelup"), 300); }
    prevMasteredRef.current = !!mastery;
  }, [!!mastery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zelfde fanfare-op-echte-mijlpaal-truc als bij Check-in: alleen geluid als
  // het niveau of een badge daadwerkelijk verandert door het net afronden van
  // een les/toets, niet bij elke render.
  const prevCourseLevelRef = useRef(null);
  const prevCourseBadgesRef = useRef(null);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    const unlockedIds = new Set(courseInsights.badges.filter(b => b.unlocked).map(b => b.id));
    if (prevCourseLevelRef.current !== null && justCompleted) {
      if (courseInsights.level.level > prevCourseLevelRef.current) {
        setTimeout(() => onSound("levelup"), 400);
      } else {
        const newlyUnlocked = [...unlockedIds].some(id => !prevCourseBadgesRef.current.has(id));
        if (newlyUnlocked) setTimeout(() => onSound("unlock"), 400);
      }
    }
    prevCourseLevelRef.current = courseInsights.level.level;
    prevCourseBadgesRef.current = unlockedIds;
  }, [courseInsights.level.level, courseInsights.badges, justCompleted]);

  const complete = (lessonId, score, total) => {
    const prev = progress[lessonId];
    const passedNow = score / total >= QUIZ_PASS_RATIO;
    // Voltooid = ooit geslaagd; een mislukte poging telt niet meer als "af".
    setProgress({ ...progress, [lessonId]: { completed: !!prev?.completed || passedNow, bestScore: Math.max(score, prev?.bestScore ?? 0), total } });
    if (passedNow) onSound("chime");
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 3000);
  };

  // Nieuwe rang (Barback t/m Bartender): één keer vieren. Meester heeft
  // het diploma-moment hieronder.
  const prevRankRef = useRef(rank.index);
  const [rankCelebration, setRankCelebration] = useState(null);
  useEffect(() => {
    if (rank.index > prevRankRef.current && rank.index >= 1 && !rank.master) {
      setRankCelebration(rank.rank);
      setTimeout(() => onSound("levelup"), 300);
    }
    prevRankRef.current = rank.index;
  }, [rank.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const diplomaCelebration = (<>
    {rankCelebration && (
      <ConfirmDialog title={`Je bent nu ${rankCelebration.name}`}
        message={`${rankCelebration.rule}. Je ring op je profiel is voller geworden, en je vrienden zien je nieuwe rang in hun feed.`}
        confirmLabel="Proost" confirmColor={BOTTLE} cancelLabel="Sluiten"
        onCancel={() => setRankCelebration(null)} onConfirm={() => setRankCelebration(null)} />
    )}
    {showDiplomaCelebration && (
    <ConfirmDialog title="Gefeliciteerd, je bent Meester"
      message={`Je hebt alle ${totalLessons} lessen en de eindtoets gehaald. Je ring is nu massief goud, je diploma staat op je profiel en je vrienden zien het in hun feed.`}
      confirmLabel="Proost" confirmColor={BOTTLE} cancelLabel="Sluiten"
      onCancel={() => setShowDiplomaCelebration(false)} onConfirm={() => setShowDiplomaCelebration(false)} />
    )}
  </>);

  if (examOpen) {
    return (<>
      {diplomaCelebration}
      <FinalExamView progress={examProgress} onBack={() => setExamOpen(false)}
        onComplete={(score, total) => complete("eindtoets", score, total)} />
    </>);
  }

  if (lesson) {
    const lessonIndex = COURSE_LESSONS.findIndex(l => l.id === lesson.id);
    // "Volgende les" alleen als die al open is (volgend deel pas na afronden).
    const nextCandidate = COURSE_LESSONS[lessonIndex + 1] || null;
    const nextLesson = isLessonOpen(nextCandidate) ? nextCandidate : null;
    return (
      <LessonView key={lesson.id} lesson={lesson} progress={progress[lesson.id]}
        recipes={recipes} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} onCheckin={onCheckin}
        onBack={() => setSelectedId(null)}
        onComplete={(score, total) => complete(lesson.id, score, total)}
        nextLesson={nextLesson}
        onGoToLesson={(id) => { if (isLessonOpen(COURSE_LESSONS.find(l => l.id === id))) openLesson(id); }}
        onGoToExam={() => { if (!allLessonsDone) return; setSelectedId(null); setExamOpen(true); }} />
    );
  }

  const nextUp = COURSE_LESSONS.find(l => !progress[l.id]?.completed && isLessonOpen(l)) || null;
  const currentPartId = nextUp?.part || null;
  const isPartExpanded = (id) => (expandedParts[id] ?? id === currentPartId);
  const activeBadge = courseInsights.badges.find(b => b.id === activeBadgeId) || null;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 14, borderRadius: RADIUS + 4, padding: 16,
        background: `radial-gradient(ellipse 500px 220px at 15% -20%, #2A4B42, ${BOTTLE_DARK} 75%)`, boxShadow: SHADOW_HERO, color: HEADER_TEXT,
      }}>
        <CourseRing size={72} partsDone={rank.partsDone} master={rank.master} dark seal={false}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#2A4B42", display: "flex", alignItems: "center", justifyContent: "center", color: "#F1D9A6" }}>
            {rank.master ? <GraduationCap size={24} strokeWidth={1.8} /> : <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16 }}>{rank.partsDone}/{COURSE_PART_COUNT}</span>}
          </div>
        </CourseRing>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#DDB877" }}>Jouw rang</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, marginTop: 2 }}>{rank.rank ? rank.rank.name : "Nog geen rang"}</div>
          <div style={{ fontSize: 12.5, color: "#C9D2CB", marginTop: 3, lineHeight: 1.35 }}>
            {rank.index < 0 ? "Start je eerste les en word Leerling" : courseRankHint(rank)}
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden", marginTop: 9 }}>
            <div style={{ width: `${courseInsights.level.progress * 100}%`, height: "100%", background: BRASS, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ fontSize: 11.5, color: "#C9D2CB", marginTop: 4 }}><AnimatedNumber value={courseInsights.xp} /> XP</div>
        </div>
      </div>

      {nextUp && (
        <button onClick={() => openLesson(nextUp.id)} className="press-scale" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 18, boxSizing: "border-box", textAlign: "left",
          background: CREAM, border: "none", borderRadius: 14, boxShadow: SHADOW_CARD, cursor: "pointer", fontFamily: sans, color: INK,
        }}>
          <LessonArt lesson={nextUp} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
              {completedCount === 0 ? "Eerste les" : "Volgende les"} · {lessonMinutes(nextUp)} min
            </span>
            <span style={{ display: "block", fontFamily: systemFont, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{nextUp.title}</span>
          </span>
          <ChevronRight size={18} color={MUTED} style={{ flexShrink: 0 }} />
        </button>
      )}

      <div style={{ marginBottom: 22 }}>
        <SectionLabel>Badges</SectionLabel>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {courseInsights.badges.map(b => {
            const Icon = b.icon;
            const selected = activeBadgeId === b.id;
            return (
              <button key={b.id} onClick={() => setActiveBadgeId(selected ? null : b.id)} aria-pressed={selected} style={{
                border: "none", background: "none", padding: 0, margin: 0, cursor: "pointer", width: 78, flexShrink: 0,
                color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: sans,
              }}>
                <span style={{
                  width: 48, height: 48, borderRadius: "50%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                  background: b.unlocked ? BOTTLE_DARK : PAPER_DEEP, color: b.unlocked ? "#DDB877" : "#B8A98A",
                  border: b.unlocked ? `${selected ? 2.5 : 1.5}px solid ${BRASS}` : `1.5px ${selected ? "solid" : "dashed"} ${selected ? BRASS : BORDER}`,
                }}><Icon size={20} strokeWidth={1.8} /></span>
                <span style={{ fontSize: 11, textAlign: "center", lineHeight: 1.2, color: b.unlocked ? INK : MUTED, fontWeight: 600 }}>{b.label}</span>
              </button>
            );
          })}
        </div>
        {activeBadge && (
          <div className="accordion-reveal" style={{ marginTop: 10, padding: "11px 13px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{activeBadge.label}{activeBadge.unlocked ? "" : " · nog niet behaald"}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{activeBadge.text}</div>
          </div>
        )}
      </div>

      <SectionLabel>Delen</SectionLabel>
      <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden", marginBottom: 22 }}>
        {COURSE_PARTS.map((part, partIndex) => {
          const lessons = COURSE_LESSONS.filter(l => l.part === part.id);
          const doneInPart = lessons.filter(l => progress[l.id]?.completed).length;
          const full = doneInPart === lessons.length;
          const partOpen = unlockedParts.has(part.id);
          const prevPart = COURSE_PARTS[partIndex - 1];
          const expanded = isPartExpanded(part.id);
          return (
            <div key={part.id} style={{ borderTop: partIndex > 0 ? `1px solid ${BORDER}` : "none" }}>
              <button onClick={() => setExpandedParts(e => ({ ...e, [part.id]: !expanded }))} aria-expanded={expanded} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 14px", boxSizing: "border-box",
                background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
              }}>
                <span style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: full ? BRASS : PAPER_DEEP, color: full ? CREAM : MUTED, fontSize: 13, fontWeight: 700, fontFamily: systemFont,
                }}>{full ? <Check size={15} strokeWidth={3} /> : !partOpen ? <Lock size={13} strokeWidth={2.4} /> : partIndex + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{part.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>
                    {!partOpen && prevPart ? `Na ${prevPart.title}` : `${doneInPart} van ${lessons.length} lessen`}
                  </span>
                </span>
                <ChevronDown size={16} color={MUTED} style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
              </button>
              {expanded && (
                <div className="accordion-reveal" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {lessons.map(l => {
                    const p = progress[l.id];
                    const open = isLessonOpen(l);
                    return (
                      <button key={l.id} onClick={() => open && openLesson(l.id)} disabled={!open} aria-label={open ? undefined : `${l.title} (vergrendeld)`} style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", minHeight: 52, padding: "6px 10px", boxSizing: "border-box",
                        background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 12, cursor: open ? "pointer" : "default", opacity: open ? 1 : 0.6, fontFamily: sans, color: INK,
                      }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          background: p?.completed ? SAGE : "transparent", border: `1.5px solid ${p?.completed ? SAGE : BORDER}`,
                        }}>
                          {p?.completed ? <Check size={13} color={CREAM} strokeWidth={3} /> : !open ? <Lock size={12} color={MUTED} strokeWidth={2.4} /> : <span style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, fontFamily: systemFont }}>{l.number}</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{l.title}</span>
                          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{lessonMinutes(l)} min{p ? ` · beste score ${p.bestScore}/${p.total}` : ""}</span>
                        </span>
                        {open && <ChevronRight size={15} color={MUTED} style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 10, padding: "20px 22px", borderRadius: RADIUS + 2, boxShadow: SHADOW_HERO,
        background: BOTTLE, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 400px 200px at 100% 0%, rgba(255,255,255,0.14), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
            {allLessonsDone ? "Alle lessen voltooid" : `${totalLessons - completedCount} les${totalLessons - completedCount === 1 ? "" : "sen"} nog te gaan`}
          </div>
          <h3 style={{ fontFamily: systemFont, fontSize: 21, fontWeight: 700, color: ON_DARK_TEXT, margin: "0 0 8px" }}>Eindtoets: Van Basis tot Pro</h3>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)", margin: "0 0 16px", lineHeight: 1.5, maxWidth: 480 }}>
            30 vragen door elkaar over alle zes delen. {examProgress?.completed ? `Beste score: ${examProgress.bestScore}/${examProgress.total}.` : allLessonsDone ? "Haal minstens 80% (24 van de 30) en je krijgt je diploma op je profiel." : "Gaat open zodra je alle zes delen hebt afgerond."}
          </p>
          <button onClick={() => allLessonsDone && setExamOpen(true)} disabled={!allLessonsDone} style={{ opacity: allLessonsDone ? 1 : 0.55, cursor: allLessonsDone ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6, background: CREAM, color: BOTTLE, border: "none", borderRadius: RADIUS, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {allLessonsDone ? <GraduationCap size={15} /> : <Lock size={14} />} {examProgress?.completed ? "Opnieuw proberen" : "Start de eindtoets"}
          </button>
        </div>
      </div>
      {diplomaCelebration}
    </div>
  );
}

// Deel N gaat pas open als alle lessen van de delen ervóór af zijn. Een les
// die je al eerder afrondde blijft altijd te openen (oude voortgang).
function computeUnlockedParts(progress) {
  const unlocked = new Set();
  for (const part of COURSE_PARTS) {
    unlocked.add(part.id);
    const done = COURSE_LESSONS.filter(l => l.part === part.id).every(l => progress[l.id]?.completed);
    if (!done) break;
  }
  return unlocked;
}

export { CursusTab };
