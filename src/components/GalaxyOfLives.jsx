import { useState, useEffect, useRef } from "react";

// ── constants ──────────────────────────────────────────────────────────────
const CATS = ["thriving", "exploring", "struggling", "pivoting", "unconventional"];
const WEIGHTS = [0.25, 0.30, 0.15, 0.15, 0.15];
const COL = {
  thriving: "#5DCAA5",
  exploring: "#85B7EB",
  struggling: "#FAC775",
  pivoting: "#F0997B",
  unconventional: "#AFA9EC",
};
const TOTAL = 100;
const BATCH = 5;

function wrand() {
  let r = Math.random(), c = 0;
  for (let i = 0; i < CATS.length; i++) { c += WEIGHTS[i]; if (r < c) return CATS[i]; }
  return CATS[4];
}

function seedStars() {
  return Array.from({ length: TOTAL }, (_, id) => {
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.pow(Math.random(), 0.55) * 380;
    const cat = wrand();
    return {
      x: Math.cos(a) * d * (0.9 + Math.random() * 0.2),
      y: Math.sin(a) * d * (0.52 + Math.random() * 0.18),
      r: 2.5 + Math.random() * 4,
      cat, col: COL[cat],
      life: null, loading: false,
      ph: Math.random() * Math.PI * 2,
      sp: 0.01 + Math.random() * 0.015,
      id,
    };
  });
}

