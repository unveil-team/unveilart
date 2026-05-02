// UnveilArt — shared building blocks for all 3 variations
// Exports to window: UANav, UAFooter, UAArtistForm, UAContactForm,
// UAHowItWorks, UAGallery, UAAbout, UACurtain, UAReveal, UAStagger,
// HERO_IMAGES, GALLERY_IMAGES, ARTISTS

const { useState, useEffect, useRef } = React;

// — Imagery (Unsplash, hospitality + contemporary art interiors) —
// Interior + venue scenes featuring artwork on walls (paintings, framed works).
const HERO_IMAGES = {
  primary:   "assets/hero-primary.jpg",
  alt1:      "https://images.unsplash.com/photo-1582582494705-f8ce0b0c24f0?auto=format&fit=crop&w=2400&q=80",
  alt2:      "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?auto=format&fit=crop&w=2400&q=80",
};

const GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1549887534-1541e9326642?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1577720580479-7d839d829c73?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?auto=format&fit=crop&w=1200&q=80",
];

const ARTISTS = [
  { name: "Mira Chen",         medium: "Mixed media · 2025" },
  { name: "Tomás Whitfield",   medium: "Oil on linen · 2024" },
  { name: "Aiyana Park",       medium: "Photography · 2025" },
  { name: "Joaquín Reyes",     medium: "Acrylic & ink · 2025" },
  { name: "Saoirse Halloran",  medium: "Textile · 2024" },
  { name: "Kenji Moreau",      medium: "Pigment on paper · 2025" },
];

// Scroll context — passed by SiteShell to anything that needs to scroll
const UAScrollCtx = React.createContext(null);
function useUAScrollTo() {
  const scroller = React.useContext(UAScrollCtx);
  return (id) => (e) => {
    if (e) e.preventDefault();
    if (!scroller) return;
    const t = scroller.querySelector("#" + id);
    if (t) scroller.scrollTo({ top: t.offsetTop - 60, behavior: "smooth" });
  };
}

// — Curtain intro (every load) —
function UACurtain() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={"ua-curtain" + (done ? " done" : "")} aria-hidden="true">
      <div className="ua-curtain-l"></div>
      <div className="ua-curtain-r"></div>
      <div className="ua-curtain-mark">UNVEIL</div>
    </div>
  );
}

// — Letter-by-letter stagger —
function UAStagger({ text, delay = 0, stagger = 40, className = "" }) {
  return (
    <span className={"ua-stagger " + className}>
      {[...text].map((ch, i) => (
        <span
          key={i}
          className="ch"
          style={{ animationDelay: `${delay + i * stagger}ms` }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

// — Reveal-on-scroll (observe within artboard scroll container) —
function UAReveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Find the scrolling ancestor — the artboard's overflow-auto wrapper.
    let scroller = el.parentElement;
    while (scroller) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setTimeout(() => setShown(true), delay);
            io.disconnect();
          }
        });
      },
      { root: scroller, threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={"ua-reveal " + (shown ? "in " : "") + className}>
      {children}
    </div>
  );
}

// — Nav (sticky, transparent → solid after scroll) —
function UANav({ scroller }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    if (!scroller) return;
    const onScroll = () => setSolid(scroller.scrollTop > 100);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);

  const go = (id) => (e) => {
    e.preventDefault();
    if (!scroller) return;
    const t = scroller.querySelector("#" + id);
    if (t) {
      scroller.scrollTo({ top: t.offsetTop - 60, behavior: "smooth" });
    }
  };

  return (
    <nav className={"ua-nav" + (solid ? " solid" : "")}>
      <a href="#" className="ua-logo" onClick={go("hero")}>
        <b>Unveil</b>art
      </a>
      <div className="ua-nav-links">
        <a href="#hero" onClick={go("hero")}>Home</a>
        <a href="#about" onClick={go("about")}>About</a>
        <a href="#how" onClick={go("how")}>How It Works</a>
        <a href="#artists" onClick={go("artists")}>Artists</a>
        <a href="#contact" className="ua-cta-mini" onClick={go("contact")}>
          <span>Partner With Us</span>
        </a>
      </div>
    </nav>
  );
}

// — Forms —
function useFormState(fields) {
  const initial = Object.fromEntries(fields.map((f) => [f, ""]));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const set = (k) => (e) => setValues({ ...values, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const err = {};
    fields.forEach((f) => {
      if (!values[f].trim()) err[f] = true;
      if (f === "email" && values[f] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f])) err[f] = true;
    });
    setErrors(err);
    if (Object.keys(err).length === 0) {
      setTimeout(() => setSuccess(true), 350);
    }
  };
  return { values, errors, success, set, submit };
}

