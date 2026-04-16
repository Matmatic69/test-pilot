// Effets d'apparition génériques
document.addEventListener('DOMContentLoaded', () => {
  const fadeElems = document.querySelectorAll('.fade-in');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  fadeElems.forEach(elem => observer.observe(elem));

  // Diaporama pleine largeur dans le hero
  const slideshow = document.querySelector('.hero-slideshow');
  if (!slideshow) return;
  console.log('[Slideshow] Init');

  // Candidats: 1.png → 19.png (on filtre ensuite pour ne garder que celles qui chargent)
  const imageCandidates = Array.from({length: 19}, (_, i) => `${i+1}.png`);

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  let current = 0;

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Préchargement simple pour ne garder que les images valides
  function preload(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ src, ok: true });
      img.onerror = () => resolve({ src, ok: false });
      img.src = src;
    });
  }

  let slides = [];
  (async () => {
    const results = await Promise.all(imageCandidates.map(preload));
    const sources = results.filter(r => r.ok).map(r => r.src);
    const finalSources = sources.length ? sources : [imageCandidates[0]];
    console.log('[Slideshow] Valid sources:', finalSources);

    slides = finalSources.map((src, i) => {
      const div = document.createElement('div');
      div.className = 'slide';
      div.style.backgroundImage = `url(${src})`;
      div.dataset.slideIndex = i;
      div.dataset.imageSrc = src;
      slideshow.appendChild(div);
      console.log(`[Slideshow] Created slide ${i} with src: ${src}`);
      return div;
    });
    console.log('[Slideshow] Slides created:', slides.length);
    console.log('[Slideshow] Slideshow container:', slideshow);
    console.log('[Slideshow] All slides in DOM:', slideshow.querySelectorAll('.slide').length);

    // Lancer le diaporama (crossfade)
    showSlide(current);
    const interval = isMobile ? 7000 : 9000;
    if (slides.length >= 2) {
      setInterval(() => {
        current = (current + 1) % slides.length;
        showSlide(current);
        console.log('[Slideshow] Switch to index:', current);
      }, interval);
      setTimeout(() => {
        current = (current + 1) % slides.length;
        showSlide(current);
        console.log('[Slideshow] Early switch to index:', current);
      }, 1500);
    } else {
      console.warn('[Slideshow] Only one valid image found. Rotation disabled.');
    }
  })();

  function showSlide(index) {
    slides.forEach((s, i) => {
      if (i === index) s.classList.add('active');
      else s.classList.remove('active');
    });
    // For debug: add data-active attribute to inspect in DOM
    slides.forEach((s, i) => s.dataset.active = (i === index ? '1' : '0'));
    
    // Clean slideshow working properly
  }

  // Animation au clic du bouton QR avec particules (seulement sur la page d'accueil)
  if (document.querySelector('.hero-section')) {
    const qrButton = document.querySelector('.cta-button.primary');
    if (qrButton) {
      qrButton.addEventListener('click', function(e) {
        // Ajouter la classe d'animation
        this.classList.add('clicked');
        
        // Créer les particules de paillettes
        createSparkles(e);
        
        // Retirer la classe après l'animation
        setTimeout(() => {
          this.classList.remove('clicked');
        }, 600);
      });
    }
  }

  // Fonction pour créer les particules de paillettes
  function createSparkles(event) {
    const rect = event.target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Créer 12 particules
    for (let i = 0; i < 12; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-particle';
      
      // Position de départ au centre du bouton
      sparkle.style.left = centerX + 'px';
      sparkle.style.top = centerY + 'px';
      
      // Direction aléatoire pour chaque particule
      const angle = (360 / 12) * i + Math.random() * 30 - 15;
      const distance = 60 + Math.random() * 40;
      const radians = angle * Math.PI / 180;
      const deltaX = Math.cos(radians) * distance;
      const deltaY = Math.sin(radians) * distance;
      
      // Appliquer la direction via CSS custom properties
      sparkle.style.setProperty('--deltaX', deltaX + 'px');
      sparkle.style.setProperty('--deltaY', deltaY + 'px');
      
      // Modifier l'animation pour utiliser les variables
      sparkle.style.animation = `sparkleFloat${i} 1.2s ease-out forwards`;
      
      // Créer une keyframe unique pour cette particule
      const style = document.createElement('style');
      style.textContent = `
        @keyframes sparkleFloat${i} {
          0% {
            opacity: 1;
            transform: scale(0) rotate(0deg);
          }
          20% {
            opacity: 1;
            transform: scale(1) rotate(90deg);
          }
          100% {
            opacity: 0;
            transform: scale(0.3) rotate(360deg) translate(${deltaX}px, ${deltaY - 80}px);
          }
        }
      `;
      document.head.appendChild(style);
      
      document.body.appendChild(sparkle);
      
      // Nettoyer après l'animation
      setTimeout(() => {
        if (sparkle.parentNode) {
          sparkle.parentNode.removeChild(sparkle);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 1200);
    }
  }
});

  // Le diaporama démarre après préchargement ci-dessus
  // Pas de parallax: diaporama simple et stable
