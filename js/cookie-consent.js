(function(){
  const KEY = 'cookieConsent';
  function getChoice(){ try { return localStorage.getItem(KEY); } catch(_) { return null; } }
  function setChoice(val){ try { localStorage.setItem(KEY, val); } catch(_) {} }
  function removeBanner(b){ if (b && b.parentNode) b.parentNode.removeChild(b); }
  function open(){
    // if already chosen, still allow reopen to change choice
    showBanner(true);
  }
  function showBanner(force){
    const choice = getChoice();
    if (!force && (choice === 'accepted' || choice === 'declined')) return;

    const b = document.createElement('div');
    b.id = 'cookie-consent-banner';
    b.setAttribute('role','dialog');
    b.setAttribute('aria-live','polite');
    b.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:5000',
      'display:flex', 'flex-wrap:wrap', 'gap:.75rem', 'align-items:center', 'justify-content:space-between',
      'padding:1rem', 'background:rgba(32,32,32,.96)', 'color:#fff', 'box-shadow:0 -8px 24px rgba(0,0,0,.2)'
    ].join(';');

    const text = document.createElement('div');
    text.style.cssText = 'flex:1 1 260px; min-width:240px; line-height:1.5;';
    text.innerHTML = 'Nous utilisons des cookies essentiels au bon fonctionnement du site et, avec votre accord, des cookies de mesure d\'audience. Vous pouvez modifier votre choix à tout moment dans la <a href="cookies.html" style="color:#a7f3d0;">Politique de cookies</a>.';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:.5rem; flex-wrap:wrap; justify-content:flex-end;';

    const btnAccept = document.createElement('button');
    btnAccept.type = 'button';
    btnAccept.textContent = 'Tout accepter';
    btnAccept.style.cssText = 'background:#16a34a; color:#fff; border:0; padding:.6rem 1rem; border-radius:10px; font-weight:800; cursor:pointer;';
    btnAccept.onclick = function(){ setChoice('accepted'); removeBanner(b); };

    const btnDecline = document.createElement('button');
    btnDecline.type = 'button';
    btnDecline.textContent = 'Tout refuser';
    btnDecline.style.cssText = 'background:transparent; color:#fff; border:1px solid #666; padding:.6rem 1rem; border-radius:10px; font-weight:700; cursor:pointer;';
    btnDecline.onclick = function(){ setChoice('declined'); removeBanner(b); };

    const btnPrefs = document.createElement('button');
    btnPrefs.type = 'button';
    btnPrefs.textContent = 'Gérer';
    btnPrefs.style.cssText = 'background:#374151; color:#fff; border:0; padding:.6rem 1rem; border-radius:10px; font-weight:700; cursor:pointer;';
    btnPrefs.onclick = function(){ window.location.href = 'cookies.html'; };

    actions.appendChild(btnDecline);
    actions.appendChild(btnPrefs);
    actions.appendChild(btnAccept);

    b.appendChild(text);
    b.appendChild(actions);

    document.body.appendChild(b);
  }

  // expose a small API
  window.CookieConsent = { open };

  // auto show on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ showBanner(false); });
  } else {
    showBanner(false);
  }
})();
