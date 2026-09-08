/* CodeTonight home page.

   Everything here is an enhancement. The page is fully readable with
   JavaScript switched off: the reveal animation is scoped to the `js`
   class added below, so if this file never runs, nothing is hidden. */

(function () {
  'use strict'

  document.documentElement.classList.add('js')

  function ready (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn)
    } else {
      fn()
    }
  }

  /* Mobile menu. */
  function wireNav () {
    var toggle = document.querySelector('.nav-toggle')
    var nav = document.getElementById('mainnav')
    if (!toggle || !nav) return
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open')
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggle.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu')
    })
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open')
        toggle.setAttribute('aria-expanded', 'false')
      }
    })
  }

  /* Fade sections in as they arrive. Skipped entirely when the reader has
     asked their computer to reduce motion, and when the browser has no
     IntersectionObserver. */
  function wireReveal () {
    var items = document.querySelectorAll('.reveal')
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('revealed') })
      return
    }
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed')
          seen.unobserve(entry.target)
        }
      })
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
    Array.prototype.forEach.call(items, function (el) { seen.observe(el) })
  }

  /* Click a clone line to copy it. */
  function wireClone () {
    var boxes = document.querySelectorAll('.clone')
    Array.prototype.forEach.call(boxes, function (box) {
      function copy () {
        var text = box.textContent.replace(/^\s*\$\s*/, '').trim()
        if (!navigator.clipboard) return
        navigator.clipboard.writeText(text).then(function () {
          box.classList.add('clone--copied')
          flash('Copied to clipboard')
          setTimeout(function () { box.classList.remove('clone--copied') }, 1400)
        })
      }
      box.setAttribute('aria-label', 'Copy this command')
      box.addEventListener('click', copy)
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy() }
      })
    })
  }

  var flashEl = null
  function flash (message) {
    if (!flashEl) {
      flashEl = document.createElement('div')
      flashEl.className = 'delight-flash'
      flashEl.setAttribute('role', 'status')
      flashEl.setAttribute('aria-live', 'polite')
      document.body.appendChild(flashEl)
    }
    flashEl.textContent = message
    flashEl.classList.add('delight-flash--on')
    setTimeout(function () { flashEl.classList.remove('delight-flash--on') }, 2000)
  }

  /* Contact form. Posts to the same endpoint the page has always used, and
     stays on the page instead of navigating away. Falls back to a normal
     form submission if fetch is unavailable. */
  function wireForm () {
    var form = document.querySelector('.contact-form')
    if (!form || !window.fetch) return
    var feedback = form.querySelector('.form__feedback')
    var button = form.querySelector('.form__submit')
    form.addEventListener('submit', function (e) {
      e.preventDefault()
      feedback.classList.remove('form__feedback--error')
      feedback.textContent = 'Sending...'
      button.disabled = true
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (!res.ok) throw new Error('rejected')
        form.reset()
        feedback.textContent = 'Thank you. We will reply from development@codetonight.co.za.'
      }).catch(function () {
        feedback.classList.add('form__feedback--error')
        feedback.textContent = 'That did not send. Please email development@codetonight.co.za directly.'
      }).then(function () {
        button.disabled = false
      })
    })
  }

  ready(function () {
    wireNav()
    wireReveal()
    wireClone()
    wireForm()
  })
})()
