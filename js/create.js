import { db, storage } from './firebase-config.js';
import { collection, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";

const form = document.getElementById('souvenir-form');
const loading = document.getElementById('loading');
const generateButton = document.getElementById('generate-ai-text');
const messageTextarea = document.getElementById('message');
const aiStatus = document.getElementById('ai-status');
const photosInput = document.getElementById('photos');
const videosInput = document.getElementById('videos');
const imagePreviewContainer = document.getElementById('image-preview-container');
const videoPreviewContainer = document.getElementById('video-preview-container');
// New optional creation options
const generateQuoteButton = document.getElementById('generate-quote');
const quoteInput = document.getElementById('quote');
const quoteStatus = document.getElementById('quote-status');
// Privacy controls
const privacyRadios = document.querySelectorAll('input[name="privacy"]');
const privacyPasswordGroup = document.getElementById('privacy-password-group');
const privacyPasswordInput = document.getElementById('privacy-password');
const privacyPasswordConfirmGroup = document.getElementById('privacy-password-confirm-group');
const privacyPasswordConfirmInput = document.getElementById('privacy-password-confirm');
// Admin password controls
const adminPasswordInput = document.getElementById('admin-password');
const adminPasswordConfirmInput = document.getElementById('admin-password-confirm');

// New form elements
const anecdoteTextarea = document.getElementById('anecdote');
const improveAnecdoteBtn = document.getElementById('improve-anecdote');
const correctAnecdoteBtn = document.getElementById('correct-anecdote');
const anecdoteStatus = document.getElementById('anecdote-ai-status');

const improveBioBtn = document.getElementById('improve-bio');

// Banner generation controls (Step 1)
const bannerPromptInput = document.getElementById('bannerPrompt');
const bannerStatus = document.getElementById('banner-status');
const bannerPreview = document.getElementById('bannerPreview');
const generateBannerBtn = document.getElementById('generate-banner-btn');
const removeBannerBtn = document.getElementById('remove-banner-btn');

// State for generated banner
let generatedBannerDataUrl = '';
const correctBioBtn = document.getElementById('correct-bio');

const personalityGrid = document.getElementById('personality-grid');

// Loading status elements
const loadingStatusEl = document.getElementById('loading-status');
const loadingProgressEl = document.getElementById('loading-progress');
const loadingPercentEl = document.getElementById('loading-percent');

// Animated loading phrases
let animatedLoadingActive = false;
let animatedLoadingTimer = null;
const animatedLoadingPhrases = [
    'Nous gravons votre mémoire numérique…',
    'Préparation du mémorial avec soin…',
    'Mise en forme des souvenirs…',
    'Organisation des photos et vidéos…',
    'Création de l’aperçu personnalisé…',
    'Un instant, nous finalisons la mise en page…'
];

// Stage-based messages tied to percent for clarity (used in final creation flow)
function getLoadingStageMessage(percent) {
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
    if (p < 10) return 'Préparation du mémorial…';
    if (p < 30) return 'Nous gravons votre mémoire numérique…';
    if (p < 45) return 'Organisation des photos et vidéos…';
    if (p < 65) return 'Création d’un QR temporaire…';
    if (p < 80) return 'Sauvegarde du mémorial…';
    if (p < 90) return 'Finalisation du QR…';
    if (p < 98) return 'Préparation du téléchargement HD…';
    if (p < 100) return 'Mise à jour finale…';
    return 'Terminé ✓';
}

// Helper: SHA-256 hex
async function sha256Hex(text) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
    const bytes = Array.from(new Uint8Array(buf));
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function setLoadingProgressWithMessage(percent) {
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
    // Always update bar/percent
    if (loadingProgressEl) loadingProgressEl.style.width = `${p}%`;
    if (loadingPercentEl) loadingPercentEl.textContent = `${p}%`;
    // Update stage message (override any animated text)
    if (loadingStatusEl) loadingStatusEl.textContent = getLoadingStageMessage(p);
    // Update timeline step markers
    updateTimelineSteps(p);
}

function startAnimatedLoading() {
    try { if (animatedLoadingTimer) clearInterval(animatedLoadingTimer); } catch(_) {}
    animatedLoadingActive = true;
    let i = 0;
    if (loadingStatusEl) loadingStatusEl.textContent = animatedLoadingPhrases[i];
    animatedLoadingTimer = setInterval(() => {
        i = (i + 1) % animatedLoadingPhrases.length;
        if (loadingStatusEl) loadingStatusEl.textContent = animatedLoadingPhrases[i];
    }, 1800);
}
function stopAnimatedLoading() {
    animatedLoadingActive = false;
    try { if (animatedLoadingTimer) clearInterval(animatedLoadingTimer); } catch(_) {}
    animatedLoadingTimer = null;
}

function setLoadingStatus(message, percent) {
    // When animated loading is active, keep the animated phrases and only update the progress bar
    if (!animatedLoadingActive) {
        if (loadingStatusEl) loadingStatusEl.textContent = message || '';
    }
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
    if (loadingProgressEl) loadingProgressEl.style.width = `${p}%`;
    if (loadingPercentEl) loadingPercentEl.textContent = `${p}%`;
    // Update timeline step markers as progress changes
    updateTimelineSteps(p);
}

// Update timeline steps (done/active) based on percent
function updateTimelineSteps(percent) {
    const stepsContainer = document.querySelector('#loading-timeline .timeline-steps');
    if (!stepsContainer) return;
    const steps = Array.from(stepsContainer.querySelectorAll('.timeline-step'));
    if (!steps.length) return;
    const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
    // Map percent to stage index (0..6)
    let stage = 0;
    if (p >= 10 && p < 45) stage = 1;
    else if (p >= 45 && p < 65) stage = 2;
    else if (p >= 65 && p < 80) stage = 3;
    else if (p >= 80 && p < 90) stage = 4;
    else if (p >= 90 && p < 98) stage = 5;
    else if (p >= 98) stage = 6;
    steps.forEach((el, idx) => {
        el.classList.toggle('active', idx === stage);
        el.classList.toggle('done', idx < stage);
    });
}

// --- Stripe: gestion du retour de paiement ---
async function handleStripeReturn() {
    try {
        const params = new URLSearchParams(window.location.search);
        const isSuccess = params.get('success');
        const sessionId = params.get('session_id');
        const docId = params.get('docId');
        if (isSuccess && sessionId && docId) {
            // Vérifier la session côté serveur
            const verifyResp = await fetch(`/.netlify/functions/verify-session?session_id=${encodeURIComponent(sessionId)}`);
            if (!verifyResp.ok) return;
            const info = await verifyResp.json();
            if (info.paid) {
                // Mettre à jour Firestore (paiement confirmé + coordonnées livraison)
                try {
                    await updateDoc(doc(db, 'souvenirs', docId), {
                        payment: {
                            status: 'paid',
                            sessionId: info.session_id,
                            amount_total: info.amount_total || null,
                            currency: info.currency || 'eur'
                        },
                        customer: info.customer || null,
                        shipping: info.shipping || null
                    });
                } catch (e) { console.warn('Maj Firestore paiement échouée', e); }

                // Afficher l'étape de confirmation et cacher celle du paiement
                const paymentStep = document.getElementById('payment-step');
                if (paymentStep) paymentStep.style.display = 'none';
                const confirmationStep = document.getElementById('confirmation-step');
                if (confirmationStep) confirmationStep.style.display = 'block';

                const finalUrl = `${window.location.origin}/preview-new.html?id=${docId}`;

                // Générer le QR dans le bon conteneur
                const qrPaidDiv = document.getElementById('qrcode-paid');
                if(qrPaidDiv) {
                    qrPaidDiv.innerHTML = '';
                    new QRCode(qrPaidDiv, { text: finalUrl, width: 128, height: 128 });
                }

                // Configurer les liens de la modale de confirmation
                const souvenirLinkEl = document.getElementById('souvenir-link');
                if (souvenirLinkEl) {
                    souvenirLinkEl.href = finalUrl;
                    souvenirLinkEl.setAttribute('target', '_blank');
                    souvenirLinkEl.setAttribute('rel', 'noopener');
                    souvenirLinkEl.onclick = (ev) => {
                        ev.preventDefault();
                        window.open(finalUrl, '_blank');
                    };
                }

                const downloadQrEl = document.getElementById('download-qr');
                if (downloadQrEl) {
                    try {
                        const tmpCanvas = document.createElement('div');
                        new QRCode(tmpCanvas, { text: finalUrl, width: 1024, height: 1024, correctLevel: QRCode.CorrectLevel.H });
                        const canvas = tmpCanvas.querySelector('canvas');
                        if (canvas) {
                            downloadQrEl.href = canvas.toDataURL('image/png');
                            downloadQrEl.download = `QR-Souvenir-${docId}.png`;

                            // Préparer envoi par EmailJS si configuré, sinon fallback Netlify function
                            (async () => {
                                try {
                                    const cfg = (window.EMAILJS_CONFIG || {});
                                    const hasEmailJs = (window.emailjs && cfg.publicKey && cfg.serviceId && cfg.templateId);
                                    // Construire un lien direct PNG via un service QR public (pas de Firebase nécessaire)
                                    const encoded = encodeURIComponent(finalUrl);
                                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&ecc=H&margin=4&data=${encoded}`;

                                    // Récupérer les infos du défunt depuis Firestore
                                    let deceasedName = '';
                                    let deceasedBirthdate = '';
                                    try {
                                        const docSnap = await getDoc(doc(db, 'souvenirs', docId));
                                        if (docSnap.exists()) {
                                            const data = docSnap.data();
                                            deceasedName = data.name || '';
                                            deceasedBirthdate = data.birthdate || '';
                                        }
                                    } catch (e) { console.warn('Erreur récupération données défunt:', e); }

                                    if (hasEmailJs) {
                                        try {
                                            try { window.emailjs.init(cfg.publicKey); } catch(_) {}
                                            // Générer un numéro de commande unique
                                            const now = new Date();
                                            const year = now.getFullYear();
                                            const month = String(now.getMonth() + 1).padStart(2, '0');
                                            const day = String(now.getDate()).padStart(2, '0');
                                            const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                                            const orderNumber = `CMD-${year}${month}${day}-${randomNum}`;
                                            
                                            const params = {
                                                to_email: cfg.toEmail || 'contact.souvenirqr@gmail.com',
                                                order_number: orderNumber,
                                                doc_id: docId,
                                                final_url: finalUrl,
                                                deceased_name: deceasedName,
                                                deceased_birthdate: deceasedBirthdate,
                                                customer_email: (info.customer && (info.customer.email || info.customer?.email_address)) || '',
                                                customer_name: (info.customer && (info.customer.name || '')) || (info.shipping && info.shipping.name) || '',
                                                customer_phone: (info.customer && info.customer.phone) || (info.shipping && info.shipping.phone) || 'Non fourni',
                                                shipping_address: (info.shipping && info.shipping.address && [info.shipping.address.line1, info.shipping.address.postal_code, info.shipping.address.city, info.shipping.address.country].filter(Boolean).join(' ')) || '',
                                                qr_url: qrUrl,
                                            };
                                            // Envoi non bloquant; pas d'interruption UI
                                            window.emailjs.send(cfg.serviceId, cfg.templateId, params)
                                                .catch(err => console.warn('EmailJS send error', err));
                                        } catch (ejErr) {
                                            console.warn('EmailJS indisponible, fallback Netlify:', ejErr);
                                            // Fallback Netlify function
                                            const dataUrl = canvas.toDataURL('image/png');
                                            const base64 = (dataUrl.split(',')[1]) || '';
                                            fetch('/.netlify/functions/email-qr', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ docId, finalUrl, qrPngBase64: base64, customer: info.customer || null, shipping: info.shipping || null })
                                            }).catch(() => {});
                                        }
                                    } else {
                                        // Pas de config EmailJS -> on garde l'envoi côté serveur
                                        const dataUrl = canvas.toDataURL('image/png');
                                        const base64 = (dataUrl.split(',')[1]) || '';
                                        fetch('/.netlify/functions/email-qr', {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ docId, finalUrl, qrPngBase64: base64, customer: info.customer || null, shipping: info.shipping || null })
                                        }).catch(() => {});
                                    }
                                } catch (sendErr) {
                                    console.warn('Erreur envoi email du QR:', sendErr);
                                }
                            })();
                        }
                    } catch(e) { console.error('Erreur génération QR HD', e); }
                }

                // Afficher la modale principale
                const successModal = document.getElementById('success-modal');
                if(successModal) successModal.style.display = 'flex';

                // Nettoyer l'URL (retirer les paramètres)
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);

                // Optionnel: informer l'utilisateur
                try { alert('Paiement confirmé ✅. Votre QR est maintenant disponible.'); } catch (_) {}

                // Google Ads Conversion Tracking (si configuré)
                try {
                    const sendTo = (window.ADS_CONVERSION_SEND_TO || '').trim();
                    if (sendTo && typeof window.gtag === 'function') {
                        const valueEur = ((info.amount_total || 0) / 100);
                        const currency = (info.currency || 'EUR').toUpperCase();
                        window.gtag('event', 'conversion', {
                            send_to: sendTo,
                            value: valueEur,
                            currency: currency,
                            transaction_id: (info.session_id || docId || '')
                        });
                    }
                } catch(_) {}
            }
        }
    } catch (e) {
        console.warn('Erreur gestion retour Stripe', e);
    }
}

document.addEventListener('DOMContentLoaded', handleStripeReturn);

// Store files in arrays for multi-video support - Initialize early to avoid reference errors
let selectedPhotos = [];
// Snapshot du visuel d'origine pour l'aperçu "Avant" (clé = index)
let originalBeforeDataUrls = {};
let selectedVideos = [];
let selectedTraits = [];
let timelineItems = [];
let selectedPhotoCaptions = [];

// Live preview (Step 03)
const livePreviewFrame = document.getElementById('live-preview-frame');
function applyLivePreview() {
    if (!livePreviewFrame || !form) return;
    const theme = (form.querySelector('input[name="theme"]:checked')?.value) || 'elegant';
    const layout = (form.querySelector('input[name="layout"]:checked')?.value) || 'classic';
    const typography = (form.querySelector('input[name="typography"]:checked')?.value) || 'serif';
    
    // Send update to preview iframe
    updatePreviewFrame();
    
    // Legacy theme application for backward compatibility
    const livePreview = document.getElementById('live-preview');
    if (livePreview) {
        livePreview.classList.remove('theme-sage','theme-nocturne','font-serif','font-sans');
        if (theme === 'sage') livePreview.classList.add('theme-sage');
        else if (theme === 'nocturne') livePreview.classList.add('theme-nocturne');
        // Typography
        if (typography === 'serif') livePreview.classList.add('font-serif');
        else livePreview.classList.add('font-sans');
    }
}

// Update preview frame with current form data
function updatePreviewFrame() {
    if (!livePreviewFrame) return;
    
    // Check if arrays are initialized before using them
    const photos = selectedPhotos || [];
    const videos = selectedVideos || [];
    const traits = selectedTraits || [];
    
    // Gather timeline data - only validated items
    const timeline = [];
    document.querySelectorAll('.timeline-item').forEach(item => {
        const checkbox = item.querySelector('.timeline-checkbox');
        if (checkbox && checkbox.checked) {
            const year = item.querySelector('.timeline-year')?.value;
            const event = item.querySelector('.timeline-event')?.value;
            if (year && event) {
                timeline.push({ date: year, event: event });
            }
        }
    });
    
    const previewData = {
        name: form.name?.value || 'Nom de la personne',
        birthdate: form.birthdate?.value,
        deathdate: form.deathdate?.value,
        message: messageTextarea?.value || '',
        quote: form.quote?.value || '',
        anecdote: anecdoteTextarea?.value || '',
        birthplace: form.birthplace?.value || '',
        selectedTraits: traits,
        timeline: timeline,
        theme: form.querySelector('input[name="theme"]:checked')?.value || 'elegant',
        layout: form.querySelector('input[name="layout"]:checked')?.value || 'classic',
        typography: form.querySelector('input[name="typography"]:checked')?.value || 'serif',
        privacy: (form.querySelector('input[name="privacy"]:checked')?.value || 'public'),
        photoUrls: photos.map(file => URL.createObjectURL(file)),
        photoCaptions: (selectedPhotoCaptions || []).slice(0, photos.length),
        videoUrls: videos.map(file => URL.createObjectURL(file)),
        customization: {
            theme: form.querySelector('input[name="theme"]:checked')?.value || 'elegant',
            layout: form.querySelector('input[name="layout"]:checked')?.value || 'classic',
            typography: form.querySelector('input[name="typography"]:checked')?.value || 'serif'
        }
    };
    
    // Post message to iframe
    try {
        livePreviewFrame.contentWindow.postMessage({
            action: 'load-preview',
            data: previewData
        }, '*');
    } catch (e) {
        console.log('Could not update preview:', e);
    }
}

// Initialize everything after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Bind theme/layout changes
    document.querySelectorAll('input[name="theme"]').forEach(el => el.addEventListener('change', applyLivePreview));
    document.querySelectorAll('input[name="typography"]').forEach(el => el.addEventListener('change', applyLivePreview));
    document.querySelectorAll('input[name="layout"]').forEach(el => el.addEventListener('change', applyLivePreview));
    
    // Add event listeners for real-time preview updates
    if (form) {
        form.addEventListener('input', updatePreviewFrame);
        form.addEventListener('change', updatePreviewFrame);
    }
    
    // Timeline inputs update
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('timeline-year') || e.target.classList.contains('timeline-event')) {
            updatePreviewFrame();
        }
    });
    
    // Device switcher functionality
    const deviceBtns = document.querySelectorAll('.device-btn');
    const previewContainer = document.querySelector('.preview-frame-container');
    
    deviceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (previewContainer) {
                previewContainer.setAttribute('data-device', btn.getAttribute('data-device'));
            }
        });
    });
    
    // Make updatePreviewFrame globally accessible for timeline functions
    window.updatePreviewFrame = updatePreviewFrame;
    
    // Initial state
    applyLivePreview();
    updatePreviewFrame();

    // --- Dynamic validation: clear red styling when fields are filled ---
    const requiredNames = ['name','birthdate','birthplace','deathdate'];
    function recomputeAndUpdateErrorSummary() {
        const missing = [];
        requiredNames.forEach(n => {
            const el = form?.elements?.[n];
            if (!el) return;
            const val = (el.value || '').trim();
            // toggle highlight
            if (val) {
                try { el.classList.remove('input-error'); el.setAttribute('aria-invalid', 'false'); } catch(_) {}
            } else {
                try { el.classList.add('input-error'); el.setAttribute('aria-invalid', 'true'); } catch(_) {}
                missing.push(n);
            }
        });
        // Admin password fields (IDs, not names)
        const adminEl = adminPasswordInput;
        const adminConfirmEl = adminPasswordConfirmInput;
        const ap = (adminEl?.value || '').trim();
        const apc = (adminConfirmEl?.value || '').trim();
        // Reset highlights
        try { adminEl?.classList.remove('input-error'); adminEl?.setAttribute('aria-invalid', 'false'); } catch(_) {}
        try { adminConfirmEl?.classList.remove('input-error'); adminConfirmEl?.setAttribute('aria-invalid', 'false'); } catch(_) {}
        if (!ap) { try { adminEl?.classList.add('input-error'); adminEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}; missing.push('admin-password'); }
        if (!apc) { try { adminConfirmEl?.classList.add('input-error'); adminConfirmEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}; missing.push('admin-password-confirm'); }
        if (ap && apc && ap !== apc) {
            try { adminEl?.classList.add('input-error'); adminConfirmEl?.classList.add('input-error'); adminEl?.setAttribute('aria-invalid', 'true'); adminConfirmEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}
            missing.push('admin-password-mismatch');
        }
        const summary = document.getElementById('form-error-summary');
        if (!summary) return;
        // Remove duplicates
        const uniqueMissing = Array.from(new Set(missing));
        if (uniqueMissing.length === 0) { summary.remove(); return; }
        const labelsMap = {
            name: 'Nom complet',
            birthdate: 'Date de naissance',
            birthplace: 'Lieu de naissance',
            deathdate: 'Date de décès',
            'admin-password': 'Mot de passe Administrateur',
            'admin-password-confirm': 'Confirmez le mot de passe Administrateur',
            'admin-password-mismatch': 'Les mots de passe administrateur ne correspondent pas'
        };
        const html = uniqueMissing.map(n => `• ${labelsMap[n] || n}`).join('<br>');
        summary.innerHTML = `Merci de compléter les champs suivants pour continuer:<br>${html}`;
    }

    requiredNames.forEach(n => {
        const el = form?.elements?.[n];
        if (!el) return;
        const handler = () => recomputeAndUpdateErrorSummary();
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        el.addEventListener('blur', handler);
    });
    // Admin password listeners
    [adminPasswordInput, adminPasswordConfirmInput].forEach(el => {
        if (!el) return;
        const handler = () => recomputeAndUpdateErrorSummary();
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        el.addEventListener('blur', handler);
    });

    // Privacy UI toggle
    function refreshPrivacyVisibility() {
        try {
            const val = (document.querySelector('input[name="privacy"]:checked')?.value) || 'public';
            const show = (val === 'private');
            if (privacyPasswordGroup) privacyPasswordGroup.style.display = show ? 'block' : 'none';
            if (privacyPasswordConfirmGroup) privacyPasswordConfirmGroup.style.display = show ? 'block' : 'none';
        } catch (_) {}
    }
    privacyRadios.forEach(r => r.addEventListener('change', () => { refreshPrivacyVisibility(); updatePreviewFrame(); }));
    refreshPrivacyVisibility();

    // Minimize header on scroll beyond first section header
    const nav = document.querySelector('.create-nav');
    function onScrollMinHeader(){
        try {
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            const threshold = 20; // minimize almost immediately after scrolling
            if (y > threshold) nav?.classList.add('min'); else nav?.classList.remove('min');
        } catch(_) {}
    }
    window.addEventListener('scroll', onScrollMinHeader, { passive: true });
    onScrollMinHeader();

    // Initialize step from URL (query ?step=N or hash #step-N)
    try {
        const params = new URLSearchParams(window.location.search);
        const qsStep = params.get('step');
        const hash = window.location.hash || '';
        let initial = 0;
        if (qsStep && !Number.isNaN(Number(qsStep))) initial = Math.max(0, Math.min(sections.length - 1, Number(qsStep)));
        else if (hash.startsWith('#step-')) {
            const n = Number(hash.replace('#step-', ''));
            if (!Number.isNaN(n)) initial = Math.max(0, Math.min(sections.length - 1, n));
        }
        if (initial !== currentSection) {
            currentSection = initial;
        }
        // Replace initial state
        try { history.replaceState({ step: currentSection }, '', `?step=${currentSection}`); } catch(_) {}
    } catch(_) {}

    // Handle back/forward to navigate steps instead of leaving the page immediately
    window.addEventListener('popstate', (ev) => {
        try {
            const st = ev.state;
            if (st && typeof st.step === 'number') {
                isNavigatingFromPopstate = true;
                currentSection = Math.max(0, Math.min(sections.length - 1, st.step));
                showSection(currentSection);
                isNavigatingFromPopstate = false;
            }
        } catch(_) {}
    });

    // Header back-link: go to previous page or fallback to home
    try {
        const backLink = document.querySelector('.create-nav .back-link');
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                const fallback = backLink.getAttribute('data-fallback') || 'index.html';
                if (window.history.length > 1) {
                    // Attempt to go back; if nothing happens (rare), fallback after a short delay
                    const hrefBefore = document.referrer || '';
                    history.back();
                    setTimeout(() => {
                        // If referrer is empty or same-origin navigation didn’t occur, use fallback
                        if (!hrefBefore) window.location.assign(fallback);
                    }, 400);
                } else {
                    window.location.assign(fallback);
                }
            });
        }
    } catch(_) {}
});

// Navigation elements
const sections = document.querySelectorAll('.form-section');
const steps = document.querySelectorAll('.step');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const previewBtn = document.getElementById('preview-button');
let currentSection = 0;
let isNavigatingFromPopstate = false;

// Shared validation: ensure required info is filled before advancing or submitting
function validateRequiredAndShowSummary() {
    const requiredFields = [
        { name: 'name', label: 'Nom complet' },
        { name: 'birthdate', label: 'Date de naissance' },
        { name: 'birthplace', label: 'Lieu de naissance' },
        { name: 'deathdate', label: 'Date de décès' }
    ];
    const missing = [];
    requiredFields.forEach(f => {
        const el = form?.elements?.[f.name];
        if (!el) return;
        const val = (el.value || '').trim();
        if (!val) missing.push({ ...f, el });
        try { el.classList.remove('input-error'); el.setAttribute('aria-invalid', 'false'); } catch(_) {}
    });
    // Admin password required + confirm + match
    const adminEl = adminPasswordInput;
    const adminConfirmEl = adminPasswordConfirmInput;
    const ap = (adminEl?.value || '').trim();
    const apc = (adminConfirmEl?.value || '').trim();
    try { adminEl?.classList.remove('input-error'); adminEl?.setAttribute('aria-invalid', 'false'); } catch(_) {}
    try { adminConfirmEl?.classList.remove('input-error'); adminConfirmEl?.setAttribute('aria-invalid', 'false'); } catch(_) {}
    if (!ap) { try { adminEl?.classList.add('input-error'); adminEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}; missing.push({ name: 'admin-password', label: 'Mot de passe Administrateur', el: adminEl }); }
    if (!apc) { try { adminConfirmEl?.classList.add('input-error'); adminConfirmEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}; missing.push({ name: 'admin-password-confirm', label: 'Confirmez le mot de passe Administrateur', el: adminConfirmEl }); }
    if (ap && apc && ap !== apc) {
        try { adminEl?.classList.add('input-error'); adminConfirmEl?.classList.add('input-error'); adminEl?.setAttribute('aria-invalid', 'true'); adminConfirmEl?.setAttribute('aria-invalid', 'true'); } catch(_) {}
        missing.push({ name: 'admin-password-mismatch', label: 'Les mots de passe administrateur ne correspondent pas', el: adminConfirmEl || adminEl });
    }
    if (missing.length > 0) {
        let summary = document.getElementById('form-error-summary');
        if (!summary) {
            summary = document.createElement('div');
            summary.id = 'form-error-summary';
            summary.setAttribute('role', 'alert');
            summary.setAttribute('aria-live', 'assertive');
            summary.style.cssText = 'background:#fff3f3;border:1px solid #f0bcbc;color:#7a1e1e;padding:12px 14px;border-radius:8px;margin:0 0 16px 0;font-weight:700;';
            (form.parentElement || document.body).insertBefore(summary, form);
        }
        const list = missing.map(m => `• ${m.label}`).join('<br>');
        summary.innerHTML = `Merci de compléter les champs suivants pour continuer:<br>${list}`;
        const first = missing[0];
        if (first && first.el) {
            try {
                const sectionEl = first.el.closest('.form-section');
                if (sectionEl) {
                    const idx = Array.from(sections).indexOf(sectionEl);
                    if (idx >= 0) {
                        currentSection = idx;
                        showSection(currentSection);
                    }
                }
                first.el.classList.add('input-error');
                first.el.setAttribute('aria-invalid', 'true');
                setTimeout(() => { try { first.el.focus({ preventScroll: false }); } catch(_) {} }, 50);
                summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch(_) {}
        }
        return false;
    }
    try { const prevSummary = document.getElementById('form-error-summary'); if (prevSummary) prevSummary.remove(); } catch(_) {}
    return true;
}

// Update compact mobile header (dots + counter + title)
function updateMobileHeader(index) {
    try {
        const dots = document.querySelectorAll('.mobile-steps .dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
        const counter = document.querySelector('.mobile-step-counter');
        if (counter && sections && sections.length) {
            counter.textContent = `Étape ${index + 1}/${sections.length}`;
        }
        const navTitle = document.querySelector('.nav-title');
        if (navTitle) {
            const titles = ['Informations', 'Médias', 'Personnalisation'];
            navTitle.textContent = titles[index] || 'Personnalisation';
        }
        // Tiny progress sync
        const tiny = document.getElementById('tiny-progress');
        if (tiny && sections && sections.length) {
            tiny.textContent = `${index + 1}/${sections.length}`;
        }
    } catch (_) { /* no-op */ }
}

// Initialize mobile header state
updateMobileHeader(currentSection);

// --- Section Navigation ---
function showSection(index) {
    sections.forEach((section, i) => {
        section.classList.toggle('active', i === index);
    });
    steps.forEach((step, i) => {
        step.classList.toggle('active', i === index);
    });

    // Previous button only hidden on first step
    prevBtn.style.display = index === 0 ? 'none' : 'block';

    // Use a single CTA: nextBtn always visible; previewBtn hidden (if present)
    nextBtn.style.display = 'block';
    if (previewBtn) previewBtn.style.display = 'none';

    // Dynamic label for CTA
    if (index === sections.length - 1) {
        nextBtn.textContent = 'Commander mon QR code à coller';
        nextBtn.classList.add('cta-final');
        nextBtn.classList.add('btn-cta');
        nextBtn.classList.remove('btn-primary');
        // Secondary preview button removed
    } else {
        nextBtn.textContent = 'Suivant \u2192';
        nextBtn.classList.remove('cta-final');
        nextBtn.classList.remove('btn-cta');
        if (!nextBtn.classList.contains('btn-primary')) nextBtn.classList.add('btn-primary');
    }

    // Update CTA subtext under the buttons
    try {
        const ctaSub = document.getElementById('cta-subtext');
        if (ctaSub) {
            if (index === sections.length - 1) {
                ctaSub.textContent = 'Prévisualisation gratuite • Paiement sécurisé par Stripe';
            } else {
                ctaSub.textContent = `Étape ${index + 1} sur ${sections.length}`;
            }
        }
    } catch (_) {}

    // Update compact mobile header (dots/counter/title)
    updateMobileHeader(index);

    // Smooth scroll to top
    window.scrollTo({ top: 100, behavior: 'smooth' });

    // Ensure mobile hint defaults to editing message on step 3
    try {
        if (index === sections.length - 1) {
            if (typeof window.__suppressHint === 'function') window.__suppressHint(800);
            if (typeof window.__setHintPreviewState === 'function') window.__setHintPreviewState(false);
        }
    } catch(_) {}

    // Push history state so the browser Back button navigates steps
    try {
        if (!isNavigatingFromPopstate) {
            history.pushState({ step: index }, '', `?step=${index}`);
        }
    } catch(_) {}
}

prevBtn.addEventListener('click', () => {
    if (currentSection > 0) {
        currentSection--;
        showSection(currentSection);
    }
});

// --- Customization panel: Enhance/Colorize controls ---
function refreshEnhanceSelect() {
    const select = document.getElementById('imageEnhanceSelect');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '';
    if (!Array.isArray(selectedPhotos) || selectedPhotos.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Aucune photo importée';
        select.appendChild(opt);
        select.disabled = true;
        // Also clear thumbs and previews
        const thumbs = document.getElementById('enhanceThumbs');
        if (thumbs) thumbs.innerHTML = '';
        const beforeLarge = document.getElementById('enhanceBeforeLarge');
        const afterLarge = document.getElementById('enhanceAfterLarge');
        if (beforeLarge) beforeLarge.src = '';
        if (afterLarge) afterLarge.src = '';
        // Reset snapshots
        originalBeforeDataUrls = {};
        return;
    }
    select.disabled = false;
    selectedPhotos.forEach((file, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Photo ${idx + 1} — ${file.name || 'image'}`;
        select.appendChild(opt);
    });
    if (prevValue && Number(prevValue) < selectedPhotos.length) {
        select.value = prevValue;
    } else {
        select.value = '0';
    }

    // Render/update clickable thumbs
    if (typeof renderEnhanceThumbs === 'function') {
        renderEnhanceThumbs();
    }

    // Ensure preview shows the selected item
    if (select.value !== '') {
        select.dispatchEvent(new Event('change'));
    }
}

// Build clickable thumbnails for enhancement selection
async function renderEnhanceThumbs() {
    const thumbs = document.getElementById('enhanceThumbs');
    const select = document.getElementById('imageEnhanceSelect');
    if (!thumbs || !Array.isArray(selectedPhotos)) return;
    thumbs.innerHTML = '';
    const currentIdx = Number(select?.value || '0');
    // Create each thumb
    for (let i = 0; i < selectedPhotos.length; i++) {
        const file = selectedPhotos[i];
        const url = await fileToDataUrl(file).catch(() => '');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative; cursor:pointer; border:1px solid var(--color-border); border-radius:10px; overflow:hidden;';
        wrap.setAttribute('data-index', String(i));
        if (i === currentIdx) {
            wrap.style.outline = '2px solid var(--color-primary)';
            wrap.style.boxShadow = '0 0 0 4px var(--color-primary-light)';
        }
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Photo ${i + 1}`;
        img.style.cssText = 'width:120px; height:80px; object-fit:cover; display:block;';
        const badge = document.createElement('div');
        badge.textContent = `Photo ${i + 1}`;
        badge.style.cssText = 'position:absolute; left:6px; top:6px; background: rgba(0,0,0,0.6); color:#fff; padding:.15rem .4rem; border-radius:6px; font-size:.8rem;';
        wrap.appendChild(img);
        wrap.appendChild(badge);
        wrap.addEventListener('click', () => {
            if (select) {
                select.value = String(i);
                select.dispatchEvent(new Event('change'));
            }
            // Update active outline
            thumbs.querySelectorAll('div[data-index]')?.forEach(el => {
                el.style.outline = '';
                el.style.boxShadow = '';
            });
            wrap.style.outline = '2px solid var(--color-primary)';
            wrap.style.boxShadow = '0 0 0 4px var(--color-primary-light)';
        });
        thumbs.appendChild(wrap);
    }
}

function bindEnhanceControls() {
    const select = document.getElementById('imageEnhanceSelect');
    const unifiedBtn = document.getElementById('unifiedEnhanceBtn');
    const statusEl = document.getElementById('imageEnhanceStatus');
    const afterFigure = document.getElementById('afterFigure');
    const afterPlaceholder = document.getElementById('afterPlaceholder');
    const downloadBtn = document.getElementById('downloadEnhancedBtn');
    if (!select || !unifiedBtn) return;

    const setLoading = (isLoading) => {
        unifiedBtn.disabled = isLoading; select.disabled = isLoading;
        try { unifiedBtn.classList.toggle('is-loading', !!isLoading); } catch(_) {}
        // Rotating friendly phrases while processing
        const phrases = [
            'Nous analysons chaque pixel…',
            'Nous détectons les textures et les contours…',
            'Nous estimons les couleurs plausibles…',
            'Nous équilibrons contraste et lumière…',
            'Nous affinons les détails en douceur…'
        ];
        if (!window.__enhanceMsgTimer) window.__enhanceMsgTimer = null;
        if (!window.__enhanceMsgIdx && window.__enhanceMsgIdx !== 0) window.__enhanceMsgIdx = 0;
        if (isLoading) {
            try { if (statusEl) statusEl.textContent = phrases[window.__enhanceMsgIdx % phrases.length]; } catch(_) {}
            try {
                if (window.__enhanceMsgTimer) clearInterval(window.__enhanceMsgTimer);
                window.__enhanceMsgTimer = setInterval(() => {
                    try {
                        window.__enhanceMsgIdx = (window.__enhanceMsgIdx + 1) % phrases.length;
                        if (statusEl) statusEl.textContent = phrases[window.__enhanceMsgIdx];
                    } catch(_) {}
                }, 1200);
            } catch(_) {}
        } else {
            try { if (statusEl) statusEl.textContent = ''; } catch(_) {}
            try { if (window.__enhanceMsgTimer) { clearInterval(window.__enhanceMsgTimer); window.__enhanceMsgTimer = null; } } catch(_) {}
        }
        const thumbs = document.getElementById('enhanceThumbs');
        if (thumbs) {
            thumbs.style.pointerEvents = isLoading ? 'none' : '';
            thumbs.style.opacity = isLoading ? '0.6' : '';
        }
        if (afterFigure) afterFigure.style.pointerEvents = isLoading ? 'none' : '';
    };

    // Update mini preview when selection changes
    select.addEventListener('change', async () => {
        const idx = Number(select.value);
        const beforeImg = document.getElementById('enhanceBeforeLarge');
        const afterImg = document.getElementById('enhanceAfterLarge');
        if (!isNaN(idx) && selectedPhotos[idx] && beforeImg) {
            try {
                // Utiliser le snapshot "Avant" si disponible; sinon, le créer maintenant
                let url = originalBeforeDataUrls[idx];
                if (!url) {
                    url = await fileToDataUrl(selectedPhotos[idx]);
                    originalBeforeDataUrls[idx] = url;
                }
                beforeImg.src = url;
            } catch {}
        }
        if (afterImg) afterImg.src = '';
        if (afterPlaceholder) afterPlaceholder.style.display = 'flex';
        if (downloadBtn) { downloadBtn.style.pointerEvents = 'none'; downloadBtn.style.opacity = '.5'; downloadBtn.removeAttribute('href'); }
    });

    const unifiedAction = async () => {
        const idx = Number(select.value);
        if (isNaN(idx)) return;
        try {
            setLoading(true);
            // Single flow: prefer colorize for robustness (handles B&W and color images while enhancing)
            await enhancePhotoAtIndex(idx, 'colorize');
            // Enable download if output is available
            enableDownloadIfReady();
        } finally {
            setLoading(false);
        }
    };
    unifiedBtn.addEventListener('click', unifiedAction);

    // Viewer overlay helpers
    const imgViewerOverlay = document.getElementById('img-viewer-overlay');
    const imgViewerImg = document.getElementById('img-viewer-img');
    const imgViewerClose = document.getElementById('img-viewer-close');
    function openImgViewer(src) {
        if (!imgViewerOverlay || !imgViewerImg) return;
        imgViewerImg.src = src || '';
        imgViewerOverlay.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
    function closeImgViewer() {
        if (!imgViewerOverlay || !imgViewerImg) return;
        imgViewerOverlay.style.display = 'none';
        imgViewerImg.src = '';
        document.body.classList.remove('modal-open');
    }
    if (imgViewerClose) imgViewerClose.addEventListener('click', closeImgViewer);
    if (imgViewerOverlay) imgViewerOverlay.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'img-viewer-overlay')) closeImgViewer();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeImgViewer();
    });

    // Click to view: Avant
    const beforeLargeEl = document.getElementById('enhanceBeforeLarge');
    if (beforeLargeEl) {
        beforeLargeEl.style.cursor = 'zoom-in';
        beforeLargeEl.addEventListener('click', () => {
            if (beforeLargeEl.src) openImgViewer(beforeLargeEl.src);
        });
    }

    // Click on "Après" panel: if image exists, open viewer; else trigger recolorize
    if (afterFigure) {
        const afterLargeEl = document.getElementById('enhanceAfterLarge');
        if (afterLargeEl) afterLargeEl.style.cursor = 'zoom-in';
        afterFigure.addEventListener('click', () => {
            const src = afterLargeEl?.getAttribute('src') || '';
            if (src && src.trim() !== '') {
                openImgViewer(src);
            } else if (!unifiedBtn.disabled) {
                unifiedAction();
            }
        });
    }

    function enableDownloadIfReady(){
        try {
            const img = document.getElementById('enhanceAfterLarge');
            if (!img) return;
            const src = img.getAttribute('src') || '';
            if (!src || src.trim() === '') return;
            if (!downloadBtn) return;

            // If it's already a data URL, link directly
            if (src.startsWith('data:')) {
                downloadBtn.href = src;
                downloadBtn.style.pointerEvents = 'auto';
                downloadBtn.style.opacity = '1';
                return;
            }
            // Otherwise, fetch and create a blob URL
            fetch(src).then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                downloadBtn.href = url;
                downloadBtn.style.pointerEvents = 'auto';
                downloadBtn.style.opacity = '1';
            }).catch(()=>{
                // Fallback: open in new tab
                downloadBtn.href = src;
                downloadBtn.target = '_blank';
                downloadBtn.style.pointerEvents = 'auto';
                downloadBtn.style.opacity = '1';
            });
        } catch(_) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bindEnhanceControls();
    refreshEnhanceSelect();

    // Banner: restore preview if any (not persisted across reloads now)
    if (bannerPreview && generatedBannerDataUrl) bannerPreview.src = generatedBannerDataUrl;

    // Banner generation handler
    if (generateBannerBtn) {
        generateBannerBtn.addEventListener('click', async () => {
            const prompt = (bannerPromptInput?.value || '').trim();
            if (!prompt) {
                alert('Décrivez l\'environnement souhaité (ex: mer, plaine, piste de moto, lune...)');
                bannerPromptInput?.focus();
                return;
            }
            try {
                generateBannerBtn.disabled = true;
                if (bannerStatus) bannerStatus.textContent = 'Génération de la bannière…';
                const resp = await fetch('/.netlify/functions/generate-banner', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || !json.imageBase64) {
                    console.error('Banner API error:', json);
                    if (bannerStatus) bannerStatus.textContent = 'IA indisponible. Réessayez.';
                    return;
                }
                generatedBannerDataUrl = 'data:image/png;base64,' + json.imageBase64;
                if (bannerPreview) bannerPreview.src = generatedBannerDataUrl;
                if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
                if (bannerStatus) bannerStatus.textContent = 'Bannière générée ✅';
            } catch (e) {
                console.error(e);
                if (bannerStatus) bannerStatus.textContent = 'Erreur. Réessayez.';
            } finally {
                generateBannerBtn.disabled = false;
            }
        });
    }

    if (removeBannerBtn) {
        removeBannerBtn.addEventListener('click', () => {
            generatedBannerDataUrl = '';
            if (bannerPreview) bannerPreview.src = '';
            if (bannerStatus) bannerStatus.textContent = 'Bannière désactivée';
            if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
        });
    }

    // Presets: quick fill + optional auto-generate if no preview yet
    document.querySelectorAll('[data-banner-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-banner-preset');
            if (bannerPromptInput) bannerPromptInput.value = val;
            if (!generatedBannerDataUrl && generateBannerBtn) {
                generateBannerBtn.click();
            }
        });
    });
});

nextBtn.addEventListener('click', (e) => {
    // If not on last step, validate then go to next section
    if (currentSection < sections.length - 1) {
        if (!validateRequiredAndShowSummary()) return;
        currentSection++;
        showSection(currentSection);
        return;
    }
    // On last step, trigger final flow
    try {
        handleFormSubmit(e instanceof Event ? e : new Event('submit'));
    } catch (_) {
        // Fallback if Event is not suitable
        handleFormSubmit({ preventDefault: () => {} });
    }
});


async function handleFormSubmit(e) {
    e.preventDefault();
    // Validate first; block submission if missing
    if (!validateRequiredAndShowSummary()) return;

    // Clean any previous error summary when validation passes
    try { const prevSummary = document.getElementById('form-error-summary'); if (prevSummary) prevSummary.remove(); } catch(_) {}
    loading.style.display = 'flex';
    startAnimatedLoading();
    setLoadingStatus('', 5);

    try {
        const timeline = [];
        document.querySelectorAll('.timeline-item.validated').forEach(item => {
            const year = item.querySelector('.timeline-year')?.value;
            const event = item.querySelector('.timeline-event')?.value;
            if (year && event) {
                timeline.push({ date: year, event: event });
            }
        });

        const privacyChoice = (form.querySelector('input[name="privacy"]:checked')?.value || 'public');
        const rawPassword = (privacyPasswordInput?.value || '').trim();
        const rawPasswordConfirm = (privacyPasswordConfirmInput?.value || '').trim();
        if (privacyChoice === 'private' && !rawPassword) {
            try { alert('Veuillez définir un mot de passe pour un mémorial privé.'); } catch(_) {}
            if (privacyPasswordInput) privacyPasswordInput.focus();
            stopAnimatedLoading();
            loading.style.display = 'none';
            return;
        }
        if (privacyChoice === 'private' && rawPassword !== rawPasswordConfirm) {
            try { alert('Les mots de passe ne correspondent pas. Veuillez les retaper et les noter dans un endroit sûr.'); } catch(_) {}
            if (privacyPasswordConfirmInput) privacyPasswordConfirmInput.focus();
            stopAnimatedLoading();
            loading.style.display = 'none';
            return;
        }
        // Validate admin password (required)
        const adminPwd = (adminPasswordInput?.value || '').trim();
        const adminPwdConfirm = (adminPasswordConfirmInput?.value || '').trim();
        if (!adminPwd) {
            try { alert('Veuillez définir un mot de passe administrateur (obligatoire)'); } catch(_) {}
            adminPasswordInput?.focus();
            stopAnimatedLoading();
            loading.style.display = 'none';
            return;
        }
        if (adminPwd !== adminPwdConfirm) {
            try { alert('Les mots de passe administrateur ne correspondent pas.'); } catch(_) {}
            adminPasswordConfirmInput?.focus();
            stopAnimatedLoading();
            loading.style.display = 'none';
            return;
        }

        const souvenirData = {
            name: form.name.value,
            birthdate: form.birthdate.value,
            deathdate: form.deathdate.value,
            birthplace: form.birthplace.value,
            message: messageTextarea.value,
            anecdote: anecdoteTextarea.value,
            quote: quoteInput.value,
            selectedTraits: selectedTraits,
            timeline: timeline,
            customization: {
                theme: form.querySelector('input[name="theme"]:checked')?.value || 'elegant',
                typography: form.querySelector('input[name="typography"]:checked')?.value || 'serif',
            },
            privacy: privacyChoice,
            isPrivate: privacyChoice === 'private',
            createdAt: new Date()
        };

        // If private and password provided, store SHA-256 hash only
        if (privacyChoice === 'private' && rawPassword) {
            try {
                souvenirData.passwordHash = await sha256Hex(rawPassword);
            } catch (_) {}
        }

        // Always store admin password hash (separate from privacy access)
        try {
            souvenirData.adminPasswordHash = await sha256Hex(adminPwd);
        } catch(_) {}

        setLoadingProgressWithMessage(10);
        const docRef = await addDoc(collection(db, "souvenirs"), souvenirData);
        const docId = docRef.id;

        const photoUrls = [];
        const videoUrls = [];
        const totalFiles = selectedPhotos.length + selectedVideos.length;
        let uploadedFiles = 0;

        const updateUploadProgress = () => {
            if (totalFiles > 0) {
                uploadedFiles++;
                const progress = 15 + (uploadedFiles / totalFiles) * 70;
                setLoadingStatus('', progress);
            }
        };

        if (totalFiles === 0) {
            setLoadingProgressWithMessage(85);
        } else {
            updateUploadProgress(); // Initial call to show 1/n
        }

        for (const file of selectedPhotos) {
            const photoRef = ref(storage, `souvenirs/${docId}/photos/${file.name}`);
            await uploadBytes(photoRef, file);
            const url = await getDownloadURL(photoRef);
            photoUrls.push(url);
            updateUploadProgress();
        }

        for (const file of selectedVideos) {
            const videoRef = ref(storage, `souvenirs/${docId}/videos/${file.name}`);
            await uploadBytes(videoRef, file);
            const url = await getDownloadURL(videoRef);
            videoUrls.push(url);
            updateUploadProgress();
        }

        setLoadingProgressWithMessage(95);
        await updateDoc(doc(db, "souvenirs", docId), {
            photoUrls: photoUrls,
            videoUrls: videoUrls
        });

        // Correction de l'URL finale (nouvelle page mémorial)
        const finalUrl = `${window.location.origin}/preview-new.html?id=${docId}`;

        // Affichage de la modale de succès VERROUILLÉE avant paiement
        const qrcodeContainer = document.getElementById('qrcode');
        if (qrcodeContainer) {
            qrcodeContainer.innerHTML = '<div style="padding:8px; color:#777;">QR disponible après paiement</div>';
        }

        // Afficher l'étape de paiement et cacher la confirmation
        const paymentStep = document.getElementById('payment-step');
        if (paymentStep) paymentStep.style.display = 'block';
        const confirmationStep = document.getElementById('confirmation-step');
        if (confirmationStep) confirmationStep.style.display = 'none';

        const souvenirLinkEl = document.getElementById('souvenir-link');
        if (souvenirLinkEl) {
            souvenirLinkEl.href = finalUrl;
            souvenirLinkEl.style.pointerEvents = 'none';
            souvenirLinkEl.style.opacity = '0.6';
        }

        const downloadQREl = document.getElementById('download-qr');
        if (downloadQREl) {
            downloadQREl.removeAttribute('href');
            downloadQREl.style.pointerEvents = 'none';
            downloadQREl.style.opacity = '0.6';
        }

        // Brancher le bouton de paiement
        const payNowBtn2 = document.getElementById('pay-now-button');
        if (payNowBtn2) {
            payNowBtn2.disabled = false;
            payNowBtn2.onclick = async () => {
                try {
                    payNowBtn2.disabled = true;
                    const resp = await fetch('/.netlify/functions/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ docId, origin: window.location.origin })
                    });
                    if (!resp.ok) {
                        const err = await resp.text();
                        throw new Error(err || 'Erreur lors de la création de la session de paiement');
                    }
                    const data = await resp.json();
                    if (data.url) {
                        window.location.href = data.url;
                    } else {
                        throw new Error('URL de redirection Stripe introuvable');
                    }
                } catch (e) {
                    alert('Impossible de démarrer le paiement. Réessayez.');
                    console.error(e);
                    payNowBtn2.disabled = false;
                }
            };
        }

        // Bouton de simulation de paiement (DEV uniquement)
        const simulateBtn2 = document.getElementById('simulate-pay-button');
        try {
            const isDevEnv = ['localhost', '127.0.0.1'].includes(window.location.hostname) || (new URLSearchParams(window.location.search).get('dev') === '1');
            if (simulateBtn2 && isDevEnv) {
                simulateBtn2.style.display = 'block';
                simulateBtn2.onclick = async () => {
                    try {
                        // Marquer payé côté Firestore
                        await updateDoc(doc(db, 'souvenirs', docId), {
                            payment: { status: 'paid', simulated: true, at: new Date() }
                        });

                        // Basculer vers l'étape de confirmation
                        const paymentStep = document.getElementById('payment-step');
                        if (paymentStep) paymentStep.style.display = 'none';
                        const confirmationStep = document.getElementById('confirmation-step');
                        if (confirmationStep) confirmationStep.style.display = 'block';

                        // Générer QR et liens
                        const finalUrlSim = `${window.location.origin}/preview-new.html?id=${docId}`;
                        const qrPaidDivSim = document.getElementById('qrcode-paid');
                        if (qrPaidDivSim) {
                            qrPaidDivSim.innerHTML = '';
                            new QRCode(qrPaidDivSim, { text: finalUrlSim, width: 128, height: 128 });
                        }
                        const linkEl = document.getElementById('souvenir-link');
                        if (linkEl) { linkEl.href = finalUrlSim; linkEl.target = '_blank'; linkEl.rel = 'noopener'; }

                        const dlEl = document.getElementById('download-qr');
                        if (dlEl) {
                            try {
                                const tmp = document.createElement('div');
                                new QRCode(tmp, { text: finalUrlSim, width: 1024, height: 1024, correctLevel: QRCode.CorrectLevel.H });
                                const canvas = tmp.querySelector('canvas');
                                if (canvas) {
                                    dlEl.href = canvas.toDataURL('image/png');
                                    dlEl.download = `QR-Souvenir-${docId}.png`;
                                }
                            } catch(_) {}
                        }
                    } catch (e) {
                        console.warn('Simulation paiement échouée', e);
                        alert('Simulation échouée');
                    }
                };
            }
        } catch (_) {}

        stopAnimatedLoading();
        loading.style.display = 'none';
        const successModalEl = document.getElementById('success-modal');
        if (successModalEl) successModalEl.style.display = 'flex';

    } catch (error) {
        console.error("Erreur lors de la création du souvenir:", error);
        alert("Une erreur est survenue. Veuillez vérifier votre connexion et réessayer.");
        loading.style.display = 'none';
    }
}

// Assurer qu'il n'y a qu'un seul écouteur d'événement pour le bouton "Voir l’aperçu"
if (previewBtn) {
    previewBtn.removeEventListener('click', handleFormSubmit);
    const scrollToPreview = (e) => {
        try { e.preventDefault(); } catch(_) {}
        // Force dernier onglet (personnalisation) visible
        if (currentSection !== sections.length - 1) {
            currentSection = sections.length - 1;
            showSection(currentSection);
        }
        if (typeof window.__scrollToPreview === 'function') {
            window.__scrollToPreview();
        } else {
            const previewEl = document.querySelector('.preview-frame-container');
            if (previewEl) previewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };
    previewBtn.addEventListener('click', scrollToPreview);
}

document.getElementById('close-modal-button')?.addEventListener('click', () => {
    const modal = document.getElementById('success-modal');
    if (modal) modal.style.display = 'none';
    window.location.reload();
});

// --- Enhanced Media Preview ---
function createPreviewItem(file, index, type) {
    const item = document.createElement('div');
    item.classList.add('media-preview-item');
    item.dataset.index = index;

    const removeBtn = document.createElement('button');
    removeBtn.classList.add('remove-media-btn');
    removeBtn.innerHTML = '×';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeMedia(index, type);
    };

    if (type === 'photo') {
        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        item.appendChild(img);

if (index === 0) {
const coverLabel = document.createElement('div');
coverLabel.classList.add('cover-label');
coverLabel.textContent = 'Couverture';
coverLabel.style.cssText = 'position:absolute;bottom:5px;left:5px;background:rgba(0,0,0,0.7);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;';
item.appendChild(coverLabel);
}

// Caption input for each photo
const captionInput = document.createElement('input');
captionInput.type = 'text';
captionInput.placeholder = 'Légende (optionnel)';
captionInput.value = selectedPhotoCaptions[index] || '';
captionInput.style.cssText = 'margin-top:8px;width:100%;padding:6px 8px;border:1px solid var(--color-border);border-radius:6px;font-size:0.9rem;';
captionInput.addEventListener('input', (e) => {
selectedPhotoCaptions[index] = e.target.value;
// Live update preview with captions
if (typeof updatePreviewFrame === 'function') {
updatePreviewFrame();
}
});
item.appendChild(captionInput);

// (Enhance/Colorize controls moved to customization panel)
} else {
const video = document.createElement('video');
video.controls = true;
const reader = new FileReader();
reader.onload = (e) => {
video.src = e.target.result;
};
reader.readAsDataURL(file);
item.appendChild(video);
}

item.appendChild(removeBtn);
return item;
}

function removeMedia(index, type) {
if (type === 'photo') {
selectedPhotos.splice(index, 1);
if (Array.isArray(selectedPhotoCaptions)) {
selectedPhotoCaptions.splice(index, 1);
}
updatePhotoPreview();
} else {
selectedVideos.splice(index, 1);
updateVideoPreview();
}
}

function updatePhotoPreview() {
if (!imagePreviewContainer) return;
imagePreviewContainer.innerHTML = ''; // Clear the container before adding new photos
selectedPhotos.forEach((file, index) => {
const previewItem = createPreviewItem(file, index, 'photo');
if (previewItem) {
imagePreviewContainer.appendChild(previewItem);
}
});
// Keep customization panel select in sync
if (typeof refreshEnhanceSelect === 'function') {
refreshEnhanceSelect();
}
}

function updateVideoPreview() {
videoPreviewContainer.innerHTML = '';
selectedVideos.forEach((file, index) => {
videoPreviewContainer.appendChild(createPreviewItem(file, index, 'video'));
});
}

// --- Media Input Handlers ---
const MAX_PHOTOS = 20;
const MAX_VIDEOS = 5;
const MAX_PHOTO_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 50;

function handleAddPhotos(files) {
    const newFiles = Array.from(files || []);
    let added = 0;
    for (const file of newFiles) {
        if (!file.type?.startsWith('image/')) continue;
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > MAX_PHOTO_SIZE_MB) {
            alert(`Photo "${file.name}" trop lourde (${sizeMB.toFixed(1)}MB). Maximum: ${MAX_PHOTO_SIZE_MB}MB`);
            continue;
        }
        if (selectedPhotos.length >= MAX_PHOTOS) {
            alert(`Maximum ${MAX_PHOTOS} photos autorisées.`);
            break;
        }
        selectedPhotos.push(file);
        if (Array.isArray(selectedPhotoCaptions)) selectedPhotoCaptions.push('');
        added++;
    }
    if (added === 0) return;
    updatePhotoPreview();
    if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
}

photosInput.addEventListener('change', (e) => {
    handleAddPhotos(e.target.files);
    photosInput.value = '';
});

function handleAddVideos(files) {
    const newFiles = Array.from(files || []).filter(f => f.type?.startsWith('video/'));
    if (newFiles.length === 0) return;
    let added = 0;
    for (const file of newFiles) {
        if (selectedVideos.length >= MAX_VIDEOS) {
            alert(`Maximum ${MAX_VIDEOS} vidéos autorisées.`);
            break;
        }
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > MAX_VIDEO_SIZE_MB) {
            alert(`Vidéo "${file.name}" trop lourde (${sizeMB.toFixed(1)}MB). Maximum: ${MAX_VIDEO_SIZE_MB}MB`);
            continue;
        }
        selectedVideos.push(file);
        added++;
    }
    if (added === 0) return;
    updateVideoPreview();
    if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
}

videosInput.addEventListener('change', (e) => {
    handleAddVideos(e.target.files);
    videosInput.value = '';
});

// Drag & Drop support for photos/videos
document.addEventListener('DOMContentLoaded', () => {
    const photosDropzone = document.querySelector('label.upload-area[for="photos"], .upload-area.photos');
    if (photosDropzone) {
        ;['dragenter','dragover'].forEach(evt => photosDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); photosDropzone.classList.add('drag-over'); }));
        ;['dragleave','drop'].forEach(evt => photosDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); photosDropzone.classList.remove('drag-over'); }));
        photosDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt?.files?.length) {
                handleAddPhotos(dt.files);
            }
        });
    }
    const videosDropzone = document.querySelector('label.upload-area[for="videos"], .upload-area.videos');
    if (videosDropzone) {
        ;['dragenter','dragover'].forEach(evt => videosDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); videosDropzone.classList.add('drag-over'); }));
        ;['dragleave','drop'].forEach(evt => videosDropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); videosDropzone.classList.remove('drag-over'); }));
        videosDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt?.files?.length) {
                handleAddVideos(dt.files);
            }
        });
    }
});

// --- Gestion des cartes de personnalité ---
personalityGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('.personality-card');
    if (!card) return;
    
    const trait = card.dataset.trait;
    if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        selectedTraits = selectedTraits.filter(t => t !== trait);
    } else {
        card.classList.add('selected');
        selectedTraits.push(trait);
    }
});

// --- Fonctions IA génériques ---
async function callAI(text, type, name = '', traits = []) {
    const prompts = {
        correct: `Corrige uniquement les fautes d'orthographe, de grammaire et de syntaxe dans ce texte, sans changer le contenu ni le style : "${text}"`,
        improve: `Améliore la formulation de ce texte en le rendant plus fluide et touchant, tout en conservant exactement le même contenu et sens : "${text}"`,
        generate: `Rédige une biographie touchante en français pour ${name}. ${traits.length > 0 ? `Cette personne était notamment : ${traits.join(', ')}.` : ''} Écris un texte personnel et émouvant de 150-200 mots.`,
        anecdote: `Améliore cette anecdote en la rendant plus vivante et touchante, sans en changer le contenu : "${text}"`
    };

    const response = await fetch('/.netlify/functions/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: prompts[type],
            type: type
        })
    });

    const data = await response.json();
    if (!data.text) {
        throw new Error(data.error || 'Erreur inconnue');
    }
    return data.text;
}

// --- Gestionnaires IA pour l'anecdote ---
correctAnecdoteBtn?.addEventListener('click', async () => {
    const text = anecdoteTextarea.value.trim();
    if (!text) {
        alert('Veuillez d\'abord saisir une anecdote.');
        return;
    }
    
    anecdoteStatus.textContent = 'Correction en cours...';
    correctAnecdoteBtn.disabled = true;
    
    try {
        const correctedText = await callAI(text, 'correct');
        anecdoteTextarea.value = correctedText;
        anecdoteStatus.textContent = '✅ Anecdote corrigée !';
    } catch (error) {
        anecdoteStatus.textContent = '❌ Erreur lors de la correction.';
    } finally {
        correctAnecdoteBtn.disabled = false;
    }
});

improveAnecdoteBtn?.addEventListener('click', async () => {
    const text = anecdoteTextarea.value.trim();
    if (!text) {
        alert('Veuillez d\'abord saisir une anecdote.');
        return;
    }
    
    anecdoteStatus.textContent = 'Amélioration en cours...';
    improveAnecdoteBtn.disabled = true;
    
    try {
        const improvedText = await callAI(text, 'anecdote');
        anecdoteTextarea.value = improvedText;
        anecdoteStatus.textContent = '✅ Anecdote améliorée !';
    } catch (error) {
        anecdoteStatus.textContent = '❌ Erreur lors de l\'amélioration.';
    } finally {
        improveAnecdoteBtn.disabled = false;
    }
});

// --- Gestionnaires IA pour la biographie ---
correctBioBtn?.addEventListener('click', async () => {
    const text = messageTextarea.value.trim();
    if (!text) {
        alert('Veuillez d\'abord saisir une biographie.');
        return;
    }
    
    aiStatus.textContent = 'Correction en cours...';
    correctBioBtn.disabled = true;
    
    try {
        const correctedText = await callAI(text, 'correct');
        messageTextarea.value = correctedText;
        aiStatus.textContent = '✅ Biographie corrigée !';
    } catch (error) {
        aiStatus.textContent = '❌ Erreur lors de la correction.';
    } finally {
        correctBioBtn.disabled = false;
    }
});

improveBioBtn?.addEventListener('click', async () => {
    const text = messageTextarea.value.trim();
    if (!text) {
        alert('Veuillez d\'abord saisir une biographie.');
        return;
    }
    
    aiStatus.textContent = 'Amélioration en cours...';
    improveBioBtn.disabled = true;
    
    try {
        const improvedText = await callAI(text, 'improve');
        messageTextarea.value = improvedText;
        aiStatus.textContent = '✅ Biographie améliorée !';
    } catch (error) {
        aiStatus.textContent = '❌ Erreur lors de l\'amélioration.';
    } finally {
        improveBioBtn.disabled = false;
    }
});

// --- Génération complète de biographie avec IA ---
generateButton?.addEventListener('click', async () => {
    const name = form.name.value;
    if (!name) {
        alert('Veuillez renseigner le nom avant de générer une biographie.');
        return;
    }
    
    aiStatus.textContent = 'Génération de la biographie...';
    generateButton.disabled = true;

    try {
        const generatedText = await callAI('', 'generate', name, selectedTraits);
        messageTextarea.value = generatedText;
        aiStatus.textContent = '✅ Biographie générée avec succès !';
    } catch (error) {
        aiStatus.textContent = '❌ Erreur lors de la génération. Réessayez.';
    } finally {
        generateButton.disabled = false;
    }
});

// --- Génération de citation par IA (optionnelle) ---
generateQuoteButton?.addEventListener('click', async () => {
    const name = form.name.value;
    if (!name) {
        alert('Veuillez renseigner le nom avant de générer une citation.');
        return;
    }
    quoteStatus.textContent = 'Génération de la citation...';
    generateQuoteButton.disabled = true;

    try {
        const response = await fetch('/.netlify/functions/generate-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `Génère une citation inspirante et touchante en français qui pourrait représenter une personne nommée ${name}. La citation doit être courte (maximum 20 mots), émouvante et universelle.`,
                type: 'quote'
            })
        });

        const data = await response.json();
        if (data.text) {
            quoteInput.value = data.text;
            quoteStatus.textContent = '✅ Citation générée avec succès !';
        } else {
            throw new Error(data.error || 'Erreur inconnue');
        }
    } catch (error) {
        console.error('Erreur lors de la génération de citation:', error);
        quoteStatus.textContent = '❌ Erreur lors de la génération. Réessayez.';
    } finally {
        generateQuoteButton.disabled = false;
    }
});

// --- Logique de génération de texte par IA ---
generateButton.addEventListener('click', async () => {
    const name = form.name.value;
    const birthdate = form.birthdate.value;
    const deathdate = form.deathdate.value;

    if (!name || !birthdate || !deathdate) {
        alert('Veuillez remplir le nom et les dates avant de générer un texte.');
        return;
    }

    aiStatus.textContent = 'Génération en cours...';
    generateButton.disabled = true;

    const prompt = `Rédige un court texte d'hommage touchant et poétique pour les funérailles de ${name}, né(e) le ${birthdate} et décédé(e) le ${deathdate}. Le ton doit être réconfortant et célébrer la vie de la personne. Ne mentionne pas "funérailles" dans le texte.`;

    try {
        const response = await fetch('/.netlify/functions/generate-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Réponse invalide de la fonction serverless.' }));
            throw new Error(`Erreur de la fonction Gemini: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        const generatedText = data.text;
        messageTextarea.value = generatedText;
        aiStatus.textContent = 'Texte généré avec succès !';

    } catch (error) {
        console.error('Erreur lors de la génération de texte par IA:', error);
        aiStatus.textContent = 'Erreur lors de la génération.';
        alert('Désolé, une erreur est survenue. Veuillez réessayer.');
    } finally {
        generateButton.disabled = false;
    }
});

// Stockage temporaire des fichiers pour l'upload final
let filesToUpload = {};

// Gestion de fermeture de la modale d'aperçu (Esc)
let previewEscHandlerAttached = false;

const previewButton = document.getElementById('preview-button');
previewButton.addEventListener('click', async () => {
    // Valider les champs requis
    const requiredFields = ['name', 'birthdate', 'deathdate'];
    for (const field of requiredFields) {
        if (!form[field].value) {
            alert(`Veuillez remplir tous les champs obligatoires`);
            currentSection = 0;
            showSection(0);
            form[field].focus();
            return;
        }
    }

    // Gather timeline data - only validated items
    const timeline = [];
    document.querySelectorAll('.timeline-item').forEach(item => {
        const checkbox = item.querySelector('.timeline-checkbox');
        if (checkbox && checkbox.checked) {
            const year = item.querySelector('.timeline-year')?.value;
            const event = item.querySelector('.timeline-event')?.value;
            if (year && event) {
                timeline.push({ date: year, event: event });
            }
        }
    });
    
    // Récupérer les données textuelles
    const souvenirData = {
        name: form.name.value,
        birthdate: form.birthdate.value,
        birthplace: form.birthplace.value,
        deathdate: form.deathdate.value,
        message: form.message.value,
        anecdote: anecdoteTextarea ? anecdoteTextarea.value : '',
        selectedTraits: selectedTraits,
        timeline: timeline,
        theme: (form.querySelector('input[name="theme"]:checked')?.value) || 'elegant',
        layout: (form.querySelector('input[name="layout"]:checked')?.value) || 'classic',
        typography: (form.querySelector('input[name="typography"]:checked')?.value) || 'serif',
        quote: quoteInput ? quoteInput.value : '',
        photoCaptions: (selectedPhotoCaptions || []).slice(0, selectedPhotos.length)
    };

    // Conserver les fichiers pour l'upload (ne pas stocker dans sessionStorage)
    filesToUpload.photos = selectedPhotos;
    filesToUpload.videos = selectedVideos;

    // Préparer un payload léger pour l'aperçu (utiliser des Blob URLs plutôt que des data URLs)
    const previewObjectUrls = [];
    const previewPayload = {
        name: souvenirData.name,
        birthdate: souvenirData.birthdate,
        deathdate: souvenirData.deathdate,
        birthplace: souvenirData.birthplace,
        message: souvenirData.message,
        anecdote: souvenirData.anecdote,
        selectedTraits: souvenirData.selectedTraits,
        timeline: souvenirData.timeline,
        theme: souvenirData.theme,
        layout: souvenirData.layout,
        typography: souvenirData.typography,
        quote: souvenirData.quote,
        photoUrls: selectedPhotos.map(f => {
            const url = URL.createObjectURL(f);
            previewObjectUrls.push(url);
            return url;
        }),
        videoUrls: selectedVideos.map(f => {
            const url = URL.createObjectURL(f);
            previewObjectUrls.push(url);
            return url;
        }),
        photoCaptions: souvenirData.photoCaptions,
        bannerUrl: generatedBannerDataUrl || undefined,
        previewVideos: selectedVideos.map(file => ({
            name: file.name,
            size: Math.round(file.size / (1024 * 1024)) + ' MB'
        }))
    };
    
    // Stocker toutes les données nécessaires (sans les Blob URLs)
    let storageFailed = false;
    try {
        sessionStorage.setItem('souvenirPreviewData', JSON.stringify({
            name: souvenirData.name,
            birthdate: souvenirData.birthdate,
            birthplace: souvenirData.birthplace,
            deathdate: souvenirData.deathdate,
            message: souvenirData.message,
            anecdote: souvenirData.anecdote,
            selectedTraits: souvenirData.selectedTraits,
            timeline: souvenirData.timeline,
            theme: souvenirData.theme,
            layout: souvenirData.layout,
            typography: souvenirData.typography,
            quote: souvenirData.quote,
            photoCaptions: souvenirData.photoCaptions
        }));
    } catch (e) {
        // Sur iOS/Safari privé, le stockage peut être indisponible. On continue avec postMessage uniquement.
        console.warn('SessionStorage indisponible, utilisation du postMessage uniquement pour l\'aperçu.');
        storageFailed = true;
    }

    // Afficher la modale d'aperçu avec la nouvelle page
    const previewModal = document.getElementById('preview-modal-overlay');
    const previewContent = document.getElementById('preview-modal-content');
    
    previewModal.style.display = 'flex';
    previewContent.innerHTML = `
        <iframe id="preview-iframe" src="preview-new.html" style="width:100%;height:100%;border:none;"></iframe>
        <button onclick="closePreviewModal()" class="close-preview-btn">✕ Fermer</button>
    `;
    document.body.classList.add('modal-open');
    
    // Conserver les URLs pour nettoyage lors de confirm/edit provenant de l'iframe
    previewModal._previewObjectUrls = previewObjectUrls;

    // Envoyer le payload à l'iframe une fois chargée
    const iframe = document.getElementById('preview-iframe');
    iframe.addEventListener('load', () => {
        try {
            // Inclure la customization dans le payload
            previewPayload.customization = {
                theme: souvenirData.theme,
                layout: souvenirData.layout,
                typography: souvenirData.typography
            };
            iframe.contentWindow.postMessage({ action: 'load-preview', data: previewPayload }, window.location.origin);
        } catch (_) { /* ignore */ }
    });

    // Define closePreviewModal function globally
    window.closePreviewModal = function() {
        previewModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        previewContent.innerHTML = '';
        // Cleanup Blob URLs
        if (previewModal._previewObjectUrls) {
            previewModal._previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
            previewModal._previewObjectUrls = [];
        }
    };

    // Fermer en cliquant sur le fond
    previewModal.onclick = (e) => {
        if (e.target === previewModal) {
            window.closePreviewModal();
            // Révoquer les Blob URLs
            previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
        }
    };

    // Fermer avec la touche Échap (une seule fois)
    if (!previewEscHandlerAttached) {
        previewEscHandlerAttached = true;
        document.addEventListener('keydown', (e) => {
            const isVisible = previewModal.style.display === 'flex';
            if (isVisible && e.key === 'Escape') {
                window.closePreviewModal();
            }
        });
    }
});

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Convert data URL to File
async function dataUrlToFile(dataUrl, filename = 'enhanced.png') {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
}

// Call Netlify enhance-image function and replace photo at index
async function enhancePhotoAtIndex(index, mode = 'enhance') {
    try {
        const file = selectedPhotos[index];
        if (!file) return;
        const dataUrl = await resizeImageFileToDataUrl(file, 2048);
        const resp = await fetch('/.netlify/functions/enhance-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, imageBase64: dataUrl })
        });
        const json = await resp.json();
        if (!resp.ok) {
            console.error('Enhance API error:', json);
            // Fallback local enhancement to avoid blocking the user
            try {
                const localOut = await localEnhanceDataUrl(dataUrl, mode);
                if (localOut) {
                    const localFile = await dataUrlToFile(localOut, (file.name || 'photo') + '-enhanced-local.jpg');
                    selectedPhotos[index] = localFile;
                    updatePhotoPreview();
                    if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
                    if (typeof showToast === 'function') showToast('Amélioration locale appliquée');
                    const afterImg = document.getElementById('enhanceAfterLarge');
                    const afterPlaceholder = document.getElementById('afterPlaceholder');
                    if (afterImg) afterImg.src = localOut;
                    if (afterPlaceholder) afterPlaceholder.style.display = 'none';
                } else {
                    alert('Erreur lors du traitement de l\'image. Vérifiez la configuration API.');
                }
            } catch (e) {
                console.error('Local enhance failed:', e);
                alert('Erreur lors du traitement de l\'image. Vérifiez la configuration API.');
            }
            return;
        }
        const outBase64 = json.imageBase64; // no prefix
        const outDataUrl = 'data:image/png;base64,' + outBase64;
        const newFile = await dataUrlToFile(outDataUrl, (file.name || 'photo') + '-enhanced.png');
        // replace and refresh
        selectedPhotos[index] = newFile;
        updatePhotoPreview();
        if (typeof updatePreviewFrame === 'function') updatePreviewFrame();
        if (typeof showToast === 'function') showToast('Photo traitée avec succès');
        const afterImg = document.getElementById('enhanceAfterLarge');
        const afterPlaceholder = document.getElementById('afterPlaceholder');
        if (afterImg) afterImg.src = outDataUrl;
        if (afterPlaceholder) afterPlaceholder.style.display = 'none';
    } catch (e) {
        console.error(e);
        alert('Traitement impossible. Réessayez plus tard.');
    }
}

// Resize an image File to a max dimension (keep aspect ratio) and return dataURL jpeg
async function resizeImageFileToDataUrl(file, maxDim = 2048) {
    const src = await fileToDataUrl(file);
    // Try to load into an Image; if it fails, fallback to original
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => resolve(null);
        i.src = src;
    });
    if (!img) return src;
    const { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    if (scale >= 1) return src; // no need to resize
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Export JPEG to reduce size and ensure common mime
    return canvas.toDataURL('image/jpeg', 0.9);
}

// Écouteur pour les messages de l'iframe (aperçu)
window.addEventListener('message', async (event) => {
    // Sécurité : vérifier l'origine
    if (event.origin !== window.location.origin) return;

    if (event.data && event.data.action) {
        const previewModal = document.getElementById('preview-modal-overlay');
        const previewContent = document.getElementById('preview-modal-content');
        
        if (event.data.action === 'confirm') {
            previewModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            previewContent.innerHTML = '';
            
            // Nettoyage des Blob URLs
            if (previewModal._previewObjectUrls) {
                previewModal._previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
            }
            previewModal._previewObjectUrls = [];
            
            // S'assurer que les données sont dans sessionStorage
            if (event.data.data) {
                // Stocker les données reçues depuis l'iframe
                sessionStorage.setItem('souvenirPreviewData', JSON.stringify(event.data.data));
            }
            
            // Lancer la création finale
            handleFinalCreation();
        } else if (event.data.action === 'edit') {
            previewModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            previewContent.innerHTML = '';
            currentSection = sections.length - 1;
            showSection(currentSection);
        }
    }
    
    // Compatibilité ancienne version
    if (event.data === 'confirm-creation') {
        document.getElementById('preview-modal-overlay').style.display = 'none';
        handleFinalCreation();
    } else if (event.data === 'close-preview') {
        document.getElementById('preview-modal-overlay').style.display = 'none';
    }
});

async function handleFinalCreation() {
    loading.style.display = 'flex';
    form.style.display = 'none';
    // Use stage-based messages instead of animated loop here
    stopAnimatedLoading();
    setLoadingProgressWithMessage(5);
    
    // Vérifier que les données existent dans sessionStorage
    const storedData = sessionStorage.getItem('souvenirPreviewData');
    if (!storedData) {
        console.error('Aucune donnée de preview trouvée dans sessionStorage');
        alert('Erreur: Les données du mémorial n\'ont pas été trouvées. Veuillez retourner au formulaire.');
        loading.style.display = 'none';
        form.style.display = 'block';
        return;
    }
    
    const data = JSON.parse(storedData);

    try {
        // Ensure filesToUpload contains current files (fallbacks)
        if (!filesToUpload) {
            filesToUpload = {};
        }
        if (!Array.isArray(filesToUpload.photos) || filesToUpload.photos.length === 0) {
            const fromSelected = (Array.isArray(selectedPhotos) && selectedPhotos.length > 0) ? selectedPhotos : [];
            const fromInput = photosInput && photosInput.files ? Array.from(photosInput.files) : [];
            filesToUpload.photos = fromSelected.length ? fromSelected : fromInput;
        }
        if (!Array.isArray(filesToUpload.videos) || filesToUpload.videos.length === 0) {
            const fromSelectedV = (Array.isArray(selectedVideos) && selectedVideos.length > 0) ? selectedVideos : [];
            const fromInputV = videosInput && videosInput.files ? Array.from(videosInput.files) : [];
            filesToUpload.videos = fromSelectedV.length ? fromSelectedV : fromInputV;
        }

        // 1. Uploader les fichiers / bannière
        setLoadingStatus('', 10);
        let coverImageURL = '';
        let bannerURL = '';
        const photoURLs = [];

        // Si une bannière IA est fournie, l'utiliser comme couverture
        if (data.bannerUrl) {
            try {
                const bannerFile = await dataUrlToFile(data.bannerUrl, `banner-${Date.now()}.png`);
                const bannerRef = ref(storage, `souvenirs/${Date.now()}-banner-${bannerFile.name}`);
                await uploadBytes(bannerRef, bannerFile);
                bannerURL = await getDownloadURL(bannerRef);
                coverImageURL = bannerURL;
            } catch (e) {
                console.warn('Upload bannière échoué, fallback sur photo de couverture:', e);
            }
        }

        if (filesToUpload.photos && filesToUpload.photos.length > 0) {
            // Si on n'a pas encore de couverture (pas de bannière), prendre la 1ère photo
            if (!coverImageURL) {
                const coverFile = filesToUpload.photos[0];
                const coverRef = ref(storage, `souvenirs/${Date.now()}-cover-${coverFile.name}`);
                await uploadBytes(coverRef, coverFile);
                coverImageURL = await getDownloadURL(coverRef);
            }

            const startIdx = data.bannerUrl ? 0 : 1;
            for (let i = startIdx; i < filesToUpload.photos.length; i++) {
                const file = filesToUpload.photos[i];
                const photoRef = ref(storage, `souvenirs/${Date.now()}-gallery-${file.name}`);
                await uploadBytes(photoRef, file);
                const url = await getDownloadURL(photoRef);
                photoURLs.push(url);
                setLoadingProgressWithMessage(10 + Math.round(((i + 1) / (filesToUpload.photos.length + 1)) * 30));
            }
        }

        // Support multi-vidéos
        setLoadingProgressWithMessage(45);
        const videoURLs = [];
        if (filesToUpload.videos && filesToUpload.videos.length > 0) {
            for (const videoFile of filesToUpload.videos) {
                const videoRef = ref(storage, `souvenirs/${Date.now()}-video-${videoFile.name}`);
                await uploadBytes(videoRef, videoFile);
                const url = await getDownloadURL(videoRef);
                videoURLs.push(url);
                setLoadingProgressWithMessage(Math.min(60, (videoURLs.length * 15) + 45));
            }
        }
        // Compatibilité avec l'ancien champ
        const videoURL = videoURLs[0] || '';

        // 2. Générer l'URL temporaire du mémorial et le QR code
        setLoadingProgressWithMessage(65);
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tempSouvenirURL = `${window.location.origin}/souvenir.html?id=${tempId}`;
        
        // Générer le QR code temporaire
        const qrCodeCanvas = document.createElement('canvas');
        const qr = new QRCode(qrCodeCanvas, { 
            text: tempSouvenirURL, 
            width: 256, 
            height: 256,
            correctLevel: QRCode.CorrectLevel.H
        });
        
        // Convertir le QR code en base64
        await new Promise(resolve => setTimeout(resolve, 100)); // Attendre la génération
        const qrCodeDataURL = qrCodeCanvas.toDataURL('image/png');

        // 3. Sauvegarder sur Firestore avec toutes les données
        setLoadingProgressWithMessage(75);
        // Compute admin password hash from current form if available
        let adminPasswordHash = null;
        try {
            const ap = (document.getElementById('admin-password')?.value || '').trim();
            const apc = (document.getElementById('admin-password-confirm')?.value || '').trim();
            if (ap && ap === apc) adminPasswordHash = await sha256Hex(ap);
        } catch(_) {}

        const docRef = await addDoc(collection(db, "souvenirs"), {
            name: data.name,
            birthdate: data.birthdate,
            birthplace: data.birthplace || '',
            deathdate: data.deathdate,
            message: data.message,
            anecdote: data.anecdote || '',
            selectedTraits: data.selectedTraits || [],
            timeline: data.timeline || [],
            coverImageURL,
            bannerURL: bannerURL || null,
            photoURLs,
            photos: [...(coverImageURL ? [coverImageURL] : []), ...photoURLs], // All photos combined
            photoCaptions: Array.isArray(data.photoCaptions) ? data.photoCaptions : [],
            videoURL, // Compatibilité ancienne version
            videoURLs, // Nouveau: support multi-vidéos
            videos: videoURLs, // For new souvenir page
            theme: data.theme || 'elegant',
            layout: data.layout || 'classic',
            typography: data.typography || 'serif',
            quote: data.quote || '',
            customization: {
                theme: data.theme || 'elegant',
                layout: data.layout || 'classic',
                typography: data.typography || 'serif'
            },
            qrCodeDataURL: qrCodeDataURL, // Stocker le QR code temporaire
            qrCodeURL: tempSouvenirURL, // Stocker l'URL temporaire
            payment: { status: 'pending' }, // Marquer comme non payé initialement
            createdAt: new Date(),
            adminPasswordHash: adminPasswordHash
        });

        // 4. Mettre à jour l'URL réelle avec le vrai ID - Using new souvenir page
        const finalSouvenirURL = `${window.location.origin}/preview-new.html?id=${docRef.id}`;
        
        // Regénérer le QR code avec le bon ID
        setLoadingStatus('', 85);
        const finalQrCodeCanvas = document.createElement('canvas');
        const finalQr = new QRCode(finalQrCodeCanvas, { 
            text: finalSouvenirURL, 
            width: 256, 
            height: 256,
            correctLevel: QRCode.CorrectLevel.H
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalQrCodeDataURL = finalQrCodeCanvas.toDataURL('image/png');

        // Générer une version HD pour téléchargement
        setLoadingProgressWithMessage(90);
        const hdQrCanvas = document.createElement('canvas');
        const hdQr = new QRCode(hdQrCanvas, {
            text: finalSouvenirURL,
            width: 1024,
            height: 1024,
            correctLevel: QRCode.CorrectLevel.H
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const hdDataUrl = hdQrCanvas.toDataURL('image/png');

        // 5. Mettre à jour le document avec le bon QR code
        setLoadingStatus('', 95);
        await updateDoc(doc(db, "souvenirs", docRef.id), {
            qrCodeDataURL: finalQrCodeDataURL,
            qrCodeURL: finalSouvenirURL
        });

        // 6. Afficher le résultat avec le bon URL
        const successModal = document.getElementById('success-modal');
        const qrCodeDiv = document.getElementById('qrcode');
        const souvenirLink = document.getElementById('souvenir-link');
        const closeModalButton = document.getElementById('close-modal-button');
        const downloadBtn = document.getElementById('download-qr');
        const openBtn = document.getElementById('open-qr');
        const payNowBtn = document.getElementById('pay-now-button');

        // Ne pas afficher le QR tant que non payé
        if (qrCodeDiv) {
            qrCodeDiv.classList.add('locked');
            qrCodeDiv.innerHTML = '<div style="padding:8px; color:#777;">QR disponible après paiement</div>';
        }

        souvenirLink.href = finalSouvenirURL;
        // Désactiver le lien vers le mémorial avant paiement
        if (souvenirLink) {
            souvenirLink.style.pointerEvents = 'none';
            souvenirLink.style.opacity = '0.6';
        }
        if (downloadBtn) {
            // Ne pas définir le lien de téléchargement avant paiement
            downloadBtn.removeAttribute('href');
            downloadBtn.style.pointerEvents = 'none';
            downloadBtn.style.opacity = '0.6';
        }
        if (openBtn) {
            openBtn.onclick = () => {
                try {
                    const w = window.open(hdDataUrl, '_blank');
                    if (!w) {
                        // Fallback: transform button into a link
                        openBtn.outerHTML = `<a class="souvenir-link-button" href="${hdDataUrl}" target="_blank" rel="noopener">Ouvrir le QR (HD)</a>`;
                    }
                } catch (_) {
                    openBtn.outerHTML = `<a class="souvenir-link-button" href="${hdDataUrl}" target="_blank" rel="noopener">Ouvrir le QR (HD)</a>`;
                }
            };
        }
        if (payNowBtn) {
            payNowBtn.disabled = false;
            payNowBtn.onclick = async () => {
                try {
                    payNowBtn.disabled = true;
                    const resp = await fetch('/.netlify/functions/create-checkout-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ docId: docRef.id, origin: window.location.origin })
                    });
                    if (!resp.ok) {
                        const err = await resp.text();
                        throw new Error(err || 'Erreur lors de la création de la session de paiement');
                    }
                    const data = await resp.json();
                    if (data.url) {
                        window.location.href = data.url;
                    } else {
                        throw new Error('URL de redirection Stripe introuvable');
                    }
                } catch (e) {
                    alert('Impossible de démarrer le paiement. Réessayez.');
                    console.error(e);
                    payNowBtn.disabled = false;
                }
            };
        }
        stopAnimatedLoading();
        setLoadingProgressWithMessage(100);
        loading.style.display = 'none';
        successModal.style.display = 'flex';

        closeModalButton.addEventListener('click', () => {
            successModal.style.display = 'none';
            form.style.display = 'block';
            form.reset();
            imagePreviewContainer.innerHTML = '';
        });

        // Nettoyer
        sessionStorage.removeItem('souvenirPreviewData');
        filesToUpload = {};

        // Le succès est déjà géré par l'affichage de la modale de succès

    } catch (error) {
        console.error('Erreur lors de la création finale:', error);
        alert('Une erreur est survenue. Veuillez réessayer.');
        form.style.display = 'block'; // Réafficher le formulaire en cas d'erreur
        // L'erreur est affichée à l'utilisateur, pas besoin de communiquer avec un onglet fermé
    } finally {
        loading.style.display = 'none';
    }
}