function UAArtistForm() {
  const f = useFormState(["name", "email", "portfolio", "message"]);
  if (f.success) {
    return (
      <div className="ua-form-success">
        <span className="check">✓</span>
        Submitted! We'll get back to you within 48 hours.
      </div>
    );
  }
  return (
    <form className="ua-form" onSubmit={f.submit} noValidate>
      <div className={"ua-field" + (f.errors.name ? " error" : "")}>
        <label>Name</label>
        <input type="text" value={f.values.name} onChange={f.set("name")} />
      </div>
      <div className={"ua-field" + (f.errors.email ? " error" : "")}>
        <label>Email</label>
        <input type="email" value={f.values.email} onChange={f.set("email")} />
      </div>
      <div className={"ua-field" + (f.errors.portfolio ? " error" : "")}>
        <label>Portfolio Link</label>
        <input type="url" value={f.values.portfolio} onChange={f.set("portfolio")} placeholder="https://" />
      </div>
      <div className={"ua-field" + (f.errors.message ? " error" : "")}>
        <label>Message</label>
        <textarea rows="3" value={f.values.message} onChange={f.set("message")} />
      </div>
      <button className="ua-btn" type="submit">
        <span>Submit Application</span>
        <span>→</span>
      </button>
    </form>
  );
}

function UAContactForm() {
  const f = useFormState(["company", "name", "email", "venueType", "message"]);
  if (f.success) {
    return (
      <div className="ua-form-success">
        <span className="check">✓</span>
        Submitted! We'll get back to you within 48 hours.
      </div>
    );
  }
  return (
    <form className="ua-form" onSubmit={f.submit} noValidate>
      <div className={"ua-field" + (f.errors.company ? " error" : "")}>
        <label>Company Name</label>
        <input type="text" value={f.values.company} onChange={f.set("company")} />
      </div>
      <div className={"ua-field" + (f.errors.name ? " error" : "")}>
        <label>Your Name</label>
        <input type="text" value={f.values.name} onChange={f.set("name")} />
      </div>
      <div className={"ua-field" + (f.errors.email ? " error" : "")}>
        <label>Email</label>
        <input type="email" value={f.values.email} onChange={f.set("email")} />
      </div>
      <div className={"ua-field" + (f.errors.venueType ? " error" : "")}>
        <label>Venue Type</label>
        <select value={f.values.venueType} onChange={f.set("venueType")}>
          <option value="">Select…</option>
          <option>Hotel</option>
          <option>Restaurant</option>
          <option>Café</option>
          <option>Other</option>
        </select>
      </div>
      <div className={"ua-field" + (f.errors.message ? " error" : "")}>
        <label>Message</label>
        <textarea rows="3" value={f.values.message} onChange={f.set("message")} />
      </div>
      <button className="ua-btn invert" type="submit">
        <span>Send Inquiry</span>
        <span>→</span>
      </button>
    </form>
  );
}

// — How It Works (two layouts) —
function UAHowItWorks({ layout = "columns" }) {
  const steps = [
    {
      n: "01", glyph: "i",
      t: "Consult", titleIt: "",
      body: "We learn your space, your story, and what your guests should feel."
    },
    {
      n: "02", glyph: "ii",
      t: "Curate", titleIt: "",
      body: "We handpick works from our growing roster of emerging Melbourne artists — made for your walls."
    },
    {
      n: "03", glyph: "iii",
      t: "Rotate & Maintain", titleIt: "",
      body: "Every few months, new artists. Every visit, condition checked. Your space stays fresh, effortlessly."
    },
  ];
  return (
    <section id="how" className="ua-section ua-how">
      <div className="ua-how-head">
        <UAReveal>
          <span className="ua-eyebrow">How it works</span>
          <h2 style={{ marginTop: 16 }}>
            A practice, <span className="it">not a delivery.</span>
          </h2>
        </UAReveal>
        <UAReveal delay={120}>
          <p>
            We've designed UnveilArt to be quiet for you and generative for the
            artists. Three steps that repeat — so the work on your walls
            keeps moving forward.
          </p>
        </UAReveal>
      </div>
      <div className={"ua-steps" + (layout === "editorial" ? " editorial" : "")}>
        {steps.map((s, i) => (
          <UAReveal key={s.n} delay={200 + i * 200}>
            <div className="ua-step">
              <span className="num">Step {s.n}</span>
              {layout !== "editorial" && <div className="glyph">{s.glyph}</div>}
              <h3>{s.t}</h3>
              <p>{s.body}</p>
            </div>
          </UAReveal>
        ))}
      </div>
    </section>
  );
}

