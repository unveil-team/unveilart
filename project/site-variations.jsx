// UnveilArt — three full-site variations
// Each is a self-contained scrollable artboard.
// Exports: UASiteEditorial, UASiteTypographic, UASiteSplit

const { useRef: useRefV, useEffect: useEffectV, useState: useStateV } = React;

function SiteShell({ children, variant }) {
  const scrollRef = useRefV(null);
  const [scroller, setScroller] = useStateV(null);
  useEffectV(() => { setScroller(scrollRef.current); }, []);
  return (
    <div
      ref={scrollRef}
      className={"ua-site ua-variant-" + variant}
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        scrollBehavior: "smooth",
      }}
    >
      <UAScrollCtx.Provider value={scroller}>
        <UACurtain />
        <UANav scroller={scroller} />
        {children}
        <UAFooter />
      </UAScrollCtx.Provider>
    </div>
  );
}

// Hero CTAs — wired to in-page scroll
function HeroCTAs({ invert = false }) {
  const scrollTo = useUAScrollTo();
  return (
    <div className="ua-hero-actions">
      <button
        type="button"
        className={"ua-btn" + (invert ? " invert" : "")}
        onClick={scrollTo("contact")}
      >
        <span>Partner With Us</span><span>→</span>
      </button>
      <a className="ua-link" href="#artists" onClick={scrollTo("artists")}>
        Apply as Artist <span>→</span>
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Variation 1 — Editorial Quiet
//   Image-led hero, masonry gallery, columned How It Works.
// ─────────────────────────────────────────────────────────────
function UASiteEditorial() {
  return (
    <SiteShell variant="editorial">
      <section id="hero" className="ua-hero">
        <div className="ua-hero-bg" style={{ backgroundImage: `url(${HERO_IMAGES.primary})` }}></div>
        <div className="ua-hero-overlay"></div>
        <div className="ua-hero-inner">
          <span className="ua-eyebrow" style={{ color: "var(--gold-whisper)", marginBottom: 32 }}>
            <UAStagger text="UNVEILART · MELBOURNE" stagger={28} />
          </span>
          <h1>
            <UAStagger text="Turn Your Space" delay={400} stagger={45} /><br />
            <span className="it"><UAStagger text="Into An Experience" delay={1100} stagger={45} /></span>
          </h1>
          <p className="sub">
            Rotating art from emerging artists, curated for hotels,
            restaurants &amp; venues across Melbourne.
          </p>
          <HeroCTAs invert />
        </div>
        <div className="ua-hero-meta">
          <span><b>01 / 03</b> &nbsp;Editorial Quiet</span>
          <span>Scroll to explore</span>
        </div>
      </section>

      <UAAbout />
      <UAHowItWorks layout="columns" />
      <UAGallery layout="masonry" />
      <UAContact />
    </SiteShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Variation 2 — Typographic
//   Oversized type hero, uniform grid, editorial step layout.
// ─────────────────────────────────────────────────────────────
function UASiteTypographic() {
  return (
    <SiteShell variant="typographic">
      <section id="hero" className="ua-hero typographic">
        <div className="ua-hero-bg" style={{ backgroundImage: `url(${HERO_IMAGES.alt1})` }}></div>
        <div className="ua-hero-inner">
          <span className="ua-eyebrow" style={{ marginBottom: 28 }}>
            <UAStagger text="A ROTATING CURATION · ESTABLISHED 2026" stagger={22} />
          </span>
          <h1>
            <UAStagger text="Living" delay={400} stagger={55} /><br />
            <span className="it"><UAStagger text="art for" delay={900} stagger={55} /></span><br />
            <UAStagger text="real rooms." delay={1400} stagger={55} />
          </h1>
          <p className="sub" style={{ marginTop: 36, maxWidth: "44ch" }}>
            We place curated works from emerging Melbourne artists into
            hotels, restaurants and boutique venues — and rotate them as
            the city changes.
          </p>
          <HeroCTAs />
        </div>
        <div className="ua-hero-meta">
          <span><b>02 / 03</b> &nbsp;Typographic</span>
          <span>Melbourne · Naarm</span>
        </div>
      </section>

      <UAHowItWorks layout="editorial" />
      <UAGallery layout="uniform" />
      <UAAbout />
      <UAContact />
    </SiteShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Variation 3 — Split / Collage
//   Split hero (cream + image), collage gallery.
// ─────────────────────────────────────────────────────────────
function UASiteSplit() {
  return (
    <SiteShell variant="split">
      <section id="hero" className="ua-hero split" style={{ minHeight: 760 }}>
        <div className="ua-hero-inner">
          <span className="ua-eyebrow" style={{ color: "var(--gold-deep)", marginBottom: 28 }}>
            <UAStagger text="HOSPITALITY × CONTEMPORARY ART" stagger={22} />
          </span>
          <h1>
            <UAStagger text="Turn your" delay={400} stagger={50} /><br />
            <UAStagger text="space into" delay={900} stagger={50} /><br />
            <span className="it"><UAStagger text="an experience." delay={1400} stagger={50} /></span>
          </h1>
          <p className="sub" style={{ marginTop: 32 }}>
            Rotating art from Melbourne's emerging artists,
            placed in the rooms your guests remember.
          </p>
          <HeroCTAs />
          <div className="ua-hero-meta" style={{ left: 72, right: "auto", bottom: 36 }}>
            <span><b>03 / 03</b> &nbsp;Split / Collage</span>
          </div>
        </div>
        <div className="ua-hero-image">
          <div className="ken" style={{ backgroundImage: `url(${HERO_IMAGES.alt2})` }}></div>
          <span className="badge">No. 014 — Currently on rotation</span>
          <span className="credit">Aiyana Park · 'Inland Static' · 2025</span>
        </div>
      </section>

      <UAAbout />
      <UAHowItWorks layout="columns" />
      <UAGallery layout="collage" />
      <UAContact />
    </SiteShell>
  );
}

Object.assign(window, { UASiteEditorial, UASiteTypographic, UASiteSplit });