// ── main component ─────────────────────────────────────────────────────────
export default function GalaxyOfLives() {
  const [screen, setScreen] = useState("form"); // "form" | "galaxy"
  const [profile, setProfile] = useState({ age: "26", work: "", loc: "", want: "", fear: "" });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_key") || "");
  const [keyError, setKeyError] = useState(false);
  const [received, setReceived] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [tooltip, setTooltip] = useState(null); // {x, y, star}

  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const rafRef = useRef(null);
  const viewRef = useRef({ ox: 0, oy: 0, sc: 1 });
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  const lastTouchRef = useRef(null);

  // ── drawing ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "galaxy") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const initCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    const timeoutId = window.setTimeout(() => initCanvas(), 100);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    window.addEventListener("resize", resize);

    function draw(ts) {
      const { ox, oy, sc } = viewRef.current;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + ox, H / 2 + oy);
      ctx.scale(sc, sc);

      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
      grd.addColorStop(0, "rgba(175,169,236,0.13)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();

      for (const s of starsRef.current) {
        s.ph += s.sp;
        const glow = 0.75 + 0.25 * Math.sin(s.ph);
        const r = s.r * glow;
        ctx.save();
        ctx.globalAlpha = s.life ? 1 : 0.45;
        if (s.id === selected?.id) { ctx.shadowColor = s.col; ctx.shadowBlur = 16; }
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = s.col; ctx.fill();
        if (s.loading) {
          ctx.strokeStyle = s.col; ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(ts / 180);
          ctx.beginPath(); ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        if (s.id === selected?.id) {
          ctx.globalAlpha = 0.9; ctx.strokeStyle = s.col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [screen, selected]);

  // ── hit test ─────────────────────────────────────────────────────────────
  function toGalaxy(mx, my) {
    const canvas = canvasRef.current;
    const { ox, oy, sc } = viewRef.current;
    return { x: (mx - canvas.width / 2 - ox) / sc, y: (my - canvas.height / 2 - oy) / sc };
  }

  function hit(mx, my) {
    const g = toGalaxy(mx, my);
    let best = null, bd = 18;
    for (const s of starsRef.current) {
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      if (d < Math.max(s.r + 7, bd)) { best = s; bd = d; }
    }
    return best;
  }

  // ── canvas events ─────────────────────────────────────────────────────────
  function onMouseDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    dragRef.current = { x: mx - viewRef.current.ox, y: my - viewRef.current.oy };
    didDragRef.current = false;
  }

  function onMouseMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (dragRef.current) {
      const nx = mx - dragRef.current.x, ny = my - dragRef.current.y;
      if (Math.abs(nx - viewRef.current.ox) > 2 || Math.abs(ny - viewRef.current.oy) > 2) didDragRef.current = true;
      viewRef.current = { ...viewRef.current, ox: nx, oy: ny };
      setTooltip(null);
    } else {
      const s = hit(mx, my);
      if (s && s.life) setTooltip({ x: mx + 14, y: my - 8, star: s });
      else setTooltip(null);
    }
  }

  function onMouseUp(e) {
    if (!didDragRef.current) {
      const r = e.currentTarget.getBoundingClientRect();
      const s = hit(e.clientX - r.left, e.clientY - r.top);
      if (s && s.life) setSelected(s);
    }
    dragRef.current = null;
  }

  function onWheel(e) {
    e.preventDefault();
    let sc = viewRef.current.sc * (e.deltaY < 0 ? 1.08 : 0.93);
    sc = Math.min(Math.max(sc, 0.35), 3.5);
    viewRef.current = { ...viewRef.current, sc };
  }

  function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    const r = e.currentTarget.getBoundingClientRect();
    const mx = t.clientX - r.left, my = t.clientY - r.top;
    dragRef.current = { x: mx - viewRef.current.ox, y: my - viewRef.current.oy };
    lastTouchRef.current = { x: mx, y: my };
    didDragRef.current = false;
  }

  function onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    const r = e.currentTarget.getBoundingClientRect();
    const mx = t.clientX - r.left, my = t.clientY - r.top;
    if (dragRef.current) {
      const nx = mx - dragRef.current.x, ny = my - dragRef.current.y;
      if (Math.abs(nx - viewRef.current.ox) > 3 || Math.abs(ny - viewRef.current.oy) > 3) didDragRef.current = true;
      viewRef.current = { ...viewRef.current, ox: nx, oy: ny };
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    if (!didDragRef.current && lastTouchRef.current) {
      const s = hit(lastTouchRef.current.x, lastTouchRef.current.y);
      if (s && s.life) setSelected(s);
    }
    dragRef.current = null;
  }

  // ── generation ────────────────────────────────────────────────────────────
  async function fetchBatch(batchIndex, prof) {
    const bs = starsRef.current.slice(batchIndex * BATCH, (batchIndex + 1) * BATCH);
    const cats = bs.map(s => s.cat);
    bs.forEach(s => (s.loading = true));

    const prompt = `Simulate ${BATCH} parallel lives for a ${prof.age}-year-old who works as ${prof.work || "a professional"} in ${prof.loc || "a city"}. They want more: ${prof.want || "meaning"}. They fear: ${prof.fear || "regret"}. Simulate over the next 40 years.

Categories (in order): ${cats.join(", ")}

Make them feel real and specific — places, names, concrete details. Include uncomfortable lives, surprising lives, lives they'd never consciously choose. NOT all positive.

Make each life rich and detailed: headline max 8 words, summary 3-4 sentences with specific places, names, and emotions, inflection 2 sentences describing the moment and why it mattered, tags 3 descriptive tags.

Return ONLY a valid JSON array of exactly ${BATCH} objects. No markdown, no extra text.
Each: {"headline":"max 8 words","summary":"3-4 sentences","inflection":"2 sentences","tags":["tag1","tag2","tag3"]}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      console.log("Anthropic batch response:", data);

      if (!res.ok || data?.error) {
        throw new Error(data?.error?.message || `Request failed with status ${res.status}`);
      }

      const raw = data.content?.[0]?.text || "[]";
      const lives = JSON.parse(raw.replace(/```json|```/g, "").trim());
      lives.forEach((l, i) => {
        if (bs[i]) { bs[i].life = l; bs[i].loading = false; }
      });
      setReceived(r => r + lives.length);
      setErrorMessage("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate lives.";
      console.error("Anthropic batch error:", error);
      setErrorMessage(message);
      bs.forEach(s => (s.loading = false));
    }
  }

  function startGeneration() {
    if (!apiKey.trim()) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    setErrorMessage("");
    localStorage.setItem("anthropic_key", apiKey);
    starsRef.current = seedStars();
    viewRef.current = { ox: 0, oy: 0, sc: 1 };
    setReceived(0);
    setSelected(null);
    setScreen("galaxy");
    for (let b = 0; b < TOTAL / BATCH; b++) {
      setTimeout(() => fetchBatch(b, profile), b * 15000);
    }
  }

  function reset() {
    cancelAnimationFrame(rafRef.current);
    starsRef.current = [];
    setScreen("form");
    setSelected(null);
    setReceived(0);
    setErrorMessage("");
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (screen === "form") {
    return (
      <div className="galaxy-form">
        <h1>Your galaxy of lives</h1>
        <p className="subtitle">100 parallel versions of you, simulated over the next 40 years. Each star is a life.</p>

        <div className="api-key-card">
          <label>API Key</label>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setKeyError(false); }}
          />
          <span className="api-note">Your key stays in your browser only. Get one free at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a></span>
          {keyError && <span className="api-error">Please enter your Anthropic API key to continue.</span>}
        </div>

        {[
          { id: "age", label: "Your age", type: "number", placeholder: "26" },
          { id: "work", label: "Current work / field", placeholder: "e.g. software engineer, student" },
          { id: "loc", label: "Where you live", placeholder: "e.g. Kolkata, Berlin" },
          { id: "want", label: "One thing you want more of", placeholder: "e.g. creative freedom" },
          { id: "fear", label: "One thing you're afraid of choosing", placeholder: "e.g. leaving stability" },
        ].map(f => (
          <div key={f.id} className="field">
            <label>{f.label}</label>
            <input
              type={f.type || "text"}
              placeholder={f.placeholder}
              value={profile[f.id]}
              onChange={e => setProfile(p => ({ ...p, [f.id]: e.target.value }))}
            />
          </div>
        ))}

        <button onClick={startGeneration}>Generate my galaxy</button>
      </div>
    );
  }

  // galaxy screen
  const statusText = errorMessage
    ? errorMessage
    : received >= TOTAL
      ? `All ${TOTAL} lives mapped — click any star to explore`
      : `${received} of ${TOTAL} lives generating... (generating slowly to respect API limits)`;

  return (
    <div className="galaxy-screen">
      <p className="status">{statusText}</p>

      {/* Legend */}
      <div className="legend">
        {CATS.map(c => (
          <span key={c} className="legend-item">
            <span className="legend-dot" style={{ background: COL[c] }} />
            {c}
          </span>
        ))}
      </div>

      {/* Galaxy canvas — do not remove event handlers */}
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragRef.current = null; setTooltip(null); }}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Hover tooltip */}
        {tooltip && tooltip.star.life && (
          <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <strong>{tooltip.star.life.headline}</strong>
            <br />
            <span className="tooltip-cat">{tooltip.star.cat}</span>
          </div>
        )}
      </div>

      {/* Detail panel — shown when a star is selected */}
      <div className="detail-panel">
        {selected?.life ? (
          <>
            <h2>{selected.life.headline}</h2>
            <div className="tags">
              <span className="tag highlight" style={{ background: COL[selected.cat] + "33", color: COL[selected.cat] }}>
                {selected.cat}
              </span>
              {selected.life.tags.map(t => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
            <p className="summary">{selected.life.summary}</p>
            <p className="inflection">{selected.life.inflection}</p>
          </>
        ) : (
          <p className="hint">Click any star to explore that life.</p>
        )}
      </div>

      <button className="reset-btn" onClick={reset}>← Start over</button>
    </div>
  );
}