// — Gallery (variants: masonry / uniform / collage) —
function UAGallery({ layout = "masonry" }) {
  return (
    <section id="artists" className="ua-section ua-artists">
      <div className="ua-artists-head">
        <UAReveal>
          <span className="ua-eyebrow">The roster</span>
          <h2 style={{ marginTop: 16 }}>
            Emerging voices, <span className="it">on real walls.</span>
          </h2>
        </UAReveal>
        <UAReveal delay={120}>
          <p>
            A rotating selection from the artists currently showing across
            partner venues in Melbourne.
          </p>
        </UAReveal>
      </div>

      <UAReveal>
        <div className={"ua-gallery " + layout}>
          {GALLERY_IMAGES.map((img, i) => (
            <div key={i} className={"tile t" + (i + 1)}>
              <div
                className="tile-img"
                style={{ backgroundImage: `url(${img})` }}
                role="img"
                aria-label={`Work by ${ARTISTS[i].name}`}
              ></div>
              <div className="tile-meta">
                <div className="name">{ARTISTS[i].name}</div>
                <div className="medium">{ARTISTS[i].medium}</div>
              </div>
            </div>
          ))}
        </div>
      </UAReveal>

      <div className="ua-bridge">
        <UAReveal>
          <span className="ua-eyebrow">For artists</span>
          <h3 style={{ marginTop: 18 }}>
            Are you an emerging artist? <br />
            <span className="it">Join our network.</span>
          </h3>
          <p>
            We're always looking for new voices to introduce to our partner
            venues. Send us your portfolio — we read every submission.
          </p>
        </UAReveal>
        <UAReveal delay={140}>
          <UAArtistForm />
        </UAReveal>
      </div>
    </section>
  );
}

// — About —
function UAAbout() {
  return (
    <section id="about" className="ua-section ua-about">
      <div className="ua-about-grid">
        <UAReveal>
          <span className="ua-eyebrow">About</span>
          <h2 style={{ marginTop: 16 }}>
            Art should <span className="it">be seen.</span>
          </h2>
        </UAReveal>
        <div className="ua-about-body">
          <UAReveal delay={120}>
            <p className="lede">
              Not stored in studios, not waiting for the <span className="it">right gallery.</span>
            </p>
          </UAReveal>
          <UAReveal delay={200}>
            <p>
              UnveilArt connects Melbourne's emerging artists with the spaces
              where their work belongs — hotels, restaurants, and venues
              where people actually live, dine, and remember.
            </p>
          </UAReveal>
          <UAReveal delay={280}>
            <p>
              We don't place art once and walk away. We rotate. We refresh.
              We keep introducing new voices to new walls.
            </p>
          </UAReveal>
          <UAReveal delay={360}>
            <p>
              Every wall is an opportunity. Every rotation, a new story.
            </p>
          </UAReveal>
          <UAReveal delay={440}>
            <div className="ua-about-rule"></div>
            <div className="ua-about-foot">
              <b>Based in Melbourne.</b><br />
              Built for the artists and spaces that make this city worth experiencing.
            </div>
          </UAReveal>
        </div>
      </div>
    </section>
  );
}

// — Contact —
function UAContact() {
  return (
    <section id="contact" className="ua-section ua-contact">
      <UAReveal>
        <span className="ua-eyebrow">Partner with us</span>
        <h2 style={{ marginTop: 18 }}>
          Let's talk about <br />
          <span className="it">your space.</span>
        </h2>
      </UAReveal>
      <div className="ua-contact-grid">
        <div className="ua-contact-side">
          <UAReveal delay={120}>
            <p>
              We work with hotels, restaurants, cafés, and boutique venues
              across Melbourne. Tell us about your space and we'll be in
              touch within 48 hours.
            </p>
            <div className="item">
              <span className="lbl">Email</span>
              contact@unveilart.com.au
            </div>
            <div className="item">
              <span className="lbl">Studio</span>
              Collingwood, Naarm / Melbourne
            </div>
            <div className="item">
              <span className="lbl">Press & general</span>
              press@unveilart.com.au
            </div>
          </UAReveal>
        </div>
        <UAReveal delay={200}>
          <UAContactForm />
        </UAReveal>
      </div>
    </section>
  );
}

// — Footer —
function UAFooter() {
  return (
    <footer className="ua-footer">
      <div className="ua-footer-grid">
        <div>
          <div className="ua-logo"><b>Unveil</b>art</div>
          <p>Curating Melbourne's emerging artists into the spaces that matter.</p>
        </div>
        <div>
          <h4>Connect</h4>
          <ul>
            <li><a href="#">Instagram</a></li>
            <li><a href="#">LinkedIn</a></li>
            <li><a href="mailto:contact@unveilart.com.au">Email</a></li>
          </ul>
        </div>
        <div>
          <h4>Site</h4>
          <ul>
            <li><a href="#about">About</a></li>
            <li><a href="#how">How It Works</a></li>
            <li><a href="#artists">Artists</a></li>
            <li><a href="#contact">Partner With Us</a></li>
          </ul>
        </div>
      </div>
      <div className="ua-footer-bottom">
        <span>© 2026 UnveilArt. All rights reserved.</span>
        <span>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Cookie Policy</a>
        </span>
      </div>
    </footer>
  );
}

Object.assign(window, {
  UANav, UAFooter, UAArtistForm, UAContactForm,
  UAHowItWorks, UAGallery, UAAbout, UAContact,
  UACurtain, UAReveal, UAStagger,
  UAScrollCtx, useUAScrollTo,
  HERO_IMAGES, GALLERY_IMAGES, ARTISTS,
});
