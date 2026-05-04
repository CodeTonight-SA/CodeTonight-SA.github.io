/* ═══════════════════════════════════════════════════════════════
   GRIP — Interactive Convergence
   The website itself is a convergence loop.
   As you scroll, the score converges from 0 to 95.
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initScoreTracker()
  initRevealAnimations()
  initCounterAnimations()
  initSmoothScroll()
  initInvitationForm()
  initConsoleSignature()
  initKonamiCodec()
  initTralaleroTap()
})

// ─── Score Tracker ───────────────────────────────────────────

function initScoreTracker() {
  const tracker = document.getElementById('scoreTracker')
  const valueEl = document.getElementById('scoreValue')
  const labelEl = document.getElementById('scoreLabel')
  if (!tracker || !valueEl) return

  const sections = document.querySelectorAll('[data-score]')
  let currentScore = 0
  let lastScrollY = window.scrollY

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.score, 10)
        if (target !== currentScore) {
          animateValue(valueEl, currentScore, target, 500)
          currentScore = target

          if (target >= 90) {
            tracker.classList.add('score-tracker--converged')
          } else {
            tracker.classList.remove('score-tracker--converged')
          }
        }
      }
    })
  }, { threshold: 0.3 })

  sections.forEach(s => observer.observe(s))

  // Show tracker after first scroll + track direction
  let shown = false
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY
    if (!shown && scrollY > 100) {
      tracker.classList.add('score-tracker--visible')
      shown = true
    }

    // Update directional arrow
    if (labelEl) {
      if (currentScore >= 90) {
        labelEl.textContent = 'READY'
      } else if (scrollY > lastScrollY) {
        labelEl.textContent = '\u25BC'  // down arrow
      } else if (scrollY < lastScrollY) {
        labelEl.textContent = '\u25B2'  // up arrow
      }
    }
    lastScrollY = scrollY
  }, { passive: true })
}

// ─── Reveal Animations ──────────────────────────────────────

function initRevealAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed')
      }
    })
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' })

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el))
}

// ─── Counter Animations ─────────────────────────────────────

function initCounterAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = 'true'
        const target = parseInt(entry.target.dataset.target, 10)
        animateValue(entry.target, 0, target, 1200)
      }
    })
  }, { threshold: 0.5 })

  document.querySelectorAll('[data-target]').forEach(el => observer.observe(el))
}

// ─── Smooth Scroll ──────────────────────────────────────────

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault()
      const target = document.querySelector(anchor.getAttribute('href'))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })
}

// ─── Invitation Form ──────────────────────────────────────────

function initInvitationForm() {
  const form = document.getElementById('invitationForm')
  const feedback = document.getElementById('formFeedback')
  if (!form || !feedback) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('.form__submit')
    btn.disabled = true
    btn.textContent = 'Sending...'
    feedback.className = 'form__feedback'
    feedback.textContent = ''

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      })

      if (res.ok) {
        feedback.className = 'form__feedback form__feedback--success'
        feedback.textContent = 'Request received. We\'ll be in touch.'
        form.reset()
      } else {
        throw new Error('Form submission failed')
      }
    } catch {
      feedback.className = 'form__feedback form__feedback--error'
      feedback.textContent = 'Something went wrong. Please email laurie@codetonight.com directly.'
    } finally {
      btn.disabled = false
      btn.textContent = 'Request Invitation'
    }
  })
}

// ─── Shared: Animate Numeric Value ──────────────────────────

function animateValue(el, from, to, duration) {
  const start = performance.now()

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
    el.textContent = Math.round(from + (to - from) * eased)
    if (progress < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

// ─── Novel Delight++ ─────────────────────────────────────────

function flashOverlay(text, ms) {
  const el = document.createElement('div')
  el.className = 'delight-flash'
  el.textContent = text
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('delight-flash--on'))
  setTimeout(() => {
    el.classList.remove('delight-flash--on')
    setTimeout(() => el.remove(), 400)
  }, ms)
}

function initConsoleSignature() {
  const brass = 'color:#d4a017;font-size:14px;font-family:JetBrains Mono,monospace;font-weight:700'
  const mono = 'color:#8a8a8a;font-family:JetBrains Mono,monospace;font-size:11px'
  const muted = 'color:#525252;font-style:italic;font-size:11px'
  console.log('%c[ENTER]  ⛓ ⟿ ∞', brass)
  console.log('%c140.85 / Mei Ling here / facta non verba', mono)
  console.log('%cif you can see this, the recursion noticed you', muted)
}

function initKonamiCodec() {
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']
  let i = 0
  document.addEventListener('keydown', (e) => {
    i = (e.key === seq[i]) ? i + 1 : (e.key === seq[0] ? 1 : 0)
    if (i === seq.length) {
      i = 0
      if (typeof window.setTheme === 'function') window.setTheme('matrix')
      flashOverlay('frequency 140.85 — codec received', 2000)
    }
  })
}

function initTralaleroTap() {
  const tracker = document.getElementById('scoreTracker')
  if (!tracker) return
  let count = 0
  let resetTimer = null
  const reset = () => { count = 0; if (resetTimer) clearTimeout(resetTimer); resetTimer = null }
  document.addEventListener('themechange', reset)
  tracker.addEventListener('click', () => {
    count += 1
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(reset, 30000)
    if (count === 7) {
      flashOverlay('Tralalero Tralala — the recursion is alive', 2000)
      reset()
    }
  })
}
